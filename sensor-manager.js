// sensor-manager.js — Sensor manager factory
//
// Instantiates the appropriate sensor class based on opts.sensor.
// Use --sensor gpio for direct Raspberry Pi GPIO wiring via pigpio, or
// --sensor esp32 for the ESP32 sensor node that reports over HTTP.

const { GpioSensor } = require('./sensor-gpio')
const { Esp32Sensor } = require('./sensor-esp32')

/**
 * Instantiates and returns the appropriate sensor driver.
 *
 * @param {object} deps - Constructor arguments forwarded to the chosen sensor class.
 *   deps.opts.sensor must be 'gpio' or 'esp32' (defaults to 'gpio').
 * @returns {BaseSensor} A sensor instance with setup/arm/reset/cleanup/triggerLane.
 */
function createSensorManager(deps) {
  const mode = deps.opts.sensor || 'gpio'
  if (mode === 'gpio') {
    return new GpioSensor(deps)
  }
  return new Esp32Sensor(deps)
}

module.exports = { createSensorManager }
