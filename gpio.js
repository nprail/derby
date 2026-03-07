// gpio.js — Race state management
//
// Physical GPIO sensing is handled entirely by the ESP32 sensor node.
// The ESP32 records hardware timestamps (esp_timer_get_time, 1 µs resolution)
// and POSTs { lane, timestamp_us } on every trigger.  The server computes
// gapMs = (timestamp_i − timestamp_0) / 1000 from those values, so timing
// accuracy is determined by the ESP32 clock — not network latency.

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
 * Creates a sensor manager that tracks race state.
 *
 * @param {object}   deps            - Dependencies
 * @param {object}   deps.opts       - Parsed CLI options (lanes, timeout, simulate)
 * @param {object}   deps.state      - Shared race state object (mutated in place)
 * @param {Function} deps.broadcast  - WebSocket broadcast function (type, payload?)
 * @param {Function} deps.onFinish   - Called when a heat completes (e.g. for CSV logging)
 * @returns {{ arm, reset, triggerLane }}
 */
function createSensorManager({ opts, state, broadcast, onFinish }) {
  let heatTimer = null
  const triggered = new Set()

  function arm() {
    triggered.clear()
    state.finishOrder = []
    state.status = 'armed'
    broadcast('armed')

    if (opts.simulate) {
      _simulateRace()
      return
    }

    heatTimer = setTimeout(() => {
      if (state.status === 'armed') _finishHeat()
    }, opts.timeout * 1000)
  }

  function reset() {
    clearTimeout(heatTimer)
    state._startTime = null
    triggered.clear()
    state.heat++
    state.finishOrder = []
    state.status = 'idle'
    broadcast('reset')
  }

  // ── Private ────────────────────────────────────────────────────────────────

  // timestampUs: BigInt µs value from esp_timer_get_time() on the ESP32.
  // The server computes gapMs relative to the first trigger's timestamp so
  // that timing accuracy depends only on the ESP32 hardware clock.
  // Falls back to server-side hrtime in --simulate mode.
  function _handleTrigger(lane, timestampUs = null) {
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

    if (triggered.size === opts.lanes) _finishHeat()
  }

  function _finishHeat() {
    clearTimeout(heatTimer)
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

  async function _simulateRace() {
    await sleep(1500)
    const lanes = shuffle(Array.from({ length: opts.lanes }, (_, i) => i + 1))
    state._startTime = process.hrtime.bigint()
    for (let i = 0; i < lanes.length; i++) {
      const delay = i === 0 ? 0 : Math.random() * 300 + 30
      await sleep(delay)
      _handleTrigger(lanes[i])
    }
  }

  return { arm, reset, triggerLane: _handleTrigger }
}

module.exports = { createSensorManager }
