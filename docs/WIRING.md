# ESP32 Sensor Node Wiring Guide

The ESP32 reads up to four finish-line sensors via direct GPIO connections. Each sensor pulls a pin LOW (falling edge) when a car crosses. A hardware interrupt fires immediately and records a microsecond-accurate timestamp — no polling, no network involved at trigger time.

---

## Default Pin Assignment

| Lane | ESP32 GPIO | Notes |
|------|------------|-------|
| 1    | GPIO 25    | |
| 2    | GPIO 26    | |
| 3    | GPIO 32    | |
| 4    | GPIO 33    | |
| —    | GND        | Common ground with sensor board |
| —    | 3.3 V      | Power for sensor board (max ~100 mA total) |

To use different pins, edit `LANE_PINS` at the top of `derby_sensor.ino`:

```cpp
const int LANE_PINS[NUM_LANES] = { 25, 26, 32, 33 };
```

**Pin requirements:**
- Must support external interrupts (all standard ESP32 GPIOs do)
- Must support `INPUT_PULLUP` — avoid GPIOs 34, 35, 36, 39 (input-only, no internal pull-up)

---

## Per-Lane Sensor Circuit

Each sensor is wired between 3.3 V and the signal pin. The ESP32 enables its internal pull-up; the line goes LOW when a car breaks the IR beam.

```
3.3 V ──┬──[IR emitter / sensor gate]── GPIO 25 (Lane 1)
        │                                      │
    optional                          internal pull-up
    10 kΩ pull-up                     enabled in firmware
        │                                      │
       GND ─────────────────────────────────── GND
```

The external 10 kΩ pull-up is optional but recommended for cable runs longer than ~30 cm.

---

## Continuity Check Procedure

Before powering up, use a multimeter in continuity mode:

1. With the ESP32 unpowered, probe each signal pin (GPIO 25/26/32/33) to GND — should **not** beep in static state.
2. Trigger the sensor manually (block the IR beam) — probe should beep when the output is pulled LOW.
3. Probe 3.3 V to GND — must **not** beep (would indicate a short).

---

## Notes on Timing Accuracy

- Interrupts fire via `attachInterrupt(FALLING)` — latency is typically < 2 µs on ESP32.
- `esp_timer_get_time()` provides a 1 µs resolution monotonic clock.
- The raw `timestamp_us` value is sent to the server with each trigger; the server computes `gapMs = (timestamp_i − timestamp_0) / 1000`. Because all timestamps come from the same ESP32 clock, WiFi jitter (typically 1–10 ms) has zero effect on recorded finish times.
- Hardware debounce is implemented in firmware (`DEBOUNCE_US = 50000`). Triggers on the same lane within 50 ms of the previous edge are ignored.
