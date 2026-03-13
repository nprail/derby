#!/usr/bin/env node
/**
 * Pinewood Derby Race Server
 * ==========================
 * Serves two pages:
 *   GET /          → Guest-facing display page
 *   GET /manage    → Track manager page (reset, configure lane colors)
 *
 * WebSocket broadcasts race state to all connected clients in real time.
 * Sensor mode (gpio / esp32 / simulate), ZCam IP, and all other settings
 * are configured via the Track Manager page and persisted in derby_config.json.
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

// ── Config ────────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT = 8
const LOG_FILE = 'derby_results.csv'
const CONFIG_FILE = 'derby_config.json'

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
  const msg = JSON.stringify({ type, ...payload, state: publicState })
  if (!wss) return
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(msg)
  }
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

const server = http.createServer(app)
wss = new WebSocket.Server({ server })

wss.on('connection', (ws) => {
  const { _startTime, ...publicState } = state
  ws.send(JSON.stringify({ type: 'init', state: publicState }))
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
