// gpio.js — Sensor manager factory
//
// Selects between GPIO/pigpio mode (Raspberry Pi) and ESP32 HTTP mode based
// on opts.sensor.  Use --sensor gpio for direct wiring via pigpio, or
// --sensor esp32 for the ESP32 sensor node over WiFi.

const { createGpioSensorManager } = require('./sensor-gpio')
const { createEsp32SensorManager } = require('./sensor-esp32')

/**
 * Creates the appropriate sensor manager based on opts.sensor.
 *
 * @param {object} deps - Dependencies forwarded to the chosen sensor driver.
 *   deps.opts.sensor must be 'gpio' or 'esp32' (defaults to 'gpio').
 * @returns {{ setup, arm, reset, cleanup, triggerLane }}
 */
function createSensorManager(deps) {
  const mode = deps.opts.sensor || 'gpio'
  if (mode === 'gpio') {
    return createGpioSensorManager(deps)
  }
  return createEsp32SensorManager(deps)
}

module.exports = { createSensorManager }
