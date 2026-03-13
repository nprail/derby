// sensor.js — Shared race-state management logic
//
// This module contains the generic race logic used by all sensor drivers.
// It does not depend on any hardware library.  Sensor-specific drivers
// (sensor-gpio.js, sensor-esp32.js) wrap this with their own setup/teardown.

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * Creates the base sensor manager with shared race state logic.
 *
 * @param {object}   deps                - Dependencies
 * @param {object}   deps.opts           - Parsed CLI options (lanes, timeout, simulate)
 * @param {object}   deps.state          - Shared race state object (mutated in place)
 * @param {Function} deps.broadcast      - WebSocket broadcast function (type, payload?)
 * @param {Function} [deps.onFirstTrigger] - Called when the very first lane triggers
 * @param {Function} deps.onFinish       - Called when a heat completes (e.g. for CSV logging)
 * @param {Function} [deps.onHeatEnd]    - Called inside _finishHeat before broadcasting;
 *                                         sensor drivers use this to detach listeners.
 * @returns {{ armBase, resetBase, startHeatTimer, clearHeatTimer, triggerLane, simulateRace }}
 */
function createBaseManager({
  opts,
  state,
  broadcast,
  onFirstTrigger,
  onFinish,
  onHeatEnd,
}) {
  let heatTimer = null
  const triggered = new Set()

  function armBase() {
    if (state.status === 'finished') {
      state.heat++
    }
    triggered.clear()
    state.finishOrder = []
    state.status = 'armed'
    broadcast('armed')
  }

  function resetBase() {
    clearHeatTimer()
    state._startTime = null
    triggered.clear()
    state.finishOrder = []
    state.status = 'idle'
    broadcast('reset')
  }

  function startHeatTimer() {
    heatTimer = setTimeout(() => {
      if (state.status === 'armed') _finishHeat()
    }, opts.timeout * 1000)
  }

  function clearHeatTimer() {
    clearTimeout(heatTimer)
  }

  // timestampUs: BigInt µs value (e.g. from esp_timer_get_time() on the ESP32).
  // Falls back to server-side hrtime when null (simulate / GPIO mode).
  function triggerLane(lane, timestampUs = null) {
    if (triggered.has(lane) || state.status !== 'armed') return
    triggered.add(lane)

    let gapMs
    if (timestampUs !== null) {
      const ref = state._startTime ?? (state._startTime = timestampUs)
      gapMs = Number(timestampUs - ref) / 1000
    } else {
      const now = process.hrtime.bigint()
      const startTime = state._startTime ?? (state._startTime = now)
      gapMs = Number(now - startTime) / 1_000_000
    }

    state.finishOrder.push({ lane, gapMs })
    broadcast('trigger', { lane, gapMs, place: state.finishOrder.length })
    console.log(`  Lane ${lane} finished! (+${gapMs.toFixed(1)} ms)`)

    if (triggered.size === 1 && typeof onFirstTrigger === 'function') {
      onFirstTrigger()
    }

    if (triggered.size === opts.lanes) _finishHeat()
  }

  function _finishHeat() {
    clearHeatTimer()
    if (typeof onHeatEnd === 'function') onHeatEnd()
    state._startTime = null
    state.status = 'finished'

    state.history.unshift({
      heat: state.heat,
      finishOrder: [...state.finishOrder],
    })
    if (state.history.length > 10) state.history.pop()

    onFinish()
    broadcast('finished')
    console.log(
      `Heat ${state.heat} complete. Winner: Lane ${state.finishOrder[0]?.lane}`,
    )
  }

  async function simulateRace() {
    await sleep(1500)
    const lanes = shuffle(Array.from({ length: opts.lanes }, (_, i) => i + 1))
    state._startTime = process.hrtime.bigint()
    for (let i = 0; i < lanes.length; i++) {
      const delay = i === 0 ? 0 : Math.random() * 300 + 30
      await sleep(delay)
      triggerLane(lanes[i])
    }
  }

  return {
    armBase,
    resetBase,
    startHeatTimer,
    clearHeatTimer,
    triggerLane,
    simulateRace,
  }
}

module.exports = { createBaseManager }
