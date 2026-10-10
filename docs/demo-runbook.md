# Demo runbook (handoff 04)

## Milestones (do them in order, tick them off)

- [ ] **1. Cuff alone.** Pump inflates and valve vents from the 8xAA pack, no Arduino. Inflate and vent times measured.
  Mostly done: about 30 s to a firm squeeze on the leg, about 5 s to vent with tube B open to air. Still to do:
  re-time the vent through the valve once the adapter is printed. No new pump for now (01's decision).
- [ ] **2. Firmware alone.** Sketch uploaded, real timings entered, `TEST` works in Serial Monitor.
  Sketch is written and its logic tests pass on a laptop. Not uploaded to a real Uno yet.
- [ ] **3. End to end, demo mode.** `bridge.py --demo` squeezes the real cuff. **Record the backup video now.**
- [ ] **4. Live sim.** `bridge.py --live` with 03's cockpit sim (`sim/`) or FlightGear. If it isn't working by the
  cutoff time, demo mode is the plan.
- [ ] **5. Rehearse twice** with someone wearing the cuff, full pitch, timed.

**Judging starts 10:00 AM Sunday, Oct 11. Live-sim cutoff: 8:00 AM Sunday.** After 8:00, stop working on live mode
and polish whatever works. If live isn't solid by then, the stage demo is `--demo --loop`, and we say so.

Live mode no longer waits on FlightGear: 03's cockpit sim in `sim/` stands in for it and needs no big download (see
below). FlightGear stays as a second option once its data is on a laptop.

Both the scripted demo flight (about 3 s pulls) and the cockpit sim's route (6 to 8 s turns, back to 1 G in between)
are far shorter than the cuff's ~30 s fill, and the firmware empties the cuff every time G drops back to 1. So today
the squeeze peaks at roughly a quarter of full, even at 6 G. It will feel light until 03 slows the G onset and 02 adds
the preload. Team decision (01): no new pump for now, we demo with the current one.

## Setup (every time)

1. 8xAA pack in, **kill switch OFF**.
2. Arduino plugged into the Mac. Relays silent, LEDs off.
3. Terminal:
   ```bash
   cd bridge          # from the repo folder
   .venv/bin/python bridge.py --demo --print
   ```
   G lines scroll → software is fine. Ctrl+C.
4. Cuff on the volunteer's thigh, over clothes, snug but not tight. Kill switch in **their** hand.
5. Kill switch ON. Run for real:
   ```bash
   .venv/bin/python bridge.py --demo --loop     # or --live
   ```
6. Press ENTER for a spike whenever you want a squeeze on cue.

## Live mode with the cockpit sim (`sim/`, preferred)

03's React cockpit sim flies a set route at set G (1 G building to 6 G, 98 s, loops). Its little server answers like
FlightGear's web server, so the bridge runs unchanged. Needs Node.js.

```bash
cd sim
npm install        # first time only
npm run dev        # sim on :5173, G server on :5400
```
Open the URL it prints. Then, in a second terminal:
```bash
cd bridge
.venv/bin/python bridge.py --live --print   # check first: G lines follow the route
.venv/bin/python bridge.py --live           # for real, with the Arduino
```
The HUD shows `CUFF LINK LIVE` once it's posting. If the tab freezes or closes, the G server stops answering after
0.4 s, the bridge stops sending, and the firmware vents. Pausing the sim holds a steady 1 G (cuff empties, link stays up).

Say it honestly on stage: this is our own sim flying a scripted route, not a pilot flying FlightGear.

## Live mode with FlightGear

**One command (preferred):**
```bash
cd bridge
./run-live.sh --print     # check first: starts FlightGear, prints G, doesn't touch the Arduino
./run-live.sh             # for real
```
It starts FlightGear in the air in an F-16 with the web server on (`--httpd=5400`), waits for it, then runs the
bridge. One Ctrl+C stops both. It warns if FlightGear's data or the aircraft is missing. Pick another aircraft with
`--aircraft <id>`, but it needs to pull 6+ G (the Cessna 172P tops out around 4 G, so the cuff never gets full).

