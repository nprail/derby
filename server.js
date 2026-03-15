#!/usr/bin/env node
/**
 * Pinewood Derby Race Server
 * ==========================
 * Serves pages:
 *   GET /          → Guest-facing display page
 *   GET /manage    → Track manager page (reset, configure lane colors)
 *   GET /admin     → Race Manager admin page
 *
 * WebSocket broadcasts race state to all connected clients in real time.
 * Sensor mode (gpio / esp32 / simulate), ZCam IP, and all other settings
 * are configured via the Track Manager page and persisted in derby_config.json.
 * Event/racer/bracket data is persisted in derby_event.json.
 *
 * Install:
 *   npm install
 *
 * Usage:
 *   node server.js
 *   node server.js --port 3000
 */

const express = require('express')
const http = require('http')
const WebSocket = require('ws')
const path = require('path')
const fs = require('fs')
const { createSensorManager } = require('./sensor-manager')
const { createZCamManager } = require('./zcam')
const {
  generateRoundRobin,
  generateSingleElim,
  generateDoubleElim,
  generatePoints,
} = require('./bracket')

// ── Config ────────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT = 8
const LOG_FILE = 'derby_results.csv'
const CONFIG_FILE = 'derby_config.json'
const EVENT_FILE = 'derby_event.json'

// ── Arg Parsing ───────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  const opts = {
    port: 3000,
  }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1])
      opts.port = parseInt(args[++i])
  }
  return opts
}

// ── Race State ────────────────────────────────────────────────────────────────

const opts = parseArgs()

const savedConfig = loadConfig()

let state = {
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

// ── Event State & Persistence ─────────────────────────────────────────────────

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

function getActiveRacers() {
  return eventState.racers.filter((r) => r.active !== false)
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

const savedEvent = loadEvent()

let eventState = {
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

function initLog() {
  if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(
      LOG_FILE,
      'date,time,heat,1st,2nd,3rd,4th,gap_2nd_ms,gap_3rd_ms,gap_4th_ms\n',
    )
  }
}

function logResult() {
  const now = new Date()
  const date = now.toISOString().split('T')[0]
  const time = now.toTimeString().split(' ')[0]
  const places = [...state.finishOrder, {}, {}, {}, {}]
    .slice(0, 4)
    .map((e) => e.lane ?? '')
  const gaps = state.finishOrder
    .slice(1, 4)
    .map((e) => e.gapMs?.toFixed(1) ?? '')
  while (gaps.length < 3) gaps.push('')
  fs.appendFileSync(
    LOG_FILE,
    [date, time, state.heat, ...places, ...gaps].join(',') + '\n',
  )
  saveConfig()
}

// ── WebSocket Broadcast ───────────────────────────────────────────────────────

let wss
function broadcast(type, payload = {}) {
  const { _startTime, ...publicState } = state
  const eventSummary = {
    eventName: eventState.event.name,
    eventStatus: eventState.event.status,
    racerCount: getActiveRacers().length,
    leaderboard: eventState.leaderboard.slice(0, 10),
    currentHeat: getCurrentHeat(),
  }
  const msg = JSON.stringify({
    type,
    ...payload,
    state: publicState,
    event: eventSummary,
  })
  if (!wss) return
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(msg)
  }
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

// ── ZCam ──────────────────────────────────────────────────────────────────────

let zcam = null

function initZCam(ip) {
  if (zcam) {
    zcam.disconnect().catch(() => {})
    zcam = null
  }
  const cleanIp = ip ? String(ip).trim() : null
  if (!cleanIp) {
    state.zcamEnabled = false
    state.zcamIp = null
    return
  }
  zcam = createZCamManager({
    cameraIp: cleanIp,
    videoDir: path.join(__dirname, 'public', 'videos'),
  })
  state.zcamEnabled = true
  state.zcamIp = cleanIp
  console.log(`ZCam E2M4 integration enabled — camera at ${cleanIp}`)
  zcam.setup().catch((err) => console.error('ZCam: setup failed:', err.message))
}

initZCam(state.zcamIp)

// ── Sensor Manager ────────────────────────────────────────────────────────────

let sensorManager = null

function initSensorManager() {
  if (sensorManager) {
    try {
      sensorManager.cleanup()
    } catch (err) {
      console.error('Sensor cleanup error:', err.message)
    }
  }
  const sensorOpts = {
    ...opts,
    lanes: state.numLanes,
    timeout: state.timeout,
    simulate: state.sensorMode === 'simulate',
    sensor: state.sensorMode === 'simulate' ? 'gpio' : state.sensorMode,
  }
  sensorManager = createSensorManager({
    opts: sensorOpts,
    state,
    broadcast,
    onFirstTrigger: () => {
      if (zcam) zcam.startRecording()
    },
    onFinish: () => {
      logResult()
      if (zcam) {
        setTimeout(
          () =>
            zcam
              .stopAndFetchVideo(state.heat)
              .then((url) => {
                if (url) {
                  state.videoUrl = url
                  if (state.videoReplayEnabled) {
                    broadcast('video', { videoUrl: url })
                  }
                }
              })
              .catch((err) => {
                console.error('ZCam: video fetch error:', err.message)
              }),
          500,
        )
      }
    },
  })
  sensorManager.setup()
}

// ── Express + WS ──────────────────────────────────────────────────────────────

const app = express()
app.use(express.json())

app.get('/', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'guest.html')),
)
app.get('/manage', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'manage.html')),
)
app.get('/admin', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'admin.html')),
)
app.use('/videos', express.static(path.join(__dirname, 'public', 'videos')))

