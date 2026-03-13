// sensor-esp32.js — ESP32 HTTP sensor driver
//
// In this mode the ESP32 sensor node records hardware timestamps with
// esp_timer_get_time() (1 µs resolution) and POSTs { lane, timestamp_us }
// to POST /api/trigger on every finish-line crossing.  The server calls
// triggerLane() with those values; gapMs is computed from timestamp
// differences so WiFi latency has no effect on recorded finish times.

const { BaseSensor } = require('./sensor')

/**
 * ESP32-backed sensor driver.  No hardware initialisation is required;
 * triggers arrive via the POST /api/trigger HTTP endpoint.
 */
class Esp32Sensor extends BaseSensor {
  /** Nothing to initialise — the ESP32 connects over WiFi. */
  setup() {}

  /** Nothing to tear down for ESP32 mode. */
  cleanup() {}

  /** Start the heat timeout; triggers will arrive over HTTP. */
  _onArm() {
    this._startHeatTimer()
  }
}

module.exports = { Esp32Sensor }
