# Task list

Split by handoff. Tier 1 is the critical path: nothing else matters if the cuff doesn't squeeze on a live sim pull. Do extras only after the demo works. One working cuff beats two half-built features.

Tick items off here when done (edit only your own section).

## 01 Hardware / pneumatics
- [ ] On-leg inflate, vent and max-run timings, sent to 02 (and written in CONTEXT findings).
- [ ] Check both cuff tubes reach the same bladder; plumb pump -> check valve -> tube A, vent valve on tube B.
- [ ] Wire relay, inline kill switch and flyback diodes per `docs/wiring.md`; strain-relief everything.
- [ ] Coil-heat test (hold pressure 3 to 5 min); mount everything in the box.
- [ ] Extra: spare bladder; photos of the build for the Devpost.

## 02 Arduino firmware
- [ ] Flash a real Uno, run `TEST`, confirm relay polarity (active-low?) on the bench.
- [ ] Put 01's timings in `trainer_logic.h` (`inflateMs`, `ventMs`, `pumpMaxRunMs`).
- [ ] Preload baseline so 1 G is a light squeeze (the pump is slow).
- [ ] Extra: cheap pressure sensor for closed-loop control and a pressure readout, only after open-loop works.

## 03 Bridge / sim
- [x] Test `--live` against real FlightGear in flight. Possible bug: the bridge picks `/fdm/jsbsim/accelerations/Nz` first and it read 0 on a parked c172p while `/accelerations/pilot-g` read 1. Confirm in flight which property is right and fix the pick order if needed.
  - Root cause found and fixed. The bridge locked onto the **first property that returned any number**, and `Nz` returned a perfectly valid `0.0`, so it picked a dead reading and the cuff would never have inflated. Now `/accelerations/pilot-g` is tried first (it lives in FlightGear's core, so it works on JSBSim *and* YASim aircraft, and it reads ~1.0 at rest), and any reading that is not a believable load factor is refused with a printed reason. `Nz` is last resort and gets its negative-Z sign flipped.
  - Covered by four scenarios in `fake_flightgear.py` (`normal`, `stuck-nz`, `jsbsim`, `yasim`); all four now pick `pilot-g`.
  - **Still needs a human in the cockpit:** confirm G actually climbs during a real pull. `./run-live.sh --print` and watch the numbers. Can't be done from a desk.
- [x] Pick an aircraft that can pull 6+ G (the c172p tops out around 4 G, so a 6 G squeeze never happens). Check what is in the installed data.
  - `run-live.sh` defaults to `--aircraft f16` (a 9 G airframe). Override with `./run-live.sh --aircraft <id>`.
  - Checked the installed data: **there is none.** No aircraft at all on this laptop, see Open items in CONTEXT.md. Blocker for any live run.
- [x] One-command launcher: FlightGear flags (`--httpd=5400`, `--in-air`, etc.) plus the bridge.
  - `bridge/run-live.sh`. Finds FlightGear, warns if `fgdata` or the aircraft is missing, starts the sim with `--httpd=5400 --altitude=10000 --vc=350` (`--altitude` implies `--in-air`), waits for the web server, then runs the bridge. One Ctrl+C stops both, and it never leaves the sim running.
- [ ] Measure sim-to-cuff lag; tune smoothing and the G-to-pressure curve.
  - Tooling is in: `bridge.py --step` plays a clean 1 G -> 6 G -> 1 G square wave and prints/logs the exact jump instant, so the cuff can be timed against it on video. Smoothing is now `--smoothing` instead of a hardcoded constant.
  - The numbers themselves need the built cuff. The G-to-pressure curve lives in `firmware/` (02's), so 02 has to make that change, not me.
- [ ] Extra: on-screen G readout during the demo.
  - Deliberately not started: extras come after the demo works.

## 04 Integration / pitch
- [ ] Full end-to-end run as soon as 01 and 02 have something working.
- [ ] Total the real receipts for the "under $150" claim (no guessed prices).
- [ ] Record a backup video of the cuff squeezing during a pull, early.
- [ ] Finish Devpost and pitch; rehearse twice with someone wearing it.
  - Pitch and Devpost updated with 01's measured timings, 03's bridge changes, real challenges from today, and sourced comparison prices (Qubic QS-210, SimXperience G-Belt). Runbook live-mode steps now use `run-live.sh`.
  - Still blank on purpose: receipt total, demo status, accomplishments. Rehearsals need the built cuff.
- [ ] Extra, for the ElevenLabs track: spoken coaching from the bridge ("5 G, strain!", G-LOC warning). API key stays out of the public repo.
