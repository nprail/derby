#!/usr/bin/env node
/**
 * Pinewood Derby Race Server
 * ==========================
 * Serves two pages:
 *   GET /          → Guest-facing display page
 *   GET /manage    → Track manager page (reset, configure lane colors)
 *
 * WebSocket broadcasts race state to all connected clients in real time.
 * Physical sensing is handled either by Raspberry Pi GPIO (pigpio, --sensor gpio)
 * or by an ESP32 sensor node that timestamps triggers in hardware and reports
 * them over HTTP (--sensor esp32, see esp32/).
 *
 * Install:
 *   npm install
 *
 * Usage:
 *   node server.js --sensor gpio
 *   node server.js --sensor esp32
 *   node server.js --lanes 3 --simulate --port 3000
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
    lanes: 4,
    timeout: DEFAULT_TIMEOUT,
    simulate: false,
    port: 3000,
    sensor: 'gpio', // 'gpio' | 'esp32'
    zcamIp: null,
    _sensorExplicit: false,
    _simulateExplicit: false,
  }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--lanes' && args[i + 1]) opts.lanes = parseInt(args[++i])
    else if (args[i] === '--timeout' && args[i + 1])
      opts.timeout = parseFloat(args[++i])
    else if (args[i] === '--port' && args[i + 1])
      opts.port = parseInt(args[++i])
    else if (args[i] === '--simulate') {
      opts.simulate = true
      opts._simulateExplicit = true
    } else if (args[i] === '--sensor' && args[i + 1]) {
      opts.sensor = args[++i]
      opts._sensorExplicit = true
    } else if (args[i] === '--zcam' && args[i + 1]) opts.zcamIp = args[++i]
  }
  return opts
}

// Resolve sensor mode: explicit CLI flags beat saved config, which beats defaults.
function computeSensorMode(opts, savedConfig) {
  if (opts._simulateExplicit) return 'simulate'
  if (opts._sensorExplicit) return opts.sensor
  return savedConfig.sensorMode ?? (opts.simulate ? 'simulate' : opts.sensor)
}

// ── Race State ────────────────────────────────────────────────────────────────

const opts = parseArgs()

const savedConfig = loadConfig()

let state = {
  heat: savedConfig.heat ?? 1,
  status: 'idle', // idle | armed | finished
  finishOrder: [], // [{ lane, gapMs }]
  laneColors: savedConfig.laneColors ?? buildDefaultColors(opts.lanes),
  numLanes: opts.lanes,
  history: [], // last 10 heats
  videoUrl: null, // URL of the latest heat recording, or null
  videoReplayEnabled: savedConfig.videoReplayEnabled ?? true, // show replay on guest display
  zcamEnabled: !!(opts.zcamIp ?? savedConfig.zcamIp), // whether ZCam integration is active
  zcamIp: opts.zcamIp ?? savedConfig.zcamIp ?? null, // IP address of the ZCam, or null
  sensorMode: computeSensorMode(opts, savedConfig), // 'gpio' | 'esp32' | 'simulate'
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
  opts.simulate = state.sensorMode === 'simulate'
  opts.sensor = state.sensorMode === 'simulate' ? 'gpio' : state.sensorMode
  sensorManager = createSensorManager({
    opts,
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

app.post('/api/colors', (req, res) => {
  const { colors } = req.body
  if (!colors) return res.status(400).json({ error: 'Missing colors' })
  state.laneColors = { ...state.laneColors, ...colors }
  saveConfig()
  broadcast('colors')
  res.json({ ok: true })
})

app.post('/api/settings', (req, res) => {
  const { videoReplayEnabled } = req.body
  if (typeof videoReplayEnabled !== 'boolean') {
    return res
      .status(400)
      .json({ error: 'Missing or invalid videoReplayEnabled' })
  }
  state.videoReplayEnabled = videoReplayEnabled
  saveConfig()
  broadcast('settings')
  res.json({ ok: true })
})

app.post('/api/zcam', (req, res) => {
  const { ip } = req.body
  if (ip !== null && ip !== undefined && typeof ip !== 'string') {
    return res.status(400).json({ error: 'ip must be a string or null' })
  }
  initZCam(ip || null)
  saveConfig()
  broadcast('settings')
  res.json({ ok: true, zcamEnabled: state.zcamEnabled, zcamIp: state.zcamIp })
})

app.post('/api/sensor', (req, res) => {
  const { mode } = req.body
  if (!['gpio', 'esp32', 'simulate'].includes(mode)) {
    return res
      .status(400)
      .json({ error: 'mode must be gpio, esp32, or simulate' })
  }
  if (state.status === 'armed') {
    return res
      .status(400)
      .json({ error: 'Cannot change sensor mode while armed' })
  }
  state.sensorMode = mode
  saveConfig()
  initSensorManager()
  broadcast('settings')
  res.json({ ok: true, sensorMode: state.sensorMode })
})

const server = http.createServer(app)
wss = new WebSocket.Server({ server })

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'init', state }))
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
  if (opts.zcamIp) {
    console.log(`   ZCam E2M4     : http://${opts.zcamIp}`)
  }
  console.log()
})

process.on('SIGINT', () => {
  if (sensorManager) sensorManager.cleanup()
  process.exit(0)
})
