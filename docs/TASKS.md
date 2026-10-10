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
- [ ] Test `--live` against real FlightGear in flight. Possible bug: the bridge picks `/fdm/jsbsim/accelerations/Nz` first and it read 0 on a parked c172p while `/accelerations/pilot-g` read 1. Confirm in flight which property is right and fix the pick order if needed.
- [ ] Pick an aircraft that can pull 6+ G (the c172p tops out around 4 G, so a 6 G squeeze never happens). Check what is in the installed data.
- [ ] One-command launcher: FlightGear flags (`--httpd=5400`, `--in-air`, etc.) plus the bridge.
- [ ] Measure sim-to-cuff lag; tune smoothing and the G-to-pressure curve.
- [ ] Extra: on-screen G readout during the demo.

## 04 Integration / pitch
- [ ] Full end-to-end run as soon as 01 and 02 have something working.
- [ ] Total the real receipts for the "under $150" claim (no guessed prices).
- [ ] Record a backup video of the cuff squeezing during a pull, early.
- [ ] Finish Devpost and pitch; rehearse twice with someone wearing it.
- [ ] Extra, for the ElevenLabs track: spoken coaching from the bridge ("5 G, strain!", G-LOC warning). API key stays out of the public repo.
