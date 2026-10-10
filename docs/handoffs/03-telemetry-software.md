# Handoff 03: Sim telemetry -> serial bridge

Project: hackPHS 2026 haptic G-load trainer. Full plan: `~/hackphs/project-plan.md`.
Flight-sim G-load drives a thigh cuff via Arduino. It is a G-load haptic feedback trainer, not a G-force simulator.

## Status (2026-10-10)
Tasks 1 to 5 written. **The sim is FlightGear.** `bridge/bridge.py` flags: `--demo`, `--live` (FlightGear, needs `--httpd=5400`), `--step`, `--sim xplane`, `--print`, `--loop`, `--port`, `--sim-host`, `--fg-port`, `--fg-prop`, `--smoothing`. One-command launcher: `bridge/run-live.sh` (starts FlightGear *and* the bridge).

Fixed since the first pass: the G property auto-detect used to accept the first property that returned any number, so on a parked c172p it locked onto `/fdm/jsbsim/accelerations/Nz` reading `0.0` and the cuff would never have inflated. It now prefers `/accelerations/pilot-g` (FlightGear core, works on JSBSim and YASim aircraft) and refuses implausible readings with a printed reason. Four scenarios in `fake_flightgear.py` cover it.

**New: `sim/`.** A first-person cockpit sim in React + TypeScript that flies a set route at set G and drives the cuff, written because the FlightGear data download never finished. It pretends to be FlightGear (`sim/server/g-server.mjs` serves the same JSON as `--httpd`), so `bridge.py --live` works against it unchanged. `sim/README.md` has the detail.

Still to do, and both need hardware or a cockpit rather than more code:
- Fly a real pull in FlightGear and confirm G climbs. **Blocked:** no `fgdata` installed on the laptop, see Open items in `docs/CONTEXT.md`.
- Test against a real Arduino, then tune `DEMO_PROFILE` and `--smoothing` to 01's measured inflate time. `--step` is there to time the cuff.

Live steps: `docs/demo-runbook.md`.

## Your job
A Python script on the laptop that reads live G-load from the sim and sends it to the Arduino over serial. Plus a demo mode that works with no sim at all. Demo mode is not optional: live hookup is the most likely thing to flake on stage.

## Serial contract (agreed with handoff 02, do not change without telling them)
- 115200 baud, newline-terminated ASCII.
- Send `G:<float>\n` about 20 times per second, clamped to 0.0 to 9.0.
- If you stop sending for 500 ms the Arduino vents on its own, so keep a steady rate even when G is constant.

## Tasks, in order
1. `pyserial` sender with auto-detect of the Arduino port, and a `--port` override. Handle disconnects without a traceback.
2. Demo mode (`--demo`): scripted G ramp, e.g. 1 -> 5 -> 1 -> 7 -> 1 over about 30 s, plus a keyboard trigger (press a key = pull a spike to 6 G). This is what we use if the sim fails.
3. Live mode, one sim to start (pick based on what the team has installed):
   - MSFS: `SimConnect` python package, read the G-force simulation variable (`G FORCE`, check the exact name in the SDK docs).
   - X-Plane: configure Data Output to UDP, parse the G-load dataref/row. X-Plane is simpler to hook up if the machine can run it.
   - Verify the variable names against primary docs before coding. Do not guess them.
4. Smoothing: light low-pass on G so the cuff does not jitter. Keep it small, a response delay will make the demo feel dead.
5. Log G values to a CSV in demo and live mode. Useful for the pitch graph and for debugging.

## Test without hardware
Add `--print` to echo what would be sent so you can develop without the Arduino plugged in.

## Do not
- Do not build a GUI. A terminal script is enough.
- Do not add a second sim backend until the first one works end to end.

## Open question
None. Event is today.
