# 🏎 Pinewood Derby Race Server

A real-time race timing and display system for Pinewood Derby events. An ESP32 sensor node reads the finish-line sensors with hardware-interrupt precision, and a Node.js server manages race state and broadcasts live results to any number of connected displays over WebSocket.

---

## Features

- **Live leaderboard** — guest display auto-updates the moment each car crosses the line
- **Track manager** — arm sensors, reset heats, and configure lane colors from any browser
- **Microsecond-accurate timing** — ESP32 hardware interrupts (`esp_timer_get_time()`) record timestamps before any network call; WiFi latency has zero effect on results
- **Simulation mode** — develop and demo without any hardware
- **CSV logging** — every heat result is appended to `derby_results.csv`
- **Configurable lane count** — supports 1–4 lanes out of the box (extend `LANE_PINS` in the ESP32 sketch for more)

---

## Requirements

**Node.js server**

| Dependency | Version |
|---|---|
| Node.js | ≥ 18 |
| express | ^4.18 |
| ws | ^8 |

**ESP32 sensor node** (Arduino libraries)

| Library | Version |
|---|---|
| ArduinoJson *(Benoit Blanchon)* | ^6.21 |

---

## Installation

```bash
git clone https://github.com/nprail/derby.git
cd derby
npm install
```

---

## Usage

```bash
# Standard run (GPIO mode, 4 lanes, port 3000)
npm start

# Simulation mode (no hardware required)
npm run simulate

# Custom options
node server.js --lanes 3 --port 8080 --timeout 10
node server.js --simulate --lanes 2
```

### CLI Flags

| Flag | Default | Description |
|---|---|---|
| `--lanes <n>` | `4` | Number of racing lanes |
| `--port <n>` | `3000` | HTTP server port |
| `--timeout <s>` | `8` | Seconds before a heat auto-finishes if not all lanes trigger |
| `--simulate` | off | Use simulated race results instead of GPIO |

---

## Pages

| URL | Description |
|---|---|
| `http://localhost:3000/` | **Guest display** — full-screen live results, designed for a projector or TV |
| `http://localhost:3000/manage` | **Track manager** — arm/reset controls and lane color configuration |

### Guest Display (`/`)

![Guest display showing live race results with color-coded lane cards](docs/screenshots/guest.png)

### Track Manager (`/manage`)

![Track manager showing arm/reset controls, lane color configuration, and heat results](docs/screenshots/manage.png)

---

## REST API

All endpoints return JSON.

### `GET /api/state`
Returns the current race state object.

```json
{
  "heat": 3,
  "status": "finished",
  "finishOrder": [
    { "lane": 2, "gapMs": 0 },
    { "lane": 4, "gapMs": 47.3 },
    { "lane": 1, "gapMs": 112.8 },
    { "lane": 3, "gapMs": 201.5 }
  ],
  "laneColors": { "1": "Red", "2": "Blue", "3": "Yellow", "4": "Green" },
  "numLanes": 4,
  "history": [ ... ]
}
```

### `POST /api/arm`
Arms the sensors and starts the heat. Returns `400` if already armed.

```json
{ "ok": true }
```

### `POST /api/reset`
Clears results and advances to the next heat number.

```json
{ "ok": true }
```

### `POST /api/trigger`
Called by the ESP32 sensor node when a car crosses the finish line. `timestamp_us` is the raw `esp_timer_get_time()` value from the ESP32, sent as a string to preserve 64-bit precision. The server computes `gapMs` from the difference between trigger timestamps, so WiFi latency has no effect on results. Returns `400` if the race is not armed or the lane is invalid.

```json
// Request body
{ "lane": 2, "timestamp_us": "3482910" }

// Response
{ "ok": true }
```

### `POST /api/colors`
Updates one or more lane colors.

```json
// Request body
{ "colors": { "1": "Purple", "3": "Orange" } }

// Response
{ "ok": true }
```

---

## WebSocket Events

Connect to `ws://localhost:3000`. Every message is a JSON object that always includes the full `state` snapshot alongside the event-specific fields.

| `type` | Extra fields | Description |
|---|---|---|
| `init` | — | Sent immediately on connection with current state |
| `armed` | — | Sensors have been armed, heat is starting |
| `trigger` | `lane`, `gapMs`, `place` | A car crossed the finish line |
| `finished` | — | All cars finished (or timeout elapsed) |
| `reset` | — | Heat was reset; `state.heat` incremented |
| `colors` | — | Lane colors were updated |

**Example client:**
```js
const ws = new WebSocket('ws://localhost:3000')
ws.onmessage = (e) => {
  const { type, state } = JSON.parse(e.data)
  console.log(type, state.finishOrder)
}
```

---

## Hardware Setup

The system has two components:

1. **Node.js server** — runs on any machine (laptop, Pi, etc.) on the local network. See [docs/SETUP.md](docs/SETUP.md) for installation and systemd auto-start.
2. **ESP32 sensor node** — reads the finish-line sensors and POSTs timing data to the server. See [docs/SETUP.md](docs/SETUP.md#part-2--esp32-sensor-node) for flashing instructions.

### Default ESP32 Pin Mapping

| Lane | ESP32 GPIO |
|------|------------|
| 1    | GPIO 25    |
| 2    | GPIO 26    |
| 3    | GPIO 32    |
| 4    | GPIO 33    |

To change pin assignments, edit `LANE_PINS` in [`esp32/derby_sensor/derby_sensor.ino`](esp32/derby_sensor/derby_sensor.ino).

For full wiring details and sensor circuit diagrams, see [docs/WIRING.md](docs/WIRING.md).

---

## CSV Log

Results are appended to `derby_results.csv` in the project directory after each heat.

```
date,time,heat,1st,2nd,3rd,4th,gap_2nd_ms,gap_3rd_ms,gap_4th_ms
2026-03-06,14:23:01,1,2,4,1,3,47.3,112.8,201.5
2026-03-06,14:25:44,2,3,1,2,4,18.1,95.2,340.0
```

---

## Lane Colors

Eight colors are available. Configure them per-lane from the `/manage` page.

`Red` · `Blue` · `Yellow` · `Green` · `Purple` · `Orange` · `Pink` · `White`

---

## Project Structure

```
derby/
├── server.js          # HTTP server, WebSocket, API routes, race state, CSV logging
├── gpio.js            # Race state management and simulation logic
├── esp32/
│   ├── platformio.ini # PlatformIO build config
│   └── derby_sensor/
│       └── derby_sensor.ino  # ESP32 sketch: ISR timing + WiFi reporting
├── public/
│   ├── guest.html     # Guest-facing live results display
│   └── manage.html    # Track manager UI
├── docs/
│   ├── SETUP.md       # Server + ESP32 setup guide
│   └── WIRING.md      # ESP32 pin mapping and sensor circuit
├── derby_results.csv  # Auto-created on first run
└── package.json
```
