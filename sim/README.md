# Cockpit sim (`sim/`)

A first-person flight simulator in React + TypeScript that flies a **set route**
at **set G**, and drives the pressure cuff while it does it.

It exists because the live-sim path was blocked: FlightGear needs a ~2 GB data
download that never finished on the demo laptop, so there were no aircraft to
fly (see Open items in `docs/CONTEXT.md`). This runs in a browser with nothing
to install, and it is also a better demo — the G schedule is scripted, so the
cuff does the same thing every single run.

```
route.ts            the set route: a fixed list of maneuvers with fixed G
  -> dynamics.ts    3-DOF flight model. G is the INPUT; the path follows from it
    -> the browser  cockpit view, HUD, G meter, ground track, G profile
      -> POST /g    20 Hz
        -> server/g-server.mjs      pretends to be FlightGear's --httpd
          -> bridge/bridge.py --live    UNCHANGED
            -> Arduino -> relay -> pump + valve -> cuff
```

## Running it

```bash
cd sim
npm install
npm run dev        # starts the sim on :5173 and the g-server on :5400
```

Open the URL Vite prints. That is the whole demo if you only want the picture.

To make the cuff move as well, start the bridge in another terminal exactly as
you would for FlightGear:

```bash
cd bridge
.venv/bin/python bridge.py --live --print     # --print to check it first
.venv/bin/python bridge.py --live             # for real, with the Arduino
```

The HUD shows `CUFF LINK LIVE` once the sim is posting successfully.

## Why it goes through `bridge.py` instead of talking to the Arduino directly

A browser can open a serial port with the Web Serial API, and that would have
been fewer moving parts. It was still the wrong call. `bridge.py` already holds
the behaviour we depend on: clamping G to the range the firmware accepts, a
steady 20 Hz so the dead-man timer never trips by accident, reconnecting when
the USB drops, and CSV logging. Reimplementing that in a tab, for a pump
strapped to someone's leg, trades tested safety code for convenience.

So `g-server.mjs` answers on the same URL shape FlightGear's `--httpd` serves,
and the bridge cannot tell the difference. **Nothing in `bridge/`, `firmware/`
or the serial contract changed to make this work.**

## Failing safe

If the browser tab freezes, is closed, or the laptop sleeps mid-pull, the cuff
must not stay inflated. The chain handles it:

1. The sim stops posting.
2. After 400 ms the g-server reports the G property as **absent** (404) rather
   than serving a stale value.
3. The bridge sees no data and stops sending.
4. The firmware's dead-man timer times out and vents the cuff.

Pausing the sim is different and deliberate: it keeps posting a steady 1.0 G, so
the cuff drops to its preload baseline (1 G) but the link stays visibly up. Only the dead-man (K, X, or a dead tab) empties it fully.

## The flight model

Load factor is the **input**, not a measurement. The route says "6 G for four
seconds" and the trajectory is derived from it, which is what makes "a set
amount of G" exact. The equations are the standard point-mass set for
coordinated flight:

```
gamma_dot = (g0 / V) * (n * cos(phi) - cos(gamma))
psi_dot   = (g0 * n * sin(phi)) / (V * cos(gamma))
V_dot     = thrust - drag - g0 * sin(gamma)
```

A level turn therefore needs `n * cos(phi) = 1`, so the bank for a given load
factor is `acos(1/n)` — 60 degrees at 2 G. The tests assert that, and the turn
legs hold the commanded G exactly while trimming **bank** to hold altitude,
rather than trading G away.

Physics runs at a fixed 100 Hz independent of frame rate, so the same route
always flies the same way. That is also what lets the HUD draw the complete
ground track and G profile before you have flown them.

The aeroplane is energy-limited like a real one: a sustained high-G turn bleeds
speed, and a slow wing cannot make 6 G. `routeFeasibility()` flies the route
headless and fails the test suite if any leg asks for G the aircraft cannot
actually deliver — so you cannot quietly edit the route into one where the cuff
never reaches the squeeze you scripted.

## Editing the route

`src/flight/route.ts`. Change the numbers and both the flight path and the cuff
follow. Keep two things in mind:

- **6 G is the useful ceiling.** The firmware maps 1 G to an empty cuff and
  about 6 G to a full one, so pulling past 6 adds nothing the wearer can feel.
- **Follow hard legs with level ones.** High G bleeds energy; the feasibility
  test will tell you if you have overdone it.

```bash
npm test         # 22 physics tests, including the route feasibility check
npm run typecheck
npm run build
```

## Layout

| Path | What it is |
|---|---|
| `src/flight/dynamics.ts` | the flight model. Pure functions, fully tested |
| `src/flight/route.ts` | the set route and the feasibility checker |
| `src/flight/track.ts` | pre-flies the route for the map and G profile |
| `src/flight/useFlight.ts` | fixed-timestep loop driven from the render frame |
| `src/scene/` | the 3D world and the pilot's-eye camera |
| `src/hud/` | canopy overlay, G meter, instruments, map, G profile |
| `src/telemetry/useCuffLink.ts` | posts G to the g-server at 20 Hz |
| `server/g-server.mjs` | the FlightGear-shaped endpoint the bridge reads |
| `test/dynamics.test.ts` | closed-form checks on the physics |
