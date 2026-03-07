#!/usr/bin/env node
/**
 * Pinewood Derby Race Server
 * ==========================
 * Serves two pages:
 *   GET /          → Guest-facing display page
 *   GET /manage    → Track manager page (reset, configure lane colors)
 *
 * WebSocket broadcasts race state to all connected clients in real time.
 * Physical GPIO sensing is handled by the ESP32 sensor node (see esp32/).
 *
 * Install:
 *   npm install express ws
 *
 * Usage:
 *   node server.js
 *   node server.js --lanes 3 --simulate --port 3000
 */

const express = require('express')
const http = require('http')
const WebSocket = require('ws')
const path = require('path')
const fs = require('fs')
const { createSensorManager } = require('./gpio')

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
  }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--lanes' && args[i + 1]) opts.lanes = parseInt(args[++i])
    else if (args[i] === '--timeout' && args[i + 1])
      opts.timeout = parseFloat(args[++i])
    else if (args[i] === '--port' && args[i + 1])
      opts.port = parseInt(args[++i])
    else if (args[i] === '--simulate') opts.simulate = true
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
  laneColors: savedConfig.laneColors ?? buildDefaultColors(opts.lanes),
  numLanes: opts.lanes,
  history: [], // last 10 heats
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
  const cfg = { heat: state.heat, laneColors: state.laneColors }
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

// ── Sensor Manager ────────────────────────────────────────────────────────────

const sensorManager = createSensorManager({
  opts,
  state,
  broadcast,
  onFinish: () => logResult(),
})

// ── Express + WS ──────────────────────────────────────────────────────────────

const app = express()
app.use(express.json())

app.get('/', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'guest.html')),
)
app.get('/manage', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'manage.html')),
)

app.get('/api/state', (req, res) => res.json(state))

app.post('/api/arm', (req, res) => {
  if (state.status === 'armed')
    return res.status(400).json({ error: 'Already armed' })
  sensorManager.arm()
  res.json({ ok: true })
})

app.post('/api/reset', (req, res) => {
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
    return res.status(400).json({ error: 'Not armed' })
  const laneNum = parseInt(lane)
  if (!laneNum || laneNum < 1 || laneNum > state.numLanes)
    return res.status(400).json({ error: 'Invalid lane' })
  const tsUs = timestamp_us !== undefined ? BigInt(timestamp_us) : null
  sensorManager.triggerLane(laneNum, tsUs)
  res.json({ ok: true })
})

app.post('/api/reset-race', (req, res) => {
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

const server = http.createServer(app)
wss = new WebSocket.Server({ server })

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'init', state }))
})

initLog()

server.listen(opts.port, () => {
  console.log(`\n🏎  Pinewood Derby Server running`)
  console.log(`   Guest display : http://localhost:${opts.port}/`)
  console.log(`   Track manager : http://localhost:${opts.port}/manage`)
  console.log(
    `   Mode          : ${opts.simulate ? 'SIMULATION' : 'ESP32 SENSOR'}`,
  )
  console.log()
})

process.on('SIGINT', () => process.exit(0))
