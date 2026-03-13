// sensor.js — Base sensor class with shared race-state management logic
//
// This module contains the generic race logic used by all sensor drivers.
// It does not depend on any hardware library.  Subclasses (GpioSensor,
// Esp32Sensor) override the hardware lifecycle hooks.

function _sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function _shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * Base class with shared race state logic.  Subclasses override the hardware
 * lifecycle methods (setup, cleanup) and the arm/reset/heatEnd hooks.
 *
 * @param {object}   opts                - Parsed CLI options (lanes, timeout, simulate)
 * @param {object}   state               - Shared race state object (mutated in place)
 * @param {Function} broadcast           - WebSocket broadcast function (type, payload?)
 * @param {Function} [onFirstTrigger]    - Called when the very first lane triggers
 * @param {Function} onFinish            - Called when a heat completes (e.g. for CSV logging)
 */
class BaseSensor {
  constructor({ opts, state, broadcast, onFirstTrigger, onFinish }) {
    this._opts = opts
    this._state = state
    this._broadcast = broadcast
    this._onFirstTrigger = onFirstTrigger
    this._onFinish = onFinish
    this._heatTimer = null
    this._triggered = new Set()
  }

  // ── Lifecycle (subclasses override) ────────────────────────────────────────

  /** Initialise hardware resources (called once at server startup). */
  setup() {}

  /** Release hardware resources (called on SIGINT). */
  cleanup() {}

  /**
   * Hook called by arm() after state is updated and before the heat timer
   * starts.  Subclasses use this to attach hardware listeners.
   */
  _onArm() {
    this._startHeatTimer()
  }

  /** Hook called at the very start of reset() before state is cleared. */
  _onReset() {}

  /** Hook called inside _finishHeat() before the 'finished' broadcast.
   *  Subclasses use this to detach hardware listeners. */
  _onHeatEnd() {}

  // ── Public API ─────────────────────────────────────────────────────────────

  arm() {
    if (this._state.status === 'finished') this._state.heat++
    this._triggered.clear()
    this._state.finishOrder = []
    this._state.status = 'armed'
    this._broadcast('armed')

    if (this._opts.simulate) {
      this._simulateRace()
      return
    }

    this._onArm()
  }

  reset() {
    this._onReset()
    this._clearHeatTimer()
    this._state._startTime = null
    this._triggered.clear()
    this._state.finishOrder = []
    this._state.status = 'idle'
    this._broadcast('reset')
  }

  // timestampUs: BigInt µs value (e.g. from esp_timer_get_time() on the ESP32).
  // Falls back to server-side hrtime when null (simulate / GPIO mode).
  triggerLane(lane, timestampUs = null) {
    if (this._triggered.has(lane) || this._state.status !== 'armed') return
    this._triggered.add(lane)

    let gapMs
    if (timestampUs !== null) {
      const ref =
        this._state._startTime ?? (this._state._startTime = timestampUs)
      gapMs = Number(timestampUs - ref) / 1000
    } else {
      const now = process.hrtime.bigint()
      const startTime =
        this._state._startTime ?? (this._state._startTime = now)
      gapMs = Number(now - startTime) / 1_000_000
    }

    this._state.finishOrder.push({ lane, gapMs })
    this._broadcast('trigger', { lane, gapMs, place: this._state.finishOrder.length })
    console.log(`  Lane ${lane} finished! (+${gapMs.toFixed(1)} ms)`)

    if (this._triggered.size === 1 && typeof this._onFirstTrigger === 'function') {
      this._onFirstTrigger()
    }

    if (this._triggered.size === this._opts.lanes) this._finishHeat()
  }

  // ── Private ────────────────────────────────────────────────────────────────

  _finishHeat() {
    this._clearHeatTimer()
    this._onHeatEnd()
    this._state._startTime = null
    this._state.status = 'finished'

    this._state.history.unshift({
      heat: this._state.heat,
      finishOrder: [...this._state.finishOrder],
    })
    if (this._state.history.length > 10) this._state.history.pop()

    this._onFinish()
    this._broadcast('finished')
    console.log(
      `Heat ${this._state.heat} complete. Winner: Lane ${this._state.finishOrder[0]?.lane}`,
    )
  }

  _startHeatTimer() {
    this._heatTimer = setTimeout(() => {
      if (this._state.status === 'armed') this._finishHeat()
    }, this._opts.timeout * 1000)
  }

  _clearHeatTimer() {
    clearTimeout(this._heatTimer)
  }

  async _simulateRace() {
    await _sleep(1500)
    const lanes = _shuffle(
      Array.from({ length: this._opts.lanes }, (_, i) => i + 1),
    )
    this._state._startTime = process.hrtime.bigint()
    for (let i = 0; i < lanes.length; i++) {
      const delay = i === 0 ? 0 : Math.random() * 300 + 30
      await _sleep(delay)
      this.triggerLane(lanes[i])
    }
  }
}

module.exports = { BaseSensor }
