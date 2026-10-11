// g_trainer.ino - hackPHS 2026 G-load haptic feedback trainer (handoff 02)
//
// Reads "G:<float>\n" lines over USB serial (115200 baud, ~20 Hz) and drives
// a pump relay and a vent-solenoid relay to squeeze a thigh cuff.
// All the decision-making lives in trainer_logic.h.
//
// Serial commands (type them in Serial Monitor, line ending = Newline):
//   G:6.0    set G-load (0.0 to 9.0)
//   TEST     inflate 2 s, then vent 2 s (hardware check, no laptop script needed)
//   STOP     vent now; the next G: line resumes
//   STATUS   print one status line
//
// Safety: no valid G line for 500 ms -> vent. Pump has a hard run-time cap.
// Pump never runs with the valve open. Watchdog resets a hung board, and a
// reset/unpowered board leaves every relay off = valve open = cuff vents.

#include <avr/wdt.h>
#include "trainer_logic.h"

// ---- Wiring (record any change in docs/wiring.md) ----
const uint8_t PIN_PUMP = 8;   // relay IN2 (the valve is on relay 1 / IN1 since the two-pack rewire)
const uint8_t PIN_VALVE = 7;  // relay IN1
// Most cheap relay boards switch ON when the input is LOW. If yours clicks
// on at power-up and off when it should be on, set this to false.
const bool RELAY_ACTIVE_LOW = true;

Trainer trainer;

char lineBuf[32];
uint8_t lineLen = 0;
bool lineOverflow = false;

void setRelay(uint8_t pin, bool on) {
  bool level = RELAY_ACTIVE_LOW ? !on : on;
  digitalWrite(pin, level ? HIGH : LOW);
}

void initRelayPin(uint8_t pin) {
  setRelay(pin, false);  // set the OFF level before the pin becomes an output
  pinMode(pin, OUTPUT);
  setRelay(pin, false);
}

void printStatus(unsigned long now) {
  static const char* const names[] = {"VENT", "INFLATE", "HOLD"};
  Serial.print(F("S: g="));
  Serial.print(trainer.g(), 2);
  Serial.print(F(" target="));
  Serial.print(trainer.target(), 2);
  Serial.print(F(" fill="));
  Serial.print(trainer.fillEstimate(), 2);
  Serial.print(F(" mode="));
  Serial.print(names[trainer.currentMode()]);
  if (trainer.deadmanTripped(now)) Serial.print(F(" NO_SIGNAL"));
  if (trainer.lockedOut()) Serial.print(F(" PUMP_CAP"));
  if (trainer.isTesting()) Serial.print(F(" TESTING"));
  Serial.println();
}

void handleLine(unsigned long now) {
  switch (trainer.handleLine(lineBuf, now)) {
    case LINE_TEST:   Serial.println(F("OK TEST")); break;
    case LINE_STOP:   Serial.println(F("OK STOP")); break;
    case LINE_STATUS: printStatus(now); break;
    default: break;  // G lines get no reply; garbage is ignored silently
  }
}

void readSerial(unsigned long now) {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      if (!lineOverflow) {
        lineBuf[lineLen] = '\0';
        handleLine(now);
      }
      lineLen = 0;
      lineOverflow = false;
    } else if (lineLen < sizeof(lineBuf) - 1) {
      lineBuf[lineLen++] = c;
    } else {
      lineOverflow = true;  // too long: drop the whole line
    }
  }
}

void setup() {
  wdt_disable();
  initRelayPin(PIN_PUMP);
  initRelayPin(PIN_VALVE);
  Serial.begin(115200);
  Serial.println(F("g_trainer ready"));
  wdt_enable(WDTO_1S);
}

void loop() {
  wdt_reset();
  unsigned long now = millis();
  readSerial(now);
  trainer.update(now);

  // Never both: turn the pump off before opening the valve.
  setRelay(PIN_PUMP, trainer.pump());
  setRelay(PIN_VALVE, trainer.valveClosed());
}
