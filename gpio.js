// gpio.js — GPIO sensor management and race logic

const DEFAULT_GPIO_PINS = { 1: 17, 2: 27, 3: 22, 4: 23 }
const DEBOUNCE_MS = 50

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
 * Creates a sensor manager that handles GPIO inputs and race simulation.
 *
 * @param {object}   deps                - Dependencies
 * @param {object}   deps.opts           - Parsed CLI options (lanes, timeout, simulate)
 * @param {object}   deps.state          - Shared race state object (mutated in place)
 * @param {Function} deps.broadcast      - WebSocket broadcast function (type, payload?)
 * @param {Function} deps.onFirstTrigger - Called when the very first lane triggers (optional)
 * @param {Function} deps.onFinish       - Called when a heat completes (e.g. for CSV logging)
 * @returns {{ setup, arm, reset, cleanup }}
 */
function createSensorManager({ opts, state, broadcast, onFirstTrigger, onFinish }) {
  let sensors = null
  let heatTimer = null
  const triggered = new Set()

  function setup() {
    if (opts.simulate) return
    try {
      const { Gpio, configureClock } = require('pigpio')
      configureClock(1, 0) // 1μs sample rate
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
    if (state.status === 'finished') {
      state.heat++
    }
    triggered.clear()
    state.finishOrder = []
    state.status = 'armed'
    broadcast('armed')

    if (opts.simulate) {
      _simulateRace()
      return
    }

    if (!sensors) return

    for (const [lane, sensor] of Object.entries(sensors)) {
      if (parseInt(lane) > opts.lanes) continue
      sensor.on('alert', (level) => {
        if (level !== 0 || state.status !== 'armed') return // level 0 = falling edge
        _handleTrigger(parseInt(lane))
      })
    }

    heatTimer = setTimeout(() => {
      if (state.status === 'armed') _finishHeat()
    }, opts.timeout * 1000)
  }

  function reset() {
    clearTimeout(heatTimer)
    if (sensors) for (const s of Object.values(sensors)) s.removeAllListeners('alert')
    state._startTime = null
    triggered.clear()
    state.heat++
    state.finishOrder = []
    state.status = 'idle'
    broadcast('reset')
  }

  function cleanup() {
    if (sensors) for (const s of Object.values(sensors)) s.removeAllListeners('alert')
  }

  // ── Private ────────────────────────────────────────────────────────────────

  function _handleTrigger(lane) {
    if (triggered.has(lane) || state.status !== 'armed') return
    triggered.add(lane)

    const now = process.hrtime.bigint()
    const startTime = state._startTime ?? (state._startTime = now)
    const gapMs = Number(now - startTime) / 1_000_000

    state.finishOrder.push({ lane, gapMs })
    broadcast('trigger', { lane, gapMs, place: state.finishOrder.length })
    console.log(`  Lane ${lane} finished! (+${gapMs.toFixed(1)} ms)`)

    if (triggered.size === 1 && typeof onFirstTrigger === 'function') onFirstTrigger()

    if (triggered.size === opts.lanes) _finishHeat()
  }

  function _finishHeat() {
    clearTimeout(heatTimer)
    if (sensors) for (const s of Object.values(sensors)) s.removeAllListeners('alert')
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

  return { setup, arm, reset, cleanup }
}

module.exports = { createSensorManager, DEFAULT_GPIO_PINS }
