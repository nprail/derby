# Setup Guide

This guide covers everything needed to run the Pinewood Derby system: a Node.js server (runs on any machine on the local network) and an ESP32 sensor node that handles all finish-line GPIO sensing.

---

## Architecture

```
Finish-line sensors
        │  (falling-edge interrupt)
        ▼
   ESP32 sensor node          ← records µs-accurate timestamps via hardware ISR
        │  POST /api/trigger  ← sends pre-computed gapMs over WiFi
        ▼
   Node.js server             ← manages race state, serves web UI
        │  WebSocket
        ▼
   Browser (guest / manage)
```

Because the ESP32 records timestamps in hardware before any network call is made, WiFi latency has no effect on race timing accuracy.

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
