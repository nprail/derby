'use strict'
const fs = require('fs')

const CONFIG_FILE = 'derby_config.json'
const EVENT_FILE = 'derby_event.json'
const DEFAULT_TIMEOUT = 8

const DEFAULT_EVENT = {
  name: '',
  date: '',
  scheduleMode: 'roundRobin',
  lanesPerHeat: 4,
  runsPerHeat: 1,
  heatWinnerLogic: 'fastestRun',
  laneRotation: 'none',
  divisionMode: 'none',
  tiebreakerRule: 'fastestRun',
  pointsTable: 'standard',
  customPointsTable: null,
  bracketVisibility: 'currentHeat',
  bracketLocked: false,
  status: 'setup',
}

function buildDefaultColors(n) {
  const defaults = ['Red', 'Blue', 'Yellow', 'Green']
  const out = {}
  for (let i = 1; i <= n; i++) out[i] = defaults[i - 1] ?? `Lane ${i}`
  return out
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
    }
  } catch (e) {
    console.warn('Could not load config file:', e.message)
  }
  return {}
}

function loadEvent() {
  try {
    if (fs.existsSync(EVENT_FILE)) {
      return JSON.parse(fs.readFileSync(EVENT_FILE, 'utf8'))
    }
  } catch (e) {
    console.warn('Could not load event file:', e.message)
  }
  return {}
}

const savedConfig = loadConfig()

const state = {
  heat: savedConfig.heat ?? 1,
  status: 'idle', // idle | armed | finished
  finishOrder: [], // [{ lane, gapMs }]
  laneColors: savedConfig.laneColors ?? buildDefaultColors(savedConfig.numLanes ?? 4),
  numLanes: savedConfig.numLanes ?? 4,
  timeout: savedConfig.timeout ?? DEFAULT_TIMEOUT,
  history: [], // last 10 heats
  videoUrl: null, // URL of the latest heat recording, or null
  videoReplayEnabled: savedConfig.videoReplayEnabled ?? true, // show replay on guest display
  zcamEnabled: !!(savedConfig.zcamIp), // whether ZCam integration is active
  zcamIp: savedConfig.zcamIp ?? null, // IP address of the ZCam, or null
  sensorMode: savedConfig.sensorMode ?? 'simulate', // 'gpio' | 'esp32' | 'simulate'
}

const savedEvent = loadEvent()

const eventState = {
  event: { ...DEFAULT_EVENT, ...(savedEvent.event || {}) },
  racers: savedEvent.racers || [],
  divisions: savedEvent.divisions || [],
  bracket: savedEvent.bracket || null,
  heatQueue: savedEvent.heatQueue || [],
  heatResults: savedEvent.heatResults || {},
  leaderboard: savedEvent.leaderboard || [],
  adminCode: savedEvent.adminCode || null,
  trackOfficialCode: savedEvent.trackOfficialCode || null,
}

function saveConfig() {
  const cfg = {
    heat: state.heat,
    laneColors: state.laneColors,
    numLanes: state.numLanes,
    timeout: state.timeout,
    videoReplayEnabled: state.videoReplayEnabled,
    zcamIp: state.zcamIp ?? null,
    sensorMode: state.sensorMode,
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2))
}

function saveEvent() {
  const data = {
    event: eventState.event,
    racers: eventState.racers,
    divisions: eventState.divisions,
    bracket: eventState.bracket,
    heatQueue: eventState.heatQueue,
    heatResults: eventState.heatResults,
    leaderboard: eventState.leaderboard,
    adminCode: eventState.adminCode,
    trackOfficialCode: eventState.trackOfficialCode,
  }
  fs.writeFileSync(EVENT_FILE, JSON.stringify(data, null, 2))
}

function getActiveRacers() {
  return eventState.racers.filter((r) => r.active !== false)
}

function getCurrentHeat() {
  if (!eventState.bracket) return null
  for (const round of eventState.bracket.rounds) {
    for (const heat of round.heats) {
      if (heat.status === 'active') return heat
    }
  }
  for (const round of eventState.bracket.rounds) {
    for (const heat of round.heats) {
      if (heat.status === 'pending') return heat
    }
  }
  return null
}

function findHeat(heatId) {
  if (!eventState.bracket) return null
  for (const round of eventState.bracket.rounds) {
    const heat = round.heats.find((h) => h.id === heatId)
    if (heat) return heat
  }
  return null
}

const POINTS_TABLES = {
  standard: [10, 7, 5, 3, 2, 1],
  generous: [12, 10, 8, 6, 4, 2],
  participation: [5, 4, 3, 2, 1, 1],
  winnerTakeAll: [10, 0, 0, 0, 0, 0],
}

function computeLeaderboard() {
  const { scheduleMode, heatWinnerLogic, pointsTable, customPointsTable } = eventState.event
  const points = customPointsTable || POINTS_TABLES[pointsTable] || POINTS_TABLES.standard
  const racerStats = {}

  // Init all active racers
  for (const r of eventState.racers) {
    if (r.active !== false) {
      racerStats[r.id] = { racerId: r.id, points: 0, wins: 0, heatsRaced: 0, bestTime: null, times: [] }
    }
  }

  // Accumulate results
  for (const [heatId, heatData] of Object.entries(eventState.heatResults)) {
    const runs = heatData.runs || []
    const sorted = [...runs].sort((a, b) => {
      if (a.place != null && b.place != null) return a.place - b.place
      if (a.time != null && b.time != null) return a.time - b.time
      return 0
    })

    sorted.forEach((run, placeIdx) => {
      const heat = findHeat(heatId)
      if (!heat) return
      const laneEntry = heat.lanes.find((l) => l.lane === run.lane)
      if (!laneEntry || !laneEntry.racerId) return

      const rid = laneEntry.racerId
      if (!racerStats[rid]) return

      const pts = points[placeIdx] ?? 0
      racerStats[rid].points += pts
      racerStats[rid].heatsRaced += 1
      if (placeIdx === 0) racerStats[rid].wins += 1
      if (run.time != null) {
        racerStats[rid].times.push(run.time)
        if (racerStats[rid].bestTime === null || run.time < racerStats[rid].bestTime) {
          racerStats[rid].bestTime = run.time
        }
      }
    })
  }

  // Build leaderboard
  const board = Object.values(racerStats)
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      if (a.bestTime !== null && b.bestTime !== null) return a.bestTime - b.bestTime
      if (a.bestTime !== null) return -1
      if (b.bestTime !== null) return 1
      return 0
    })
    .map((stats, idx) => {
      const racer = eventState.racers.find((r) => r.id === stats.racerId)
      return {
        rank: idx + 1,
        racerId: stats.racerId,
        name: racer?.name || '',
        carName: racer?.carName || '',
        carNumber: racer?.carNumber || '',
        division: racer?.division || null,
        points: stats.points,
        wins: stats.wins,
        heatsRaced: stats.heatsRaced,
        bestTime: stats.bestTime,
        avgTime: stats.times.length
          ? stats.times.reduce((a, b) => a + b, 0) / stats.times.length
          : null,
      }
    })

  eventState.leaderboard = board
}

module.exports = {
  state,
  eventState,
  saveConfig,
  saveEvent,
  getActiveRacers,
  getCurrentHeat,
  computeLeaderboard,
  findHeat,
}
