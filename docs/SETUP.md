# Setup Guide

This guide covers everything needed to run the Pinewood Derby system: a Node.js server (runs on any machine on the local network) and an ESP32 sensor node that handles all finish-line GPIO sensing.

---

## Architecture

```
Finish-line sensors
        │  (falling-edge interrupt)
        ▼
   ESP32 sensor node          ← records µs-accurate timestamps via hardware ISR
        │  POST /api/trigger  ← sends { lane, timestamp_us } over WiFi
        ▼
   Node.js server             ← computes gapMs from timestamps, manages race state, serves web UI
        │  WebSocket
        ▼
   Browser (guest / manage)
```

The ESP32 sends the raw `esp_timer_get_time()` value with each trigger. The server computes `gapMs = (timestamp_i − timestamp_0) / 1000` from those values, so timing accuracy is determined by the ESP32 hardware clock — WiFi latency has no effect on race results.

---

## Part 1 — Node.js Server

### 1. Install Node.js ≥ 18

Download from [nodejs.org](https://nodejs.org/) or use a version manager


### 2. Clone and Install

```bash
git clone https://github.com/nprail/derby.git derby
cd derby
npm install
```

### 3. Test with Simulation Mode

Before connecting any hardware, verify everything works:

```bash
npm run simulate
```

Open `http://localhost:3000/` — you should see the guest display and live simulated heat results.

### 4. Run in Live Mode

```bash
npm start
```

### Available CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--lanes N` | `4` | Number of race lanes |
| `--timeout N` | `8` | Seconds to wait before auto-finishing a heat |
| `--port N` | `3000` | HTTP/WebSocket port |
| `--simulate` | off | Run with simulated sensor events (no hardware needed) |
| `--zcam <ip>` | off | Enable ZCam E2M4 video integration at the given IP |

The server starts two pages and a WebSocket endpoint:

| URL | Description |
|-----|-------------|
| `http://localhost:3000/` | Guest-facing finish-line display |
| `http://localhost:3000/manage` | Track manager (arm, reset, configure lanes) |

The server listens for ESP32 trigger events on `POST /api/trigger` and broadcasts results to all connected browsers via WebSocket.

### 5. Auto-Start on Boot (systemd)

Create a service file so the server starts automatically after a reboot:

```bash
sudo nano /etc/systemd/system/derby.service
```

Paste the following (adjust `WorkingDirectory` and `User` to match your setup):

```ini
[Unit]
Description=Pinewood Derby Race Server
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/derby
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable derby
sudo systemctl start derby
sudo systemctl status derby
```

View logs at any time with:

```bash
journalctl -u derby -f
```

---

## Part 2 — ESP32 Sensor Node

The ESP32 sketch lives in `esp32/derby_sensor/derby_sensor.ino`. It can be built with the Arduino IDE or PlatformIO.

### Option A — Arduino IDE

1. Install [Arduino IDE 2](https://www.arduino.cc/en/software)
2. Add ESP32 board support: **File → Preferences → Additional boards manager URLs** →
   `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
3. **Tools → Board → ESP32 Arduino → ESP32 Dev Module**
4. Install the library via **Sketch → Include Library → Manage Libraries**:
   - `ArduinoJson` by Benoit Blanchon
5. Open `esp32/derby_sensor/derby_sensor.ino`
6. Edit the configuration section at the top of the file:
   ```cpp
   #define WIFI_SSID      "YOUR_WIFI_SSID"
   #define WIFI_PASSWORD  "YOUR_WIFI_PASSWORD"
   #define SERVER_HOST    "192.168.1.100"  // IP of the machine running server.js
   #define SERVER_PORT    3000
   ```
7. Select the correct **Port** and click **Upload**

### Option B — PlatformIO

```bash
cd esp32
pio run --target upload
pio device monitor   # view serial output
```

### Wiring the sensors

See [WIRING.md](WIRING.md) for the full ESP32 pinout and sensor circuit.

---

## Part 3 — ZCam E2M4 Integration (Optional)

The server can automatically record each heat and replay the clip on the guest display. A ZCam E2M4 must be on the same network as the server.

### Setup

1. Connect the ZCam to the same WiFi network as the server.
2. Note the camera's IP address (visible on the camera's LCD or from your router).
3. Start the server with the `--zcam` flag:

```bash
node server.js --zcam 192.168.1.50
```

Replace `192.168.1.50` with the actual IP of your ZCam.

### How it works

- When the **first lane triggers**, the server calls the ZCam HTTP API to start recording.
- When the **heat finishes**, the server stops recording and downloads the new clip from the camera's SD card.
- The clip is saved to `public/videos/` and served at `/videos/<filename>`.
- The guest display automatically plays back the clip after each heat (if video replay is enabled).

Video replay can be toggled from the **Track Manager** page at `/manage`. The setting is saved to `derby_config.json` and persists across restarts.

### Troubleshooting

- Confirm the camera is reachable: `curl http://<camera-ip>/ctrl/session`
- Check the server console — ZCam errors are logged with the `ZCam:` prefix.
- Clip download may take up to 30 seconds; the server polls the camera until the new file appears.

---

## Part 3 — ZCam E2M4 Integration (Optional)

The server can automatically record each heat and replay the clip on the guest display. A ZCam E2M4 must be on the same network as the server.

### Setup

1. Connect the ZCam to the same WiFi network as the server.
2. Note the camera's IP address (visible on the camera's LCD or from the router).
3. Start the server with the `--zcam` flag:

```bash
npm start -- --zcam 192.168.1.50
```

Replace `192.168.1.50` with the actual IP of your ZCam.

### How it works

- When the **first lane triggers**, the server calls the ZCam HTTP API to start recording.
- When the **heat finishes**, the server stops recording and downloads the clip from the camera's SD card.
- The clip is saved to `public/videos/` and served at `/videos/<filename>`.
- The guest display automatically plays back the clip after each heat.

Video replay can be toggled per-session from the **Track Manager** page. The setting is persisted in `derby_config.json`.

### Troubleshooting

- Confirm the camera is reachable: `curl http://<camera-ip>/ctrl/session`
- Check server console output — ZCam errors are logged with the `ZCam:` prefix.
- Clip download can take up to 30 seconds after a heat finishes; the server polls the camera until the new file appears.