app.get('/api/state', (req, res) => res.json(state))

app.post('/api/arm', (req, res) => {
  if (state.status === 'armed')
    return res.status(400).json({ error: 'Already armed' })
  sensorManager.arm()
  res.json({ ok: true })
})

app.post('/api/reset', (req, res) => {
  state.videoUrl = null
  sensorManager.reset()
  res.json({ ok: true })
})

// Called by the ESP32 sensor node on every finish-line trigger.
// { lane: number, timestamp_us: string }  — timestamp_us is the raw
// esp_timer_get_time() value sent as a string to preserve 64-bit precision.
// The server computes gapMs from the difference between trigger timestamps,
// so WiFi latency has no effect on race results.
app.post('/api/trigger', (req, res) => {
  const { lane, timestamp_us } = req.body
  if (state.status !== 'armed')
    return res.json({ ok: true, ignored: true, reason: 'Not armed' })
  const laneNum = parseInt(lane)
  if (!laneNum || laneNum < 1 || laneNum > state.numLanes)
    return res.status(400).json({ error: 'Invalid lane' })
  const tsUs = timestamp_us !== undefined ? BigInt(timestamp_us) : null
  sensorManager.triggerLane(laneNum, tsUs)
  res.json({ ok: true })
})

app.post('/api/clear-display', (req, res) => {
  state.videoUrl = null
  broadcast('clear')
  res.json({ ok: true })
})

app.post('/api/reset-race', (req, res) => {
  state.videoUrl = null
  sensorManager.reset()
  state.heat = 1
  state.history = []
  saveConfig()
  broadcast('reset')
  res.json({ ok: true })
})

app.post('/api/settings', (req, res) => {
  const { colors, videoReplayEnabled, numLanes, timeout, zcamIp, sensorMode } = req.body

  if (state.status === 'armed' && (numLanes !== undefined || sensorMode !== undefined)) {
    return res.status(400).json({ error: 'Cannot change lane count or sensor mode while armed' })
  }
  if (colors !== undefined) {
    if (typeof colors !== 'object' || colors === null)
      return res.status(400).json({ error: 'colors must be an object' })
    state.laneColors = { ...state.laneColors, ...colors }
  }
  if (videoReplayEnabled !== undefined) {
    if (typeof videoReplayEnabled !== 'boolean')
      return res.status(400).json({ error: 'videoReplayEnabled must be a boolean' })
    state.videoReplayEnabled = videoReplayEnabled
  }
  if (numLanes !== undefined) {
    if (!Number.isInteger(numLanes) || numLanes < 1 || numLanes > 8)
      return res.status(400).json({ error: 'numLanes must be an integer between 1 and 8' })
    state.numLanes = numLanes
  }
  if (timeout !== undefined) {
    if (typeof timeout !== 'number' || timeout <= 0)
      return res.status(400).json({ error: 'timeout must be a positive number' })
    state.timeout = timeout
  }
  if (zcamIp !== undefined) {
    if (zcamIp !== null && typeof zcamIp !== 'string')
      return res.status(400).json({ error: 'zcamIp must be a string or null' })
    initZCam(zcamIp || null)
  }
  if (sensorMode !== undefined) {
    if (!['gpio', 'esp32', 'simulate'].includes(sensorMode))
      return res.status(400).json({ error: 'sensorMode must be gpio, esp32, or simulate' })
    state.sensorMode = sensorMode
  }

  saveConfig()
  if (sensorMode !== undefined) initSensorManager()
  broadcast('settings')
  res.json({ ok: true })
})

