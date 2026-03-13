// sensor-gpio.js — Raspberry Pi GPIO / pigpio sensor driver
//
// Uses the pigpio library to watch finish-line IR sensors wired to GPIO pins.
// Each falling edge on a lane pin is treated as a finish-line crossing; the
// server measures elapsed time with process.hrtime.bigint().

const { createBaseManager } = require('./sensor')

const DEFAULT_GPIO_PINS = { 1: 17, 2: 27, 3: 22, 4: 23 }
const DEBOUNCE_MS = 50

/**
 * Creates a GPIO-backed sensor manager.
 *
 * @param {object}   deps                - Dependencies (same shape as createBaseManager)
 * @param {object}   deps.opts           - Must include opts.lanes, opts.timeout, opts.simulate
 * @returns {{ setup, arm, reset, cleanup, triggerLane }}
 */
function createGpioSensorManager(deps) {
  const { opts } = deps
  let sensors = null

  const base = createBaseManager({
    ...deps,
    onHeatEnd: _removeListeners,
  })

  function setup() {
    if (opts.simulate) return
    try {
      const { Gpio, configureClock } = require('pigpio')
      configureClock(1, 0) // 1 µs sample rate
      const newSensors = {}
      const pins = Object.fromEntries(
        Object.entries(DEFAULT_GPIO_PINS).filter(
          ([l]) => parseInt(l) <= opts.lanes,
        ),
      )
      for (const [lane, pin] of Object.entries(pins)) {
        const s = new Gpio(pin, {
          mode: Gpio.INPUT,
          pullUpDown: Gpio.PUD_UP,
          alert: true,
        })
        s.glitchFilter(DEBOUNCE_MS * 1000) // pigpio uses microseconds
        newSensors[lane] = s
        console.log(`  Lane ${lane} → GPIO ${pin}`)
      }
      sensors = newSensors
    } catch (err) {
      console.warn('GPIO unavailable:', err.message, '— use --simulate')
    }
  }

  function arm() {
    base.armBase()

    if (opts.simulate) {
      base.simulateRace()
      return
    }

    if (!sensors) return

    for (const [lane, sensor] of Object.entries(sensors)) {
      if (parseInt(lane) > opts.lanes) continue
      sensor.on('alert', (level) => {
        if (level !== 0) return // level 0 = falling edge (finish crossing)
        base.triggerLane(parseInt(lane))
      })
    }

    base.startHeatTimer()
  }

  function reset() {
    _removeListeners()
    base.resetBase()
  }

  function cleanup() {
    _removeListeners()
  }

  function _removeListeners() {
    if (sensors) {
      for (const s of Object.values(sensors)) s.removeAllListeners('alert')
    }
  }

  return { setup, arm, reset, cleanup, triggerLane: base.triggerLane }
}

module.exports = { createGpioSensorManager, DEFAULT_GPIO_PINS }
