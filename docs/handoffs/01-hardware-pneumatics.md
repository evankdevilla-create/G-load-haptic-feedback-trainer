# Handoff 01: Hardware / pneumatics

Project: hackPHS 2026 haptic G-load trainer ("Into the Skies"). Full plan: `~/hackphs/project-plan.md`.
One-liner: a thigh pressure cuff inflates in proportion to live G-load from a flight sim, like a real G-suit bladder. Under $150. It is a G-load haptic feedback trainer, NOT a G-force simulator. Never claim otherwise.

## Your job
Get one cuff inflating and venting reliably on the bench, with no electronics beyond a bare 12V supply. Everyone else is blocked on you, so a working cuff is the first milestone.

## Parts
- BP cuff + bladder (thigh size), 12V mini air pump, solenoid valve, silicone tubing, T-fittings, check valve, zip ties, velcro, 8xAA holder (12V).

## Tasks, in order
1. Confirm the pump INFLATES. Many mini pumps are vacuum-only or ambiguous. Test with the bladder before anything else.
2. Plumb pump -> T -> cuff, with the solenoid on the other leg of the T as the vent. Check valve between pump and T so venting does not push air back through the pump.
3. Find out whether the solenoid is normally-open or normally-closed and write it down in the "Findings" section below. The firmware agent needs this (vent energized vs. de-energized).
4. Bench-measure: seconds to inflate cuff from empty to comfortably firm, seconds to vent. Record both. The firmware agent maps G to pump on-time with these numbers.
5. Find the max safe pressure/time. Do not exceed a firm but comfortable squeeze on a human leg. Add a hard time cap on any single pump run. Safety beats demo.
6. Strain-relief every barb with zip ties, bundle tubing, mount everything in the enclosure.

## Do not
- Do not buy or assemble a second bladder until the first one works. Scope: one working zone beats two half-wired zones.
- Do not wire anything to mains.

## Interfaces
- You hand off: pump and solenoid each switched by a 12V line, and the measured timings.
- Electrical side (relay, Arduino) belongs to handoff 02. Coordinate wiring with them.

## Open question
None. Event is today, so the pre-build question is moot.

## Findings (fill in as you go)
- Pump inflates? YES (8xAA, sealed end). Don't dead-head it for long.
- Solenoid type (NO/NC): NORMALLY OPEN. Unpowered = vents. Firmware already handles this.
- Inflate time empty->firm: free air (not on a leg, other tube sealed) was 30-38 s to fully inflated. On-leg time still to measure.
- Tubing: 3 mm OUTER diameter. Printed socket T in `hardware/t-fitting/` (source `t-fitting.scad`, tweak `fit` if the tube is loose or won't go in).
- Vent time: 
- Notes/gotchas: the cuff has two tubes, so no T: pump (via check valve) on one, vent valve on the other. First check both tubes reach the same bladder. Wiring and air path: `docs/wiring.md`.
- Where the timings go: `firmware/g_trainer/trainer_logic.h` (`inflateMs`, `ventMs`, `pumpMaxRunMs`). Tell 03 too, so the demo profile matches.
- Coil heat: hold pressure 3 to 5 min and feel the valve coil.
