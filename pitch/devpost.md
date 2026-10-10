# Devpost draft

Fill **[brackets]** with real data. Paste section by section into Devpost.

## Name
G-Load Haptic Trainer

## Tagline
Feel the squeeze of a G-suit in your flight sim, for under **[total]** dollars.

## Inspiration
Flight sims look and sound real, but your body has no idea you just pulled 7 G. Real pilots feel G through their
G-suit: bladders on the legs that inflate harder as G rises. We wanted that cue at home, cheaply.

## What it does
A pressure cuff on your thigh inflates in proportion to the live G-load in your flight sim. Pull up hard and it
squeezes; level off and it lets go. It's a **G-load haptic feedback trainer**, not a G-force simulator: it can't
create real acceleration, but it gives the same pressure cue a G-suit does, in time with your flight.

## How we built it
- **Cockpit sim:** our own first-person flight sim (React, TypeScript, three.js) flies a set route at set G, building
  from 1 G to 6 G. G is the input to the flight model, so every run squeezes the same way. A small Node server serves
  that G in the same format as FlightGear's web server.
- **Sim link:** a Python script reads G-load (`/accelerations/pilot-g`) from our sim, from FlightGear, or from a
  scripted demo flight, and sends it to an Arduino over USB serial, 20 times a second.
- **Firmware:** the Arduino maps G to a target fill level and drives a 12V air pump and a vent solenoid through relays.
  With no pressure sensor, it estimates fill from pump and vent timing, re-zeroing each time G returns to 1.
- **Hardware:** blood pressure cuff with two tubes (pump on one, vent valve on the other, so no T fitting), 12V mini
  pump, normally-open solenoid valve, 8xAA pack.
- **Safety:** fails deflated on power loss, signal loss (0.5 s) or a board reset; pump run time capped; wearer kill switch.
- The control logic is unit-tested on a laptop (dead-man timeout, pump cap, deadband, garbage serial input).

## Challenges we ran into
- **The valve works backwards from what we expected.** It's normally open: with no power it vents. That's a great
  fail-safe (any power loss deflates the cuff), but it flipped the control logic. The valve has to be powered to
  inflate and to hold pressure.
- **Reading the right G number.** Our first pick of FlightGear property read 0.0 on a parked Cessna, which would have
  kept the cuff empty forever. The bridge now prefers `/accelerations/pilot-g` and refuses any reading that isn't a
  believable G value.
- **Fill speed.** On a leg, our pump takes about 30 s to reach a firm squeeze, much slower than G changes in a hard
  pull. **[What we did about it. Plan: keep the current pump, add a preload so 1 G is already a light squeeze, and
  slow the G onset in the demo. Write it here only once 02 and 03 have it working.]**
- **Plumbing.** We planned a T fitting, then found the cuff has two tubes: pump on one, vent valve on the other.
- **No aircraft to fly.** FlightGear's ~2 GB data download stalled on the demo laptop, so we had a sim with no
  planes. We wrote our own cockpit sim that pretends to be FlightGear, so the bridge and firmware didn't change.
- [Add anything else from the day.]

## Accomplishments we're proud of
[e.g. it works end to end on stage; the safety design; built and tested in one day.]

## What we learned
[Fill in.]

## What's next
Pressure sensor for closed-loop control, second leg, lateral G (one side squeezes harder in turns), spoken
anti-G straining cues.

## Built with
python, pyserial, arduino, c++, react, typescript, three.js, node.js, vite, flightgear

## Parts list (from receipts)

| Part | Price |
|---|---|
| Blood pressure cuff + bladder | [ ] |
| 12V mini air pump | [ ] |
| Solenoid valve (normally open) | [ ] |
| Silicone tubing | [ ] |
| T-fittings / check valve (only if actually bought; neither is in the final build) | [ ] |
| Stronger pump (if bought) | [ ] |
| 8xAA holder | [ ] |
| Zip ties, velcro, enclosure | [ ] |
| **Total paid for this build** | **[ ]** |

Already owned, not counted in the total: Arduino Uno (x2), 4-channel relay module, breadboard, jumpers, USB cables.
Only use "under $150" if the receipt total supports it.

## Media checklist
- [ ] 30 s video: cuff squeezing during a sim pull (record as soon as milestone 3 works)
- [ ] Photo of the hardware laid out
- [ ] Photo of someone wearing it
- [x] G-vs-time graph: `pitch/g-vs-time-sim-route.png`, one 98 s loop of the sim's route as logged by the bridge.
  It shows the G command, not cuff pressure (no cuff was attached). Caption it that way. Once there's a real run with
  the cuff, remake it from that log with `pitch/make_g_graph.py` (usage at the top of the script).
