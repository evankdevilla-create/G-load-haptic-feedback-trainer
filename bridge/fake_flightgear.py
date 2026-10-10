"""
Pretends to be FlightGear's web server (what you get with --httpd=5400), so live
mode can be tested without the sim.

Unlike the real thing it can serve SEVERAL G properties at once, which is the
point: the bridge has to choose between them, and on a real parked c172p it chose
badly. The scenarios below reproduce that.

    Terminal 1:  .venv/bin/python fake_flightgear.py
    Terminal 2:  .venv/bin/python bridge.py --live --print

Scenarios (--scenario):
    normal    every property present and sane. The bridge should pick pilot-g.
    stuck-nz  what we actually saw on the parked c172p: Nz present but pinned at
              0.0 while pilot-g reads correctly. The bridge must NOT pick Nz.
    jsbsim    Nz present but on JSBSim's negative-Z axis (reads about -1 in level
              flight). If it is ever picked, the sign has to be flipped.
    yasim     a YASim aircraft: no /fdm/jsbsim tree at all, only the core
              properties. This is why Nz must never be first.

Properties not served return 404, like a property that does not exist.
Don't run this while real FlightGear is using port 5400.
"""

import argparse
import json
import math
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

NZ = "/fdm/jsbsim/accelerations/Nz"
PILOT_G = "/accelerations/pilot-g"
PILOT_GDAMPED = "/accelerations/pilot-gdamped"

parser = argparse.ArgumentParser()
parser.add_argument("--port", type=int, default=5400)
parser.add_argument("--scenario", default="stuck-nz",
                    choices=["normal", "stuck-nz", "jsbsim", "yasim"],
                    help="which set of properties to serve (default: stuck-nz,"
                         " the bug we saw on the real parked c172p)")
parser.add_argument("--prop", help="serve ONLY this one property (overrides --scenario)")
parser.add_argument("--hold", type=float,
                    help="serve this fixed G instead of swinging 1..6 G")
args = parser.parse_args()
start = time.time()


def live_g():
    """Swings smoothly between 1 G and 6 G every 10 s, or holds --hold."""
    if args.hold is not None:
        return args.hold
    return 3.5 - 2.5 * math.cos((time.time() - start) * 2 * math.pi / 10)


def properties():
    """The properties this fake aircraft exposes right now, path -> value."""
    g = live_g()
    if args.prop:
        return {args.prop: g}
    if args.scenario == "normal":
        return {NZ: g, PILOT_G: g, PILOT_GDAMPED: g}
    if args.scenario == "stuck-nz":
        return {NZ: 0.0, PILOT_G: g, PILOT_GDAMPED: g}
    if args.scenario == "jsbsim":
        return {NZ: -g, PILOT_G: g, PILOT_GDAMPED: g}
    return {PILOT_G: g, PILOT_GDAMPED: g}      # yasim: no /fdm/jsbsim tree


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?")[0]
        if not path.startswith("/json"):
            self.send_error(404)
            return
        prop = path[len("/json"):]
        values = properties()
        if prop not in values:
            self.send_error(404)
            return
        body = json.dumps({
            "path": prop,
            "name": prop.rsplit("/", 1)[-1],
            "value": round(values[prop], 4),
            "type": "double",
            "index": 0,
            "nChildren": 0,
        }).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass   # keep the terminal quiet


served = ", ".join(properties()) or "(nothing)"
print(f"Fake FlightGear on http://localhost:{args.port}/json")
print(f"  scenario: {args.prop or args.scenario}")
print(f"  serving:  {served}")
print("Ctrl+C to quit.")
try:
    HTTPServer(("127.0.0.1", args.port), Handler).serve_forever()
except KeyboardInterrupt:
    print("\nStopped.")