// ── Access Control Middleware ─────────────────────────────────────────────────

function requireAdmin(req, res, next) {
  if (!eventState.adminCode) return next() // no code set → open access
  const provided =
    req.headers['x-admin-code'] ||
    (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '')
  if (provided !== eventState.adminCode)
    return res.status(403).json({ error: 'Admin code required' })
  next()
}

// ── Event Config API ──────────────────────────────────────────────────────────

app.get('/api/event', (req, res) => res.json(eventState.event))

app.post('/api/event', requireAdmin, (req, res) => {
  const allowed = [
    'name', 'date', 'scheduleMode', 'lanesPerHeat', 'runsPerHeat',
    'heatWinnerLogic', 'laneRotation', 'divisionMode', 'tiebreakerRule',
    'pointsTable', 'customPointsTable', 'bracketVisibility', 'status',
  ]
  for (const key of allowed) {
    if (req.body[key] !== undefined) eventState.event[key] = req.body[key]
  }
  saveEvent()
  broadcast('event')
  res.json(eventState.event)
})

// ── Racers API ────────────────────────────────────────────────────────────────

app.get('/api/racers', (req, res) => res.json(eventState.racers))

app.post('/api/racers', requireAdmin, (req, res) => {
  const { name, carName, carNumber, division, seed, notes } = req.body
  if (!name || typeof name !== 'string' || !name.trim())
    return res.status(400).json({ error: 'Name is required' })
  const racer = {
    id: crypto.randomUUID(),
    name: name.trim(),
    carName: (carName || '').trim(),
    carNumber: (carNumber || '').toString().trim(),
    division: division || null,
    seed: seed != null ? Number(seed) : null,
    notes: (notes || '').trim(),
    active: true,
  }
  eventState.racers.push(racer)
  saveEvent()
  broadcast('racers')
  res.status(201).json(racer)
})

app.put('/api/racers/:id', requireAdmin, (req, res) => {
  const idx = eventState.racers.findIndex((r) => r.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'Racer not found' })
  const allowed = ['name', 'carName', 'carNumber', 'division', 'seed', 'notes', 'active']
  const updated = { ...eventState.racers[idx] }
  for (const key of allowed) {
    if (req.body[key] !== undefined) updated[key] = req.body[key]
  }
  eventState.racers[idx] = updated
  saveEvent()
  broadcast('racers')
  res.json(updated)
})

app.delete('/api/racers/:id', requireAdmin, (req, res) => {
  const idx = eventState.racers.findIndex((r) => r.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'Racer not found' })
  eventState.racers.splice(idx, 1)
  saveEvent()
  broadcast('racers')
  res.json({ ok: true })
})

// ── Divisions API ─────────────────────────────────────────────────────────────

app.get('/api/divisions', (req, res) => res.json(eventState.divisions))

app.post('/api/divisions', requireAdmin, (req, res) => {
  const { name, color, description } = req.body
  if (!name || typeof name !== 'string' || !name.trim())
    return res.status(400).json({ error: 'Name is required' })
  const division = {
    id: crypto.randomUUID(),
    name: name.trim(),
    color: color || '#ffffff',
    description: (description || '').trim(),
  }
  eventState.divisions.push(division)
  saveEvent()
  res.status(201).json(division)
})

app.put('/api/divisions/:id', requireAdmin, (req, res) => {
  const idx = eventState.divisions.findIndex((d) => d.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'Division not found' })
  const allowed = ['name', 'color', 'description']
  const updated = { ...eventState.divisions[idx] }
  for (const key of allowed) {
    if (req.body[key] !== undefined) updated[key] = req.body[key]
  }
  eventState.divisions[idx] = updated
  saveEvent()
  res.json(updated)
})

app.delete('/api/divisions/:id', requireAdmin, (req, res) => {
  const idx = eventState.divisions.findIndex((d) => d.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'Division not found' })
  eventState.divisions.splice(idx, 1)
  saveEvent()
  res.json({ ok: true })
})

// ── Bracket API ───────────────────────────────────────────────────────────────

app.get('/api/bracket', (req, res) => res.json(eventState.bracket))

