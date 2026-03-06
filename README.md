# 🏎 Pinewood Derby Race Server

A real-time race timing and display server for Pinewood Derby events. Runs on a Raspberry Pi (or any machine), reads finish-line GPIO sensors, and broadcasts live results to any number of connected displays over WebSocket.

---

## Features

- **Live leaderboard** — guest display auto-updates the moment each car crosses the line
- **Track manager** — arm sensors, reset heats, and configure lane colors from any browser
- **Millisecond-accurate timing** — uses `process.hrtime.bigint()` for high-resolution gaps
- **Simulation mode** — develop and demo without any hardware
- **CSV logging** — every heat result is appended to `derby_results.csv`
- **Configurable lane count** — supports 1–4 lanes out of the box (extend `DEFAULT_GPIO_PINS` in `gpio.js` for more)

---

## Requirements

| Dependency | Version |
|---|---|
| Node.js | ≥ 18 |
| express | ^4.18 |
| ws | ^8 |
| onoff | ^6 *(Raspberry Pi GPIO only)* |

---

## Installation

```bash
git clone <repo>
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

## Hardware Setup (Raspberry Pi)

For a full Raspberry Pi setup walkthrough (Node.js installation, GPIO permissions, systemd auto-start), see [docs/SETUP.md](docs/SETUP.md).

### Default GPIO Pin Mapping

| Lane | BCM Pin |
|---|---|
| 1 | GPIO 17 |
| 2 | GPIO 27 |
| 3 | GPIO 22 |
| 4 | GPIO 23 |

To change pin assignments, edit `DEFAULT_GPIO_PINS` in [`gpio.js`](gpio.js).

### Wiring

Each finish-line sensor should pull the GPIO pin **low** (falling edge) when triggered:

```
3.3V ──[sensor]── GPIO pin
                       │
                    10kΩ pull-up (or use internal)
                       │
                      GND
```

The server uses `onoff` with a **50 ms debounce** to ignore noise.

For full connector and wiring details, see [docs/WIRING.md](docs/WIRING.md).

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
├── server.js        # HTTP server, WebSocket, API routes, race state, CSV logging
├── gpio.js          # GPIO sensor management, race timing, simulation
├── public/
│   ├── guest.html   # Guest-facing live results display (React)
│   └── manage.html  # Track manager UI (React)
├── docs/
│   ├── SETUP.md     # Raspberry Pi setup guide
│   └── WIRING.md    # 2×5 IDC connector wiring guide
├── derby_results.csv  # Auto-created on first run
└── package.json
```
