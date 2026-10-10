# Pitch script (~2 minutes + live demo)

Blanks in **[brackets]** need real numbers before you say them. Don't fill them with guesses.

## 1. Hook (15 s)
"Pilots pulling hard turns get squeezed by their G-suit. Inflatable bladders on the legs push harder the more G they
pull. Sim pilots never feel that. A home motion platform like Qubic's three-axis QS-210 costs €6,680 before tax.
We built a cuff that gives you the G-suit squeeze for **[total from receipts]** dollars."

## 2. What it is, and what it isn't (15 s)
"To be clear: this is a **G-load haptic feedback trainer**, not a G-force simulator. Real G needs real acceleration.
You can't fake that cheaply. What we *can* give you is the same pressure cue a G-suit gives, timed to your flight."

(Say this before a judge asks. It's the line that survives technical questions.)

## 3. Live demo (45 s)
- Volunteer wears the cuff, kill switch in hand.
- Start the flight: our cockpit sim flying its set route (or `--demo` if it's flaky; say which). It's a scripted
  route, not someone flying, so say that too: "it flies the same G every run, so you feel exactly what we planned."
- Call out one long pull rather than quick ones: "Pulling 6 G... holding it... feel it build... and level off, it
  lets go." The current pump takes about 30 s to reach a firm squeeze, so a quick pull only gives a light one.
- Ask the volunteer what they feel.

## 4. How it works (20 s)
"We wrote our own cockpit sim that flies a set route at set G. Its G-load goes to a Python script on the laptop, then over USB to an Arduino 20 times a second. The Arduino
switches a 12-volt pump and a vent valve. With no pressure sensor, it estimates how full the cuff is from pump and
vent timing, and re-zeroes every time you level off."

## 5. Safety (15 s)
"Everything fails deflated. The vent valve opens with no power. Lose the signal for half a second and it vents.
The pump has a hard time limit. And the wearer holds a kill switch."

## 6. What's next (10 s)
Pick one or two: a pressure sensor for closed-loop control, a second leg, lateral G (squeeze one side harder
in a turn), spoken straining cues for anti-G training.

## Likely judge questions
| Question | Answer |
|---|---|
| Isn't this just a blood pressure cuff? | The cuff is off the shelf; the control loop, safety design and sim link are what we built. |
| How is this different from sim-racing belt tensioners / G-seats? | Belt tensioners pull your harness tight to fake braking and cornering forces; SimXperience's G-Belt is listed at $999. G-seats move pads in the seat so it presses harder or softer on your back and thighs. Both fake being pushed by the seat and harness. Ours mimics the G-suit's leg bladder squeeze, the cue pilots actually get, at **[total from receipts]**. |
| Why did you write your own sim instead of using FlightGear? | FlightGear's ~2 GB data download stalled on our demo laptop, so we had a sim with no aircraft. Ours flies a fixed route at fixed G, so the squeeze is the same every run and we can demo it reliably. The bridge still works with FlightGear; it can't tell the two apart. |
| Why open loop? | No pressure sensor in the budget. Time-based estimate plus re-zero on every return to 1 G. A sensor is the first upgrade. |
| How fast does it respond? | Give the real number: about 30 s to fill from empty, about 5 s to vent. Slower than a real G onset. We decided to keep a small low-flow pump and turned down high-power ones (150 psi tire inflators, 10 A+), because a low-flow pump can't slam pressure onto a leg if something fails. **[Only once 02's preload works:]** we preload the cuff to a comfortable baseline, so a pull only tops it up. Next step: a stronger pump plus a pressure sensor. Don't say the small pump was the plan from the start; we looked for a stronger one and couldn't buy it. |
| Is it safe? | Section 5. |

## Sources for the numbers above
- Qubic 3DOF Motion Set QS-210: €6,680, tax and duty not included (QS-220: €8,880). https://qubicsystem.com/product/3dof-motion-set-qs-210-qs-220/
- SimXperience G-Belt: listed at $999 (page also says "Not Available For Sale"). https://www.simxperience.com/en-us/products/accessories/g-beltactivebelttensioners.aspx
- Cuff timings: 01's on-leg measurements, 2026-10-10 (`docs/CONTEXT.md`, Findings). Re-time if the stronger pump goes in.
- Don't say it's what the Air Force trains with unless you have a source. "Same squeeze principle as a G-suit" is safe.
