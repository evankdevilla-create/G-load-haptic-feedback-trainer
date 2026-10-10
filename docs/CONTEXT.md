# hackPHS 2026: project context

Single source of truth for everyone on the team and their Claude agents. Last updated 2026-10-10 (day of event). If something here is stale, fix it here.

## What we're building
A cheap haptic G-load feedback trainer for flight sims. A pressure cuff on the thigh inflates in proportion to live G-load from the sim (FlightGear, via its built-in web server), the same squeeze cue real G-suit bladders give pilots.

- Event: hackPHS 2026, theme "Into the Skies". Tracks: ElevenLabs (voice), Cybersecurity, Codeset.
- Honest framing, required in the pitch: this is a G-load haptic feedback trainer, NOT a G-force simulator. Real G needs real acceleration and cannot be done cheaply. Saying this up front survives technical questions; an oversold claim does not.
- Pitch hook: commercial motion rigs cost $5k to $50k+, this is under $150. Same squeeze principle as a real G-suit bladder. (Don't claim Air Force trainers use this without a source.) No "future CS teacher" backstory, it doesn't connect.
- Honest read on judging: a real top-3 contender because a physical hardware demo stands out. The risk is live-demo flakiness, not the idea.

## Team and ownership
Four people, one Claude agent each. Handoff files are in `docs/handoffs/` in the repo: https://github.com/evankdevilla-create/G-load-haptic-feedback-trainer

| # | Role | File |
|---|------|------|
| 01 | Hardware / pneumatics (cuff, pump, solenoid, plumbing, timings) | `01-hardware-pneumatics.md` |
| 02 | Arduino firmware + relay wiring | `02-arduino-firmware.md` |
| 03 | Sim telemetry to serial bridge (Python), with demo mode | `03-telemetry-software.md` |
| 04 | Integration, demo, Devpost, pitch | `04-integration-demo-pitch.md` |

Names: kept out of this file because the repo is public. See the team chat.

## Build order
Hardware alone first (bench test), then telemetry software, then integration. Integration always takes longer than planned, so do an end-to-end run with `--demo` early and don't leave it to the last hours.

## Architecture
```
sim (FlightGear) -> Python bridge (laptop) -> USB serial -> Arduino Uno
   -> 4-ch relay -> 12V pump + vent solenoid -> thigh cuff
```
Power: 8xAA pack (12V) feeds the pump and solenoid through the relay COM terminals. The Arduino runs from USB. Never power loads through the Arduino.

## Serial contract (do not change without telling 02 and 03)
- 115200 baud, newline-terminated ASCII lines.
- Laptop to Arduino: `G:<float>\n`, about 20 Hz, clamped 0.0 to 9.0.
- Arduino may reply `OK\n`. Malformed lines are ignored.
- No valid line for 500 ms: Arduino vents fully and stops the pump.
- Optional `TEST\n` command: inflate 2 s, vent 2 s, for hardware checks.

## Findings so far (hardware, 2026-10-10)
- Pump: INFLATES on the 8xAA pack, confirmed with the other end sealed. Do not dead-head it for long, a stalled pump overheats.
- Solenoid: NORMALLY OPEN. Unpowered = vents. This is a good fail-safe (power loss deflates the cuff), but it flips the control logic: the solenoid must be ENERGIZED (closed) to inflate and hold pressure, and DE-ENERGIZED to vent. Holding pressure draws solenoid current the whole time.
- T fitting: NOT needed. The cuff has two tubes, so pump (via check valve) goes on tube A and the vent solenoid on tube B, open to air on its other port. Still to verify: both tubes open into the same bladder (blow into A with B open, air should come out of B). The pump tubing is 3 mm OUTER diameter and the cuff tubes are bigger, so connectors are needed. Spare option if B turns out to be a dead end: printable socket T for 3 mm OD tubing in `hardware/t-fitting/`.
- Inflate time, free air: about 30 to 38 s from empty to fully inflated with the cuff NOT on a leg and the other tube sealed. Far slower than the 8 s placeholder in `trainer_logic.h`. A wrapped cuff on a leg should fill faster, so the real number still needs measuring on the leg.
- Still unmeasured: inflate time wrapped on the leg, vent time, max safe run time. 01 owns these, 02 needs them.
- If the leg time is still slow: keep a light preload baseline so 1 G is a few mmHg, use fatter tubing on the pump-to-cuff run (3 mm is a bottleneck), then a higher-flow pump (flow in L/min matters, not pressure; mind the 8xAA current limit), then a small air reservoir.

## Status (2026-10-10)
Each agent updates only its own line. See `CLAUDE.md` for the rules.

- **01 Hardware:** pump inflates, valve is normally open. Free-air fill measured at 30 to 38 s (too slow, re-timing on the leg). No T fitting needed, the cuff has two tubes. Teammates are buying a stronger pump (see Open items for specs). Still to do: plumb the full loop, inflate/vent/max-run timings on the leg, strain relief.
- **03 Bridge:** `bridge/bridge.py` done. `--demo` (scripted flight, ENTER = 6 G spike, `--loop`), `--live` (FlightGear via `--httpd=5400`, auto-detects the G property; X-Plane also supported with `--sim xplane`), `--print`, auto-detect + reconnect, CSV logs. Tested against `bridge/fake_flightgear.py` and `fake_xplane.py`; not yet tested with real FlightGear or a real Arduino.
- **02 Firmware:** `firmware/g_trainer/` written for the NO valve, with watchdog, dead-man, pump cap, deadband, re-zero, TEST/STOP/STATUS. Logic unit-tested on a laptop (20 checks pass). **Not yet uploaded to a real Uno. Timings are placeholders until 01 measures them.**
- **04 Integration:** drafts ready (runbook, pitch, Devpost). Still to do: receipts total, live-sim cutoff time, backup video, rehearsals.
- **Docs:** wiring in `docs/wiring.md`, demo steps + troubleshooting in `docs/demo-runbook.md`, pitch + Devpost drafts in `pitch/`.
- **Sim:** FlightGear (free, runs on Mac). Start it with `--httpd=5400` in the launcher's Additional Settings.

## Firmware logic (open loop, no pressure sensor)
- Map G to a target fill: 1 G or below = empty, about 6 G or more = full. Linear between.
- Track estimated fill by integrating pump and vent time using 01's measured timings. Deadband so relays don't chatter.
- With a NO solenoid: inflate = pump on + solenoid energized; hold = pump off + solenoid energized; vent = pump off + solenoid de-energized. Pump never runs while the solenoid is open.
- Hard cap on continuous pump run time, ~25% above the inflate time (shorter and the cuff never reaches full).
- Every return to 1 G vents all the way, which resets estimate drift.
- Watchdog timer resets a hung board; a reset leaves all relays off = vented.
- Relay boards are often active-low. Idle state of every pin must be "off" before setup() finishes.
- Default pins: relay IN1 = pump (pin 7), IN2 = solenoid (pin 8). IN3/IN4 reserved for leg 2.

## Parts
Bought or planned: BP cuff + bladder (thigh), 12V mini air pump, solenoid valve, silicone tubing, T fittings, check valve, 8xAA holder, zip ties, velcro, small enclosure.
Already owned: 2x Arduino Uno (one is a cold spare), breadboard, jumpers, USB cables, 4-channel relay (5V logic, handles 12V loads), servo(s) of unknown torque, AA/AAA batteries.
Use AAs, not a 9V (9V sags under pump load).

## Scope
Core: one thigh cuff, one pump, one solenoid, Arduino over serial, plus a hardcoded demo mode in case the live sim flakes.
Stretch, only if the core runs on stage: second leg, directional bias via lateral G (4 solenoids), harness servo (needs about 10 to 13 kg-cm, MG996R class, not SG90), rib bladders. One working zone beats two half-wired zones.

## Safety
Firmware vents on serial loss, hard pump time cap, never exceed a firm but comfortable squeeze on a person. Mention this in the pitch.
- Wearer holds an inline kill switch on the 12V line. With the NO valve, cutting power stops the pump and vents the cuff at once.
- Flyback diodes (1N400x) across pump and valve if available. See `docs/wiring.md`.

## Software notes
- `pyserial` for the Arduino. FlightGear: the bridge reads JSON from `http://localhost:5400/json/<property>`, trying `/fdm/jsbsim/accelerations/Nz`, then `/accelerations/pilot-gdamped`, then `/accelerations/pilot-g`. Check in a browser that level flight reads ~1.0; override with `--fg-prop`.
- The Uno reboots when the serial port opens; the bridge waits 2 s after connecting.
- Light low-pass smoothing on G, but not so much that the cuff feels laggy.
- Log G to CSV for debugging and a pitch graph.

## Open items
- Task split per role: `docs/TASKS.md`.
- 03: link test on 2026-10-10 against real FlightGear (c172p, parked): bridge connected over `--httpd=5400` and streamed, but it picked `Nz`, which read 0, while `/accelerations/pilot-g` and `pilot-gdamped` read 1. Verify in actual flight which is right. Also the c172p can't pull 6+ G, so choose an aircraft that can for the demo.
- Stronger pump (teammates buying, must be local, event is today): 12V DC positive-pressure air pump (not a vacuum pump), about 3 to 6 L/min (flow matters, not pressure; anything over about 300 mmHg is enough), under about 2 A running current (8xAA pack sags with more), outlet barb matching the cuff tubes plus spare connectors. No 12V tire inflators, too strong. Keep the kill switch and the pump cap, and 01 re-times max safe run time with the new pump.
- Event day is today, so the pre-build policy email (team@hackphs.tech) is moot.
- Record a backup video of the cuff squeezing during a sim pull as early as possible.
- Total up real receipts for the "under $150" claim.
- 01: measure inflate time, vent time, max safe run time, then put them in `firmware/g_trainer/trainer_logic.h` and stretch `DEMO_PROFILE` in `bridge.py` if the cuff is slow.
- Hold pressure for 3 to 5 min on the bench and feel the valve coil; if it gets too hot, keep held squeezes short.
