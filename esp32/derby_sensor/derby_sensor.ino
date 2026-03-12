// derby_sensor.ino
// Pinewood Derby — ESP32 Sensor Node
//
// Each finish-line sensor pulls a GPIO pin LOW when a car crosses.  A hardware
// interrupt fires immediately and records the exact esp_timer timestamp
// (1 µs resolution).  The main loop POSTs the raw timestamp to the server,
// which computes finish-order gaps from the hardware timestamps — so network
// latency has no effect on race results.
//
// The ESP32 is always-on: it fires on every falling edge and lets the server
// decide whether a race is in progress.  No WebSocket or armed/disarmed state
// is needed.
//
// Flow:
//   ISR fires on FALLING edge → debounce → store esp_timer_get_time() + lane.
//   Main loop drains the queue:
//     POST /api/trigger  { "lane": N, "timestamp_us": "NNNNNNNN" }
//   Server ignores triggers when not armed; computes gapMs from timestamp diffs.
//
// Required libraries (Arduino Library Manager):
//   • ArduinoJson  by Benoit Blanchon
//
// Board: ESP32 Dev Module (or any ESP32 variant with ≥4 interrupt-capable pins)

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "esp_timer.h"

// ── User Configuration ────────────────────────────────────────────────────────

#define WIFI_SSID      "YOUR_WIFI_SSID"
#define WIFI_PASSWORD  "YOUR_WIFI_PASSWORD"

#define SERVER_HOST    "192.168.1.100"  // IP or hostname of the Node server
#define SERVER_PORT    3000

// Number of lanes (must match --lanes passed to server.js)
#define NUM_LANES      4

// GPIO pin for each lane (0-indexed array → lanes 1-4).
// Requirements:
//   • Must support external interrupts (all standard ESP32 GPIOs do).
//   • Must support INPUT_PULLUP (avoid 34/35/36/39 — those are input-only with
//     no internal pull-up; use an external 10 kΩ pull-up if you must use them).
// Safe defaults on a 30-pin ESP32 DevKit:
const int LANE_PINS[NUM_LANES] = { 25, 26, 32, 33 };

// Minimum time between edges on the same lane accepted as a new trigger.
#define DEBOUNCE_US  50000ULL   // 50 ms in microseconds

// ── ISR State ─────────────────────────────────────────────────────────────────

// Circular ring buffer — ISR produces, main loop consumes.
// Size must be a power of 2 so (x & ISR_BUF_MASK) replaces modulo in ISR code.
#define ISR_BUF_SIZE  16
#define ISR_BUF_MASK  (ISR_BUF_SIZE - 1)

volatile int64_t isrTimestamps[ISR_BUF_SIZE]; // 1-indexed lane number
volatile int     isrLanes[ISR_BUF_SIZE];      // 1-indexed lane number
volatile int     isrHead = 0;                 // next write slot  (ISR-owned)
volatile int     isrTail = 0;                 // next read  slot  (main-loop-owned)
volatile int64_t laneLastEdge[NUM_LANES];     // debounce timestamp per lane

// ── ISR Handlers ──────────────────────────────────────────────────────────────

void IRAM_ATTR handleLaneISR(int idx) {
  int64_t now = esp_timer_get_time();
  if ((now - laneLastEdge[idx]) < (int64_t)DEBOUNCE_US) return;

  laneLastEdge[idx] = now;

  int head = isrHead;
  int next = (head + 1) & ISR_BUF_MASK;
  if (next == isrTail) return;      // buffer full — drop trigger, main loop is slow
  isrTimestamps[head] = now;
  isrLanes[head]      = idx + 1;   // convert to 1-indexed lane number
  isrHead             = next;      // commit write last so consumer sees complete entry
}

void IRAM_ATTR isrLane0() { handleLaneISR(0); }
void IRAM_ATTR isrLane1() { handleLaneISR(1); }
void IRAM_ATTR isrLane2() { handleLaneISR(2); }
void IRAM_ATTR isrLane3() { handleLaneISR(3); }

static void (*const LANE_ISRS[4])() = { isrLane0, isrLane1, isrLane2, isrLane3 };

// ── HTTP Trigger Report ───────────────────────────────────────────────────────

bool postTrigger(int lane, int64_t timestampUs) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[trigger] WiFi not connected, skipping POST");
    return false;
  }

  HTTPClient http;
  String url = String("http://") + SERVER_HOST + ":" + SERVER_PORT + "/api/trigger";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  // Send timestamp_us as a string — JSON numbers lose precision above 2^53
  // and esp_timer_get_time() can exceed that after ~104 days of uptime.
  char tsBuf[24];
  snprintf(tsBuf, sizeof(tsBuf), "%lld", timestampUs);

  StaticJsonDocument<96> doc;
  doc["lane"]         = lane;
  doc["timestamp_us"] = tsBuf;

  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  http.end();

  if (code == 200) {
    Serial.printf("[trigger] Lane %d  ts=%lld  → HTTP %d\n", lane, timestampUs, code);
    return true;
  }

  Serial.printf("[trigger] Lane %d POST failed → HTTP %d\n", lane, code);
  return false;
}

// ── Arduino Setup / Loop ──────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("\n[derby] ESP32 Sensor Node starting...");

  memset((void*)laneLastEdge, 0, sizeof(laneLastEdge));

  for (int i = 0; i < NUM_LANES; i++) {
    pinMode(LANE_PINS[i], INPUT_PULLUP);
    attachInterrupt(digitalPinToInterrupt(LANE_PINS[i]), LANE_ISRS[i], FALLING);
    Serial.printf("  Lane %d → GPIO %d\n", i + 1, LANE_PINS[i]);
  }

  Serial.printf("[wifi] Connecting to %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\n[wifi] Connected — IP: %s\n", WiFi.localIP().toString().c_str());

  Serial.println("[derby] Ready.\n");
}

void loop() {
  // Drain the ring buffer: consume every entry the ISR has produced.
  // Advance isrTail first (freeing the slot) so the ISR can keep writing
  // into reclaimed slots while we are blocked on the network.
  while (isrTail != isrHead) {
    int     i    = isrTail;
    int     lane = isrLanes[i];
    int64_t ts   = isrTimestamps[i];
    isrTail = (isrTail + 1) & ISR_BUF_MASK; // free slot before slow POST

    bool ok = false;
    for (int attempt = 0; attempt < 3 && !ok; attempt++) {
      ok = postTrigger(lane, ts);
      if (!ok) delay(100);
    }
    if (!ok) {
      Serial.printf("[trigger] Lane %d giving up after 3 attempts\n", lane);
    }
  }
}
