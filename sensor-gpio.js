// sensor-gpio.js — Raspberry Pi GPIO / pigpio sensor driver
//
// Uses the pigpio library to watch finish-line IR sensors wired to GPIO pins.
// Each falling edge on a lane pin is treated as a finish-line crossing; the
// server measures elapsed time with process.hrtime.bigint().

const { BaseSensor } = require('./sensor')

const DEFAULT_GPIO_PINS = { 1: 17, 2: 27, 3: 22, 4: 23 }
const DEBOUNCE_MS = 50

/**
 * GPIO-backed sensor driver.  Extends BaseSensor with pigpio hardware lifecycle.
 */
class GpioSensor extends BaseSensor {
  constructor(deps) {
    super(deps)
    this._sensors = null
  }

  /** Initialise pigpio and configure a Gpio input for each active lane. */
  setup() {
    if (this._opts.simulate) return
    try {
      const { Gpio, configureClock } = require('pigpio')
      configureClock(1, 0) // 1 µs sample rate
      const newSensors = {}
      const pins = Object.fromEntries(
        Object.entries(DEFAULT_GPIO_PINS).filter(
          ([l]) => parseInt(l) <= this._opts.lanes,
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
      this._sensors = newSensors
    } catch (err) {
      console.warn('GPIO unavailable:', err.message, '— use --simulate')
    }
  }

  /** Detach all GPIO alert listeners and release resources. */
  cleanup() {
    this._removeListeners()
  }

  /** Attach GPIO alert listeners and start the heat timer. */
  _onArm() {
    if (!this._sensors) return

    for (const [lane, sensor] of Object.entries(this._sensors)) {
      if (parseInt(lane) > this._opts.lanes) continue
      sensor.on('alert', (level) => {
        if (level !== 0) return // level 0 = falling edge (finish crossing)
        this.triggerLane(parseInt(lane))
      })
    }

    this._startHeatTimer()
  }

  /** Detach listeners before clearing heat state on reset. */
  _onReset() {
    this._removeListeners()
  }

  /** Detach listeners when a heat finishes naturally. */
  _onHeatEnd() {
    this._removeListeners()
  }

  _removeListeners() {
    if (this._sensors) {
      for (const s of Object.values(this._sensors)) s.removeAllListeners('alert')
    }
  }
}

module.exports = { GpioSensor, DEFAULT_GPIO_PINS }
