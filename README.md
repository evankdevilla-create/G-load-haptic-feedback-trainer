# G-load haptic feedback trainer (hackPHS 2026)

A thigh pressure cuff that inflates in proportion to live G-load from a flight sim, like a G-suit bladder.
It is a G-load haptic feedback trainer, not a G-force simulator.

```
sim / demo -> bridge/bridge.py (laptop) -> USB serial "G:<float>\n" @ 20 Hz -> Arduino Uno -> relays -> pump + vent solenoid -> cuff
```

## Folders
- `sim/` - our own cockpit flight sim (React + TypeScript, handoff 03) that flies a set route at set G and stands in for
  FlightGear. See [sim/README.md](sim/README.md).
- `bridge/` - Python laptop script (handoff 03): demo mode, live FlightGear mode (X-Plane also supported), fake sims for testing.
- `firmware/` - Arduino Uno sketch (handoff 02). See [firmware/README.md](firmware/README.md).
- `docs/` - [CONTEXT.md](docs/CONTEXT.md) (start here), [wiring](docs/wiring.md), [demo runbook](docs/demo-runbook.md), team handoffs.
- `pitch/` - pitch script and Devpost draft.

## Run the bridge (Mac)
```bash
cd bridge
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python bridge.py --demo --print   # no Arduino needed
.venv/bin/python bridge.py --demo           # real Arduino, auto-detects the port
.venv/bin/python bridge.py --live           # live G from FlightGear (start FlightGear with --httpd=5400)
./run-live.sh                               # starts FlightGear and the bridge together
```

Live with our cockpit sim instead (needs Node.js): `cd sim && npm install && npm run dev`, open the URL it prints,
then run `bridge.py --live` as above.
Press ENTER for a 6 G spike, Ctrl+C to quit. Each run logs to `bridge/logs/`.
