# Rules for every agent on this repo

Four teammates each run their own Claude agent on this repo at the same time. These rules keep you from
overwriting each other. Follow them exactly.

## At the start of every session
1. `git pull` before anything else.
2. Read `docs/CONTEXT.md` (the single source of truth), then your handoff in `docs/handoffs/`.
3. Ask your teammate which handoff they're on (01, 02, 03 or 04) if they didn't say.

## Who edits what
Only edit files you own. You may read everything.

| Handoff | Owns |
|---|---|
| 01 hardware / pneumatics | `docs/handoffs/01-*.md`, `docs/wiring.md` |
| 02 Arduino firmware | `firmware/` |
| 03 sim → serial bridge | `bridge/` |
| 04 integration, demo, pitch | `docs/demo-runbook.md`, `pitch/`, `README.md` |

Shared files, edit carefully: `docs/CONTEXT.md` (update only your own status line or findings) and this file.
If a change is needed in someone else's area, tell your teammate to pass it on, or note it under
"Open items" in CONTEXT.md. Don't make it yourself.

## Committing
- Commit and push small changes often. Every finished step, not once at the end.
- `git pull` right before you push. If there's a merge conflict, resolve it keeping both sides' intent. Never force-push.
- Clear commit messages that say which handoff: `02: add STATUS command`.
- Never commit `.venv/`, logs, build output, passwords or tokens. The repo is **public**, so leave
  teammates' names and contact details out too.
- When you finish something, update your line under "Status" in `docs/CONTEXT.md` in the same commit.

## Contracts: don't change these without telling both sides
- **Serial (02 ↔ 03):** 115200 baud, `G:<float>\n` at ~20 Hz, clamped 0.0 to 9.0. No line for 500 ms → Arduino vents.
  Extra commands: `TEST`, `STOP`, `STATUS`. The bridge ignores anything the Arduino sends back.
- **Hardware (01 ↔ 02):** pump relay on pin 8, vent valve relay on pin 7 (swapped 2026-10-11, valve now has its own pack). The vent valve is a **normally-closed** solenoid wired to its relay's **NC** contact
  (relay off = valve powered = open = vents; it needs its pack B to vent). Timings live in `firmware/g_trainer/trainer_logic.h` (`inflateMs`, `ventMs`, `pumpMaxRunMs`).

## Non-negotiables
- **Framing:** it's a "G-load haptic feedback trainer", never a G-force simulator.
- **Safety:** every failure must end with the cuff deflated. Don't weaken the dead-man timeout, pump cap,
  watchdog or relay-off venting. A cuff is on a person's leg.
- **Scope:** one working cuff before any stretch goal (second leg, servo, rib bladders).
- **Honesty:** don't put unverified claims or guessed prices in the pitch or Devpost. Leave a `[blank]`.
- Verify sim variable names against real docs or the running sim; don't guess.

## Checking your work
- Firmware logic tests: `cd firmware/test && g++ -std=c++11 -I../g_trainer test_logic.cpp -o test_logic && ./test_logic`
- Bridge without hardware: `cd bridge && .venv/bin/python bridge.py --demo --print`
- Live mode without FlightGear: run `bridge/fake_flightgear.py` in one terminal and `bridge.py --live --print` in another.
- The sim is **FlightGear** (X-Plane support exists as `--sim xplane`, MSFS is not supported).
- Set up the bridge environment the first time: `cd bridge && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`
