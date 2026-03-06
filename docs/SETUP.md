# Raspberry Pi Setup Guide

This guide covers everything needed to run the Pinewood Derby server on a Raspberry Pi from a fresh Raspberry Pi OS installation.

---

## 1. Install Raspberry Pi OS

Use [Raspberry Pi Imager](https://www.raspberrypi.com/software/) to flash **Raspberry Pi OS Lite (64-bit)** onto your SD card. Enable SSH and set a hostname/username in the imager's advanced options before flashing.

---

## 2. Install Node.js ≥ 18

Raspberry Pi OS ships with an outdated version of Node.js. Install a current version via NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version   # should print v22.x.x
```

---

## 3. Enable GPIO Permissions

`onoff` accesses `/sys/class/gpio` and requires your user to be in the `gpio` group. Add yourself and re-login:

```bash
sudo usermod -aG gpio $USER
# Log out and back in (or reboot) for the group change to take effect
```

Verify with:
```bash
groups | grep gpio
```

---

## 4. Clone and Install

```bash
git clone <repo> derby
cd derby
npm install
```

---

## 5. Test with Simulation Mode

Before connecting any hardware, verify everything works:

```bash
npm run simulate
```

Open `http://<pi-ip>:3000/` in a browser — you should see the guest display and live heat results.

---

## 6. Wire the Sensors

Connect your finish-line sensors to the GPIO pins via the 2×5 IDC connector. See [WIRING.md](WIRING.md) for the full connector pinout and continuity check procedure.

---

## 7. Run in GPIO Mode

```bash
npm start
```

The server will print the detected pin assignments on startup:
```
  Lane 1 → GPIO 17
  Lane 2 → GPIO 27
  Lane 3 → GPIO 22
  Lane 4 → GPIO 23
```

---

## 8. Auto-Start on Boot (systemd)

Create a service file so the server starts automatically after a reboot:

```bash
sudo nano /etc/systemd/system/derby.service
```

Paste the following (adjust `User` and `WorkingDirectory` to match your setup):

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
