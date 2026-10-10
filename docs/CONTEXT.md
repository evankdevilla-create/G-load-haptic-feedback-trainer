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
- Inflate time, free air: about 30 to 38 s from empty to fully inflated with the cuff NOT on a leg and the other tube sealed.
- Timings ON THE LEG (2026-10-10, hand-timed, approximate): **inflate to firm-but-comfortable about 30 s** (current pump, through the cuff's own thick tube, so tubing is not the limit, the pump is). About 10 s more and it starts to feel uncomfortable, so the max safe run is about 40 s and 35 s is a sensible `pumpMaxRunMs`. **Vent about 5 s max** with tube B open to air; through the solenoid port it will be slower, re-time once the valve adapter is printed. Far off the placeholders in `trainer_logic.h` (8 s / 4 s / 10 s). 02: suggested `inflateMs` 30000, `ventMs` 5000, `pumpMaxRunMs` 35000.
- Pump holds pressure by itself with tube B pinched and the pump off, so no check valve needed. Solenoid coil heat test passed, valve is normally open, everything is wired, strap is good.
- 30 s is far too slow to follow a G pull in the sim. Fixes in order: (1) preload so 1 G is a light squeeze, (2) stronger pump (teammates buying, this is the main fix since tubing is already the thick cuff tube), (3) an air reservoir (rigid bottle) charged by the pump during idle, with a NORMALLY CLOSED solenoid as a dump valve into the cuff, so the squeeze arrives almost instantly even with a weak pump. Needs a normally closed valve (a normally open one would connect bottle and cuff all the time) and firmware changes for 02, so only if preload plus the new pump fall short.
- Valve adapter: the valve port is a 1/4" pipe thread (NPT or G1/4, not yet confirmed), being printed to connect tube B to the valve.
- If the leg time is still slow: keep a light preload baseline so 1 G is a few mmHg, use fatter tubing on the pump-to-cuff run (3 mm is a bottleneck), then a higher-flow pump (flow in L/min matters, not pressure; mind the 8xAA current limit), then a small air reservoir.

## Status (2026-10-10)
Each agent updates only its own line. See `CLAUDE.md` for the rules.

- **01 Hardware:** wired, strapped, pump holds pressure, valve is normally open and its coil passes the heat test. On-leg timings measured (about 30 s inflate, about 5 s vent, about 40 s max, see Findings), so 02 can set them. No T needed (two-tube cuff). Using the cuff's own thick tube (not the 3 mm line). Valve adapter (cuff tube to the valve's 1/4" pipe-thread port) is being designed in CAD, not printed yet; until then the vent is tested with tube B open to air. Stronger pump from teammates not bought yet (specs in Open items). Fill is still too slow for a live pull (pump-limited). Spare solenoids on hand, normally open vs closed not yet checked (a normally closed one enables the air-reservoir fix). Not yet done: full loop through the solenoid, vent time through the solenoid, hardware tested with a real Uno.
- **03 Bridge:** `bridge/bridge.py` done. `--demo` (scripted flight, ENTER = 6 G spike, `--loop`), `--live` (FlightGear via `--httpd=5400`; X-Plane with `--sim xplane`), `--step` (square wave for timing cuff lag), `--print`, `--smoothing`, auto-detect + reconnect, CSV logs. **G property pick order fixed:** it now prefers `/accelerations/pilot-g` and refuses readings that aren't a believable load factor, which was the parked-c172p `Nz = 0.0` bug. One-command launcher `bridge/run-live.sh` starts FlightGear + the bridge together. Tested against `fake_flightgear.py` (4 scenarios) and `fake_xplane.py`; **still not tested with real FlightGear in flight or a real Arduino.**
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
- 03: the parked-c172p `Nz = 0` problem is **fixed** - the bridge was taking the first property that returned *any* number, and `0.0` counted. It now prefers `/accelerations/pilot-g` (FlightGear core, so it works on JSBSim and YASim aircraft alike) and rejects implausible readings out loud. Aircraft choice is handled too: `run-live.sh` defaults to the `f16`. What is still open is purely the human half: **fly a real pull and confirm G climbs** (`cd bridge && ./run-live.sh --print`).
- **BLOCKER (03, needs someone on it now):** FlightGear has no data on this laptop. The app is being run straight off the mounted `.dmg` (`/Volumes/FlightGear 2024.1.7/`), it was never installed to `/Applications`, and the `fgdata` download is **unfinished** - `~/Library/Application Support/FlightGear/_fgdata_downloading.temp` stalled at 673 MB and has not grown since 12:58. There are **zero aircraft installed**, so no live run of any kind is possible until this is sorted: drag FlightGear to `/Applications`, open it, and let the data download finish. Until then the stage demo rests entirely on `bridge.py --demo`, which does work.
- 02, from 03: the G-to-pressure curve (1 G = empty, ~6 G = full) lives in `firmware/g_trainer/trainer_logic.h`, which is yours. Once 01's real timings are in and the cuff is built, that curve is the knob for how hard the squeeze ramps. `bridge.py --step` gives you a clean 1 G -> 6 G -> 1 G square wave with the jump instant printed, so you can time the response on video instead of guessing.
- Stronger pump (teammates buying, must be local, event is today): 12V DC positive-pressure air pump (not a vacuum pump), about 3 to 6 L/min (flow matters, not pressure; anything over about 300 mmHg is enough), under about 2 A running current (8xAA pack sags with more), outlet barb matching the cuff tubes plus spare connectors. No 12V tire inflators, too strong. Keep the kill switch and the pump cap, and 01 re-times max safe run time with the new pump.
- Event day is today, so the pre-build policy email (team@hackphs.tech) is moot.
- Record a backup video of the cuff squeezing during a sim pull as early as possible.
- Total up real receipts for the "under $150" claim.
- 01: measure inflate time, vent time, max safe run time, then put them in `firmware/g_trainer/trainer_logic.h` and stretch `DEMO_PROFILE` in `bridge.py` if the cuff is slow.
- Hold pressure for 3 to 5 min on the bench and feel the valve coil; if it gets too hot, keep held squeezes short.
