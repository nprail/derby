'use strict'
const express = require('express')

module.exports = function sensorRouter({ state, broadcast, saveConfig, getSensorManager, initZCam, initSensorManager }) {
  const router = express.Router()

  router.post('/arm', (req, res) => {
    if (state.status === 'armed')
      return res.status(400).json({ error: 'Already armed' })
    getSensorManager().arm()
    res.json({ ok: true })
  })

  router.post('/reset', (req, res) => {
    state.videoUrl = null
    getSensorManager().reset()
    res.json({ ok: true })
  })

  // Called by the ESP32 sensor node on every finish-line trigger.
  // { lane: number, timestamp_us: string }  — timestamp_us is the raw
  // esp_timer_get_time() value sent as a string to preserve 64-bit precision.
  // The server computes gapMs from the difference between trigger timestamps,
  // so WiFi latency has no effect on race results.
  router.post('/trigger', (req, res) => {
    const { lane, timestamp_us } = req.body
    if (state.status !== 'armed')
      return res.json({ ok: true, ignored: true, reason: 'Not armed' })
    const laneNum = parseInt(lane)
    if (!laneNum || laneNum < 1 || laneNum > state.numLanes)
      return res.status(400).json({ error: 'Invalid lane' })
    const tsUs = timestamp_us !== undefined ? BigInt(timestamp_us) : null
    getSensorManager().triggerLane(laneNum, tsUs)
    res.json({ ok: true })
  })

  router.post('/clear-display', (req, res) => {
    state.videoUrl = null
    broadcast('clear')
    res.json({ ok: true })
  })

  router.post('/reset-race', (req, res) => {
    state.videoUrl = null
    getSensorManager().reset()
    state.heat = 1
    state.history = []
    saveConfig()
    broadcast('reset')
    res.json({ ok: true })
  })

  router.post('/settings', (req, res) => {
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

  return router
}
