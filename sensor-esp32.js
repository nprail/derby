// sensor-esp32.js — ESP32 HTTP sensor driver
//
// In this mode the ESP32 sensor node records hardware timestamps with
// esp_timer_get_time() (1 µs resolution) and POSTs { lane, timestamp_us }
// to POST /api/trigger on every finish-line crossing.  The server calls
// triggerLane() with those values; gapMs is computed from timestamp
// differences so WiFi latency has no effect on recorded finish times.

const { createBaseManager } = require('./sensor')

/**
 * Creates an ESP32-backed sensor manager.
 *
 * @param {object}   deps                - Dependencies (same shape as createBaseManager)
 * @param {object}   deps.opts           - Must include opts.lanes, opts.timeout, opts.simulate
 * @returns {{ setup, arm, reset, cleanup, triggerLane }}
 */
function createEsp32SensorManager(deps) {
  const { opts } = deps

  const base = createBaseManager(deps)

  function setup() {
    // No hardware initialization needed — the ESP32 connects over WiFi.
  }

  function arm() {
    base.armBase()

    if (opts.simulate) {
      base.simulateRace()
      return
    }

    base.startHeatTimer()
  }

  function reset() {
    base.resetBase()
  }

  function cleanup() {
    // No teardown needed for ESP32 mode.
  }

  return { setup, arm, reset, cleanup, triggerLane: base.triggerLane }
}

module.exports = { createEsp32SensorManager }
