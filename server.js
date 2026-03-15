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

const {
  state,
  eventState,
  saveConfig,
  saveEvent,
  getActiveRacers,
  getCurrentHeat,
  computeLeaderboard,
  findHeat,
} = require('./state')

// ── Config ────────────────────────────────────────────────────────────────────

const LOG_FILE = 'derby_results.csv'

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

const opts = parseArgs()

// ── Logging ───────────────────────────────────────────────────────────────────

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

function getSensorManager() {
  return sensorManager
}

// ── Express + WS ──────────────────────────────────────────────────────────────

const app = express()
app.use(express.json())

app.get('/api/state', (req, res) => res.json(state))

// ── Route modules ─────────────────────────────────────────────────────────────

const routeDeps = {
  state,
  eventState,
  broadcast,
  requireAdmin,
  saveConfig,
  saveEvent,
  getActiveRacers,
  getCurrentHeat,
  computeLeaderboard,
  findHeat,
  getSensorManager,
  initZCam,
  initSensorManager,
  generateRoundRobin,
  generateSingleElim,
  generateDoubleElim,
  generatePoints,
}

app.use('/api', require('./routes/sensor')(routeDeps))
app.use('/api', require('./routes/event')(routeDeps))
app.use('/api', require('./routes/racers')(routeDeps))
app.use('/api', require('./routes/divisions')(routeDeps))
app.use('/api', require('./routes/bracket')(routeDeps))
app.use('/api', require('./routes/heats')(routeDeps))
app.use('/api', require('./routes/leaderboard')(routeDeps))
app.use('/api', require('./routes/access')(routeDeps))

// Static file serving after API routes to avoid unnecessary filesystem checks on API calls
app.use('/videos', express.static(path.join(__dirname, 'public', 'videos')))
app.get('/', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'guest.html')),
)
app.get('/manage', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'manage.html')),
)
app.get('/admin', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'admin.html')),
)
app.use(express.static(path.join(__dirname, 'public')))

// ── WebSocket Server ──────────────────────────────────────────────────────────

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
