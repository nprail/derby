# 2×5 IDC Connector Wiring Guide

A 10-pin (2×5) IDC connector is a convenient, keyed way to run a ribbon cable from your finish-line sensor board to the Raspberry Pi header. The guide below shows a recommended pin layout that puts one GND next to every signal line, which improves noise rejection and makes the ribbon easy to follow.

---

## Identifying Pin 1

Before connecting anything, confirm pin 1 orientation — reversing a ribbon cable will short power to signal lines.

| Clue | Where to look |
|---|---|
| **Notch / key in housing** | The plastic IDC housing has a small bump or slot on the pin-1 side |
| **Red / dark stripe on ribbon** | The colored edge of the ribbon always runs on the pin-1 side |
| **Triangle or dot on PCB** | The silkscreen on the sensor board marks pin 1 with a ▶ or ● |
| **Square pad** | On the Pi end (if using a breakout board), pin 1 often has a square solder pad |

> **Rule of thumb:** hold the connector in front of you with the locking tab facing up. Pin 1 is on the **top-left**.

---

## Recommended 2×5 Pin Assignment

```
        Odd column      Even column
        (ribbon side 1) (ribbon side 2)
        ┌────────────────────────────┐
Pin 1 → │  3.3 V (VCC)  │  GND      │ ← Pin 2
Pin 3 → │  Lane 1 signal │  GND      │ ← Pin 4
Pin 5 → │  Lane 2 signal │  GND      │ ← Pin 6
Pin 7 → │  Lane 3 signal │  GND      │ ← Pin 8
Pin 9 → │  Lane 4 signal │  GND      │ ← Pin 10
        └────────────────────────────┘
              ▲ Pin 1 marker (notch / red stripe)
```

| IDC Pin | Signal | Raspberry Pi Physical Pin | BCM |
|---|---|---|---|
| 1 | 3.3 V | Pin 1 (3V3 power) | — |
| 2 | GND | Pin 6 (GND) | — |
| 3 | Lane 1 | Pin 11 | GPIO 17 |
| 4 | GND | Pin 9 (GND) | — |
| 5 | Lane 2 | Pin 13 | GPIO 27 |
| 6 | GND | Pin 14 (GND) | — |
| 7 | Lane 3 | Pin 15 | GPIO 22 |
| 8 | GND | Pin 20 (GND) | — |
| 9 | Lane 4 | Pin 16 | GPIO 23 |
| 10 | GND | Pin 25 (GND) | — |

> The Pi has many GND pins — any available GND pin is electrically equivalent. Use whichever is closest to keep wiring tidy.

---

## Per-Lane Sensor Circuit

Wire each sensor between the 3.3 V and signal lines. The GPIO input is pulled low (falling edge) when a car crosses.

```
IDC Pin 1 (3.3V) ──┬──[sensor / IR gate]── IDC Pin 3 (Lane 1 signal)
                   │                               │
                 optional                      GPIO 17 on Pi
                 10kΩ pull-up                      │
                   └───────────────────────── IDC Pin 4 (GND)
```

The Pi's **internal pull-up** is enabled by `onoff` automatically; the external 10 kΩ is optional but recommended for runs of cable longer than ~30 cm.

---

## Continuity Check Procedure

Before powering up, use a multimeter in continuity mode:

1. Crimp the IDC connector onto the ribbon cable but **do not** plug it into the Pi yet.
2. Probe IDC pin 1 and the 3.3 V wire on the sensor board — should beep.
3. Probe IDC pin 2 and GND on the sensor board — should beep.
4. Probe each signal pin (3, 5, 7, 9) against its corresponding sensor output — should beep only when the sensor is triggered.
5. Probe **pin 1 against pin 2** — must **not** beep (would indicate a short between VCC and GND).