**By hand, if the launcher won't cooperate:**
1. **Turn on FlightGear's web server.** In the FlightGear launcher, open **Settings** and type this in the
   **Additional Settings** box at the bottom:
   ```
   --httpd=5400
   ```
2. Fly an aircraft that can pull 6+ G, such as the F-16.
3. Check it in a browser: open http://localhost:5400/json/accelerations/pilot-g. You should see a `"value"`
   close to **1.0** while flying level. If it's a number, live mode will work.
4. `.venv/bin/python bridge.py --live`. It prints which property it's reading, then "FlightGear connected".
5. Pull back on the stick: G rises, cuff squeezes. Level off: it vents.
6. If FlightGear runs on another computer: `--sim-host <that computer's IP>`.

The bridge tries these G properties in order and uses the first one that gives a believable G reading:
`/accelerations/pilot-g`, `/accelerations/pilot-gdamped`, then `/fdm/jsbsim/accelerations/Nz` as a last resort.
It says out loud when it refuses a reading and why. To force one: `--fg-prop /accelerations/pilot-gdamped`.
You can browse every property at http://localhost:5400.

**Check before the demo:** level flight reads about 1.0, a hard pull reads 3 or more, and it moves while you fly.
If it sits at exactly 1.0 during a pull, that property isn't updating for this aircraft. Force another one.

Test live mode without FlightGear:
```bash
.venv/bin/python fake_flightgear.py       # terminal 1
.venv/bin/python bridge.py --live --print # terminal 2
```

X-Plane also works (`--live --sim xplane`, no X-Plane setup needed; test with `fake_xplane.py`).

## Fallback ladder (if something breaks on stage, step down one rung)

1. Live: cockpit sim (`sim/`), or FlightGear
2. `--demo --loop` (scripted flight + ENTER spikes)
3. Serial Monitor, type `TEST` (proves the hardware alone)
4. The backup video

Say it honestly: "the live sim link is flaky, so here's the same cuff on a scripted flight."

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "No Arduino found" | Cable is charge-only, or Serial Monitor has the port open | Swap the cable; close Serial Monitor |
| Relays click on at power-up | Relay board is active-high | `RELAY_ACTIVE_LOW = false`, re-upload |
| Relays click but cuff doesn't fill | Kill switch off, flat batteries, tube off a barb, valve stuck open | Check switch, measure pack (~12V fresh), re-seat tubes |
| Cuff fills then deflates every half second | Script not sending steadily | Make sure `bridge.py` is running, not just Serial Monitor |
| Cuff lags way behind G | Pump is slow for the bladder (about 30 s to firm today) | Stretch `DEMO_PROFILE` timings; lower `gFull` so it fills sooner. Measure the lag with `bridge.py --step` on video |
| Never reaches full squeeze | `pumpMaxRunMs` shorter than `inflateMs` | Set the cap ~25% above `inflateMs` |
| Squeeze weaker as the day goes on | AAs sagging | Fresh batteries |
| "Waiting for FlightGear..." forever | FlightGear started without `--httpd=5400`, or still loading | See live mode notes above |
| `run-live.sh` says data or aircraft is missing | FlightGear's data download never finished | Install FlightGear to `/Applications`, open it, let the download finish (CONTEXT Open items) |
| Connected but G stuck at one value | Property exists but this aircraft doesn't update it | Try another with `--fg-prop` (see live mode notes) |

## Safety (say this in the pitch)

- Wearer holds a kill switch that cuts power, which stops the pump and vents the cuff.
- Vent valve is normally open: power loss, unplugging or an Arduino reset all deflate.
- No signal for 0.5 s → vent. Pump run time hard-capped. Pump never runs with the vent open.
- Max squeeze set on the bench to "firm but comfortable". Over clothes only. Anyone can stop at any time.
  Volunteers with circulation problems sit it out.

## Batteries and spares

- Spare AAs (pump + valve current drains them; holding pressure keeps the valve powered).
- Cold-spare Arduino with the sketch already uploaded.
- Spare tubing, zip ties, a second USB cable.
- Spare laptop: 04's Mac has the bridge set up. `--demo --print` and `--live --print` against `fake_flightgear.py`
  both pass there. FlightGear is installed there too (data still downloading). No Node.js yet, so it can't run `sim/`.