app.post('/api/bracket/generate', requireAdmin, (req, res) => {
  if (eventState.event.bracketLocked)
    return res.status(400).json({ error: 'Bracket is locked' })

  const activeRacers = getActiveRacers()
  if (activeRacers.length < 2)
    return res.status(400).json({ error: 'Need at least 2 active racers' })

  const { scheduleMode, lanesPerHeat } = eventState.event
  let bracket

  switch (scheduleMode) {
    case 'singleElim':
      bracket = generateSingleElim(activeRacers, lanesPerHeat)
      break
    case 'doubleElim':
      bracket = generateDoubleElim(activeRacers, lanesPerHeat)
      break
    case 'points':
      bracket = generatePoints(activeRacers, lanesPerHeat, 3)
      break
    default:
      bracket = generateRoundRobin(activeRacers, lanesPerHeat)
  }

  eventState.bracket = bracket
  eventState.heatQueue = []
  eventState.heatResults = {}
  // Build heat queue from bracket
  for (const round of bracket.rounds) {
    for (const heat of round.heats) {
      eventState.heatQueue.push(heat.id)
    }
  }
  eventState.event.status = 'bracketGenerated'
  saveEvent()
  broadcast('bracket')
  res.json(bracket)
})

app.post('/api/bracket/regenerate', requireAdmin, (req, res) => {
  if (eventState.event.bracketLocked)
    return res.status(400).json({ error: 'Bracket is locked. Unlock first.' })

  eventState.bracket = null
  eventState.heatQueue = []
  eventState.heatResults = {}
  eventState.event.status = 'registration'
  saveEvent()
  broadcast('bracket')
  res.json({ ok: true })
})

app.post('/api/bracket/lock', requireAdmin, (req, res) => {
  if (!eventState.bracket)
    return res.status(400).json({ error: 'No bracket to lock' })
  eventState.event.bracketLocked = true
  saveEvent()
  res.json({ ok: true })
})

app.post('/api/bracket/unlock', requireAdmin, (req, res) => {
  eventState.event.bracketLocked = false
  saveEvent()
  res.json({ ok: true })
})

app.post('/api/bracket/swap', requireAdmin, (req, res) => {
  if (eventState.event.bracketLocked)
    return res.status(400).json({ error: 'Bracket is locked' })

  const { heat1Id, lane1, heat2Id, lane2 } = req.body
  if (!heat1Id || !lane1 || !heat2Id || !lane2)
    return res.status(400).json({ error: 'heat1Id, lane1, heat2Id, and lane2 are required.' })

  const heat1 = findHeat(heat1Id)
  const heat2 = findHeat(heat2Id)
  if (!heat1 || !heat2) return res.status(404).json({ error: 'Heat not found' })

  const l1 = heat1.lanes.find((l) => l.lane === Number(lane1))
  const l2 = heat2.lanes.find((l) => l.lane === Number(lane2))
  if (!l1 || !l2) return res.status(404).json({ error: 'Lane not found' })

  const tmp = l1.racerId
  l1.racerId = l2.racerId
  l2.racerId = tmp

  saveEvent()
  broadcast('bracket')
  res.json({ ok: true })
})

function findHeat(heatId) {
  if (!eventState.bracket) return null
  for (const round of eventState.bracket.rounds) {
    const heat = round.heats.find((h) => h.id === heatId)
    if (heat) return heat
  }
  return null
}

// ── Race Management API ───────────────────────────────────────────────────────

app.post('/api/heats/:heatId/start', requireAdmin, (req, res) => {
  const heat = findHeat(req.params.heatId)
  if (!heat) return res.status(404).json({ error: 'Heat not found' })
  if (heat.status !== 'pending')
    return res.status(400).json({ error: 'Heat is not pending' })

  // Mark any previously active heat as pending again (only one active at a time)
  if (eventState.bracket) {
    for (const round of eventState.bracket.rounds) {
      for (const h of round.heats) {
        if (h.status === 'active') h.status = 'pending'
      }
    }
  }

  heat.status = 'active'
  eventState.event.status = 'racing'
  saveEvent()
  broadcast('heatStarted', { heatId: heat.id })
  res.json({ ok: true, heat })
})

app.post('/api/heats/:heatId/result', requireAdmin, (req, res) => {
  const heat = findHeat(req.params.heatId)
  if (!heat) return res.status(404).json({ error: 'Heat not found' })

  const { runs } = req.body // [{ lane, time, place }]
  if (!Array.isArray(runs))
    return res.status(400).json({ error: 'runs must be an array' })

  heat.status = 'completed'
  heat.result = { runs, completedAt: new Date().toISOString() }
  eventState.heatResults[heat.id] = { runs, result: heat.result }

  computeLeaderboard()
  saveEvent()
  broadcast('heatResult', { heatId: heat.id })
  res.json({ ok: true, heat })
})

app.post('/api/heats/:heatId/rerun', requireAdmin, (req, res) => {
  const heat = findHeat(req.params.heatId)
  if (!heat) return res.status(404).json({ error: 'Heat not found' })
  heat.status = 'pending'
  heat.result = null
  delete eventState.heatResults[heat.id]
  computeLeaderboard()
  saveEvent()
  broadcast('heatRerun', { heatId: heat.id })
  res.json({ ok: true })
})

app.post('/api/heats/:heatId/skip', requireAdmin, (req, res) => {
  const heat = findHeat(req.params.heatId)
  if (!heat) return res.status(404).json({ error: 'Heat not found' })
  heat.status = 'skipped'
  saveEvent()
  broadcast('bracket')
  res.json({ ok: true })
})

// ── Leaderboard API ───────────────────────────────────────────────────────────

app.get('/api/leaderboard', (req, res) => res.json(eventState.leaderboard))

/**
 * Points table definitions.
 * Each table maps finish place (0-based) to points awarded.
 */
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

// ── Access Control API ────────────────────────────────────────────────────────

app.post('/api/access/set-codes', requireAdmin, (req, res) => {
  const { adminCode, trackOfficialCode } = req.body
  if (adminCode !== undefined) eventState.adminCode = adminCode || null
  if (trackOfficialCode !== undefined) eventState.trackOfficialCode = trackOfficialCode || null
  saveEvent()
  res.json({ ok: true })
})

app.post('/api/access/verify', (req, res) => {
  const { code } = req.body
  if (!code) return res.json({ role: 'spectator' })
  if (eventState.adminCode && code === eventState.adminCode)
    return res.json({ role: 'admin' })
  if (eventState.trackOfficialCode && code === eventState.trackOfficialCode)
    return res.json({ role: 'trackOfficial' })
  res.json({ role: 'spectator' })
})

// ── Export API ────────────────────────────────────────────────────────────────

app.get('/api/export/csv', (req, res) => {
  const rows = ['Rank,Car #,Name,Car Name,Division,Points,Wins,Heats Raced,Best Time (s)']
  for (const entry of eventState.leaderboard) {
    rows.push(
      [
        entry.rank,
        entry.carNumber,
        `"${entry.name}"`,
        `"${entry.carName}"`,
        `"${entry.division || ''}"`,
        entry.points,
        entry.wins,
        entry.heatsRaced,
        entry.bestTime != null ? entry.bestTime.toFixed(4) : '',
      ].join(','),
    )
  }
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', 'attachment; filename="derby_leaderboard.csv"')
  res.send(rows.join('\n'))
})

const server = http.createServer(app)
wss = new WebSocket.Server({ server })

wss.on('connection', (ws) => {
  const { _startTime, ...publicState } = state
  const eventSummary = {
    eventName: eventState.event.name,
    eventStatus: eventState.event.status,
    racerCount: getActiveRacers().length,
    leaderboard: eventState.leaderboard.slice(0, 10),
    currentHeat: getCurrentHeat(),
  }
  ws.send(JSON.stringify({ type: 'init', state: publicState, event: eventSummary }))
})

initLog()
initSensorManager()

server.listen(opts.port, () => {
  const sensorModeLabel =
    state.sensorMode === 'simulate'
      ? 'SIMULATION'
      : state.sensorMode === 'gpio'
        ? 'GPIO (pigpio)'
        : 'ESP32 SENSOR'
  console.log(`\n🏎  Pinewood Derby Server running`)
  console.log(`   Guest display : http://localhost:${opts.port}/`)
  console.log(`   Track manager : http://localhost:${opts.port}/manage`)
  console.log(`   Race admin    : http://localhost:${opts.port}/admin`)
  console.log(`   Mode          : ${sensorModeLabel}`)
  if (state.zcamIp) {
    console.log(`   ZCam E2M4     : http://${state.zcamIp}`)
  }
  console.log()
})

process.on('SIGINT', () => {
  if (sensorManager) sensorManager.cleanup()
  process.exit(0)
})
