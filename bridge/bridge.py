"""
hackPHS 2026 - G-load bridge (handoff 03)

What this does, in one sentence:
    Every 1/20th of a second, pick a G value and send it to the Arduino
    as a line of text like "G:3.20".

How to run it (from the bridge folder):
    .venv/bin/python bridge.py --demo --print     # no Arduino needed, just prints
    .venv/bin/python bridge.py --demo             # sends to the real Arduino
    .venv/bin/python bridge.py --demo --loop      # repeat the demo forever
    .venv/bin/python bridge.py --live             # read G from FlightGear (start it with --httpd=5400)
    .venv/bin/python bridge.py --live --sim xplane   # or from X-Plane
    .venv/bin/python bridge.py --step             # square wave, for timing how fast the cuff reacts

    ./run-live.sh                                 # starts FlightGear AND the bridge for you

While it runs: press ENTER to trigger a 6 G spike. Press Ctrl+C to quit.
"""

import argparse
import csv
import os
import socket
import struct
import json
import math
import threading
import time
import urllib.request
from datetime import datetime

import serial
import serial.tools.list_ports


# ---------------------------------------------------------------------------
# SETTINGS - the numbers you are most likely to change
# ---------------------------------------------------------------------------

BAUD = 115200          # serial speed, must match the Arduino sketch
SEND_RATE_HZ = 20      # how many lines per second we send
MIN_G, MAX_G = 0.0, 9.0

# The pretend flight for demo mode: (seconds since start, G at that moment).
# Between two points the G value slides smoothly from one to the other.
# Stretch these out if the cuff turns out to inflate slowly.
DEMO_PROFILE = [
    (0, 1.0),
    (3, 1.0),
    (7, 5.0),    # first pull up to 5 G
    (10, 5.0),   # hold it
    (14, 1.0),   # back to level flight
    (17, 1.0),
    (21, 7.0),   # bigger pull to 7 G
    (24, 7.0),
    (28, 1.0),
    (31, 1.0),
]

# --step plays a clean square wave instead of a flight, for measuring how long the
# cuff takes to react: calm 1 G, an instant jump, then back down. The jump instant
# is printed and logged so you can line it up against a video of the cuff.
STEP_G = 6.0
STEP_LEAD_S = 5.0      # calm 1 G before the jump, so the cuff is settled and empty
STEP_HOLD_S = 6.0      # held at STEP_G
STEP_TAIL_S = 5.0      # back at 1 G afterwards, to time the vent as well

# What happens when you press ENTER: ramp up, hold, ramp down.
SPIKE_G = 6.0
SPIKE_RAMP_UP = 1.0    # seconds
SPIKE_HOLD = 2.0
SPIKE_RAMP_DOWN = 1.5

# Live mode (FlightGear). FlightGear must be started with --httpd=5400, which
# turns on its built-in web server. We read one property from it 20x a second.
FG_PORT = 5400
# FlightGear exposes several G properties and they are NOT equally trustworthy, so
# the order here matters. Checked 2026-10-10 against the FlightGear/JSBSim docs and
# our own parked-aircraft link test:
#   - pilot-g and pilot-gdamped live in FlightGear's core, so they exist whichever
#     flight model the aircraft uses (JSBSim *or* YASim), and both read ~1.0 at rest.
#     That matters for us: the F-16s in the hangar come in both flavours.
#   - /fdm/jsbsim/accelerations/Nz is JSBSim-internal, so it is simply absent on a
#     YASim aircraft, and it is measured on a negative-Z axis, so level flight can
#     read -1. On our parked c172p it read 0.0 while pilot-g correctly read 1.0.
# So: pilot-g first, Nz only as a last resort.
FG_G_PROPERTIES = [
    "/accelerations/pilot-g",         # raw load factor felt by the pilot - what a g-meter shows
    "/accelerations/pilot-gdamped",   # the same, low-pass filtered by FlightGear
    "/fdm/jsbsim/accelerations/Nz",   # JSBSim only, sign varies - last resort
]
# A candidate property must read like a real load factor before we trust it. This
# guards the bug that bit us on the parked c172p: Nz was present and returned a
# perfectly valid 0.0, so the old "first property that parses" rule locked onto a
# dead reading and the cuff would never have inflated. An aircraft at rest or in
# level flight reads ~1.0. If we happen to probe during a genuine 0 G pushover we
# just keep probing and lock on a moment later.
G_PLAUSIBLE_MIN = 0.25
G_PLAUSIBLE_MAX = 9.5

# Live mode (X-Plane, alternative). X-Plane listens for requests on UDP port 49000 and
# sends the value back to us. g_nrml = vertical G-load in g (1.0 in level flight).
XPLANE_PORT = 49000
XPLANE_DATAREF = "sim/flightmodel/forces/g_nrml"
LIVE_TIMEOUT_S = 0.3   # no data from the sim this long -> stop sending (cuff vents)
SMOOTHING = 0.4        # 0..1, how far to move toward each new reading. 1 = no smoothing


# ---------------------------------------------------------------------------
# Working out the G value
# ---------------------------------------------------------------------------

def slide(a, b, fraction):
    """Linear interpolation: 'fraction' of the way from a to b (0.0 to 1.0)."""
    return a + (b - a) * fraction


def demo_g(t):
    """G value from DEMO_PROFILE at t seconds into the demo."""
    for (t1, g1), (t2, g2) in zip(DEMO_PROFILE, DEMO_PROFILE[1:]):
        if t1 <= t <= t2:
            return slide(g1, g2, (t - t1) / (t2 - t1))
    return DEMO_PROFILE[-1][1]   # past the end: stay at the last value


def spike_g(t):
    """Extra G from an ENTER-key spike, t seconds after the key was pressed.
    Returns None when the spike is over."""
    if t < SPIKE_RAMP_UP:
        return slide(1.0, SPIKE_G, t / SPIKE_RAMP_UP)
    t -= SPIKE_RAMP_UP
    if t < SPIKE_HOLD:
        return SPIKE_G
    t -= SPIKE_HOLD
    if t < SPIKE_RAMP_DOWN:
        return slide(SPIKE_G, 1.0, t / SPIKE_RAMP_DOWN)
    return None


def step_g(t):
    """Square-wave G for --step. Returns (g, phase, finished).
    'phase' changes name at each edge, which is what triggers the printed marker."""
    if t < STEP_LEAD_S:
        return 1.0, "lead", False
    if t < STEP_LEAD_S + STEP_HOLD_S:
        return STEP_G, "step-up", False
    if t < STEP_LEAD_S + STEP_HOLD_S + STEP_TAIL_S:
        return 1.0, "step-down", False
    return 1.0, "done", True


def usable_g(v):
    """A live reading we are willing to act on: a finite number in a believable range."""
    return isinstance(v, (int, float)) and math.isfinite(v) and -5.0 <= v <= 15.0


def bind_address(sim_host):
    """Local-only unless the sim is on another machine."""
    return "127.0.0.1" if sim_host in ("127.0.0.1", "localhost", "::1") else "0.0.0.0"


def clamp(g):
    """Keep G inside the range the Arduino accepts."""
    if not math.isfinite(g):  # NaN/inf would otherwise come out as MAX_G
        return MIN_G
    return max(MIN_G, min(MAX_G, g))


# ---------------------------------------------------------------------------
# Listening for the ENTER key (runs in the background)
# ---------------------------------------------------------------------------

spike_started_at = None   # time of the last ENTER press, or None


def listen_for_enter():
    global spike_started_at
    while True:
        try:
            input()
        except EOFError:
            return
        spike_started_at = time.time()
        print(">>> SPIKE!")


# ---------------------------------------------------------------------------
# Talking to the Arduino
# ---------------------------------------------------------------------------

def find_arduino_port():
    """Look through USB serial devices for something that looks like an Arduino.
    macOS: 'usbmodem' (genuine) / 'usbserial' (clones). Linux: ttyACM*/ttyUSB*.
    Also matches the Arduino/CH340 descriptions and vendor ids 0x2341 / 0x1a86."""
    for p in serial.tools.list_ports.comports():
        name = p.device.lower()
        text = ((p.description or "") + " " + (getattr(p, "manufacturer", None) or "")).lower()
        if (any(k in name for k in ("usbmodem", "usbserial", "ttyacm", "ttyusb"))
                or "arduino" in text or "ch340" in text
                or getattr(p, "vid", None) in (0x2341, 0x1A86)):
            return p.device
    return None


def connect(port_override):
    """Open the serial port. Keeps trying until it works (Ctrl+C to give up)."""
    while True:
        port = port_override or find_arduino_port()
        if port is None:
            print("No Arduino found. Plug it in... (retrying)")
        else:
            try:
                ser = serial.Serial(port, BAUD, timeout=0)
                print(f"Connected to {port}. Waiting 2 s for the Arduino to reboot...")
                time.sleep(2)   # opening the port resets the Uno
                return ser
            except serial.SerialException as e:
                print(f"Could not open {port}: {e} (retrying)")
        time.sleep(1)


# ---------------------------------------------------------------------------
# Reading G from X-Plane
# ---------------------------------------------------------------------------

class FlightGear:
    """Reads G from FlightGear's built-in web server (start FlightGear with --httpd=5400).
    You can check the same value in a browser: http://localhost:5400/json/fdm/jsbsim/accelerations/Nz
    A background thread keeps asking; read() returns the newest answer."""

    name = "FlightGear"

    def __init__(self, host, port, prop=None):
        self.base = f"http://{host}:{port}/json"
        self.port = port          # only for the "FlightGear needs --httpd=..." hint
        self.candidates = [prop] if prop else FG_G_PROPERTIES
        self.forced = prop is not None   # --fg-prop: trust the human, skip the sanity check
        self.prop = None          # which property we settled on
        self.sign = 1.0           # flipped to -1 for JSBSim's negative-Z Nz
        self.last_value = None
        self.last_rx = 0.0
        self.running = True
        threading.Thread(target=self._poll, daemon=True).start()

    def _get(self, prop):
        """One property's value as a float, or None."""
        try:
            with urllib.request.urlopen(self.base + prop, timeout=0.5) as resp:
                value = json.load(resp).get("value")
            value = float(value)
            return value if value == value else None   # value == value skips NaN
        except Exception:
            return None   # FlightGear not running yet, property missing, bad reply...

    def _probe(self):
        """Try every candidate property once and lock onto the first believable one.
        Prints what each one returned, so a wrong pick is obvious on the terminal
        instead of silently producing a cuff that never inflates."""
        report = []
        for prop in self.candidates:
            value = self._get(prop)
            if value is None:
                report.append(f"  {prop}: not present")
                continue
            if not self.forced and not (G_PLAUSIBLE_MIN <= abs(value) <= G_PLAUSIBLE_MAX):
                report.append(f"  {prop}: reads {value:+.3f} - ignoring, that is not a"
                              " believable load factor")
                continue
            # JSBSim measures Nz on a negative-Z axis, so level flight can read -1.
            self.sign = -1.0 if value < 0 else 1.0
            self.prop = prop
            flipped = "  [negative axis, flipping the sign]" if self.sign < 0 else ""
            print(f"Reading G from {prop} (reads {abs(value):.2f} G right now){flipped}")
            return True
        print(f"No usable G property yet. FlightGear needs --httpd={self.port} and an"
              " aircraft loaded. Tried:")
        print("\n".join(report) if report else "  (no reply at all from FlightGear)")
        return False

    def _poll(self):
        while self.running:
            if self.prop is None:
                if not self._probe():
                    time.sleep(1)
                continue
            value = self._get(self.prop)
            value = value * self.sign if value is not None else None
            if value is None or not usable_g(value):
                self.last_value = None   # failed/implausible poll: never re-send a stale reading
                if time.time() - self.last_rx > 5:
                    self.prop = None   # lost it for a while: search again (aircraft change, restart)
                time.sleep(0.2)
                continue
            self.last_value = value
            self.last_rx = time.time()
            time.sleep(1 / SEND_RATE_HZ)

    def read(self):
        """Newest G from FlightGear, or None if nothing has arrived for a while."""
        if time.time() - self.last_rx > LIVE_TIMEOUT_S:
            return None
        return self.last_value

    def close(self):
        self.running = False


class XPlane:
    """Asks X-Plane to stream one value (a 'dataref') to us over UDP.
    No setup needed inside X-Plane: we send an RREF request, it replies."""

    name = "X-Plane"
    INDEX = 1   # our label for the value; X-Plane sends it back with each reply

    def __init__(self, host, dataref):
        self.addr = (host, XPLANE_PORT)
        self.dataref = dataref
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.ip = socket.gethostbyname(host)   # only packets from here are believed
        self.sock.bind((bind_address(host), 0))   # any free port; replies come back here
        self.sock.setblocking(False)
        self.last_value = None
        self.last_rx = 0.0
        self.last_request = 0.0

    def _request(self, rate_hz):
        # 'RREF', a zero byte, how often (per second), our index, the dataref name
        msg = struct.pack("<4sxii400s", b"RREF", rate_hz, self.INDEX, self.dataref.encode())
        try:
            self.sock.sendto(msg, self.addr)
        except OSError:
            pass   # network hiccup; we retry anyway

    def read(self):
        """Newest G from X-Plane, or None if nothing has arrived for a while."""
        now = time.time()
        # (Re)subscribe every 2 s until data flows - covers X-Plane starting late.
        if now - self.last_rx > LIVE_TIMEOUT_S and now - self.last_request > 2:
            self._request(SEND_RATE_HZ)
            self.last_request = now
        while True:   # drain every packet waiting, keep the newest value
            try:
                data, sender = self.sock.recvfrom(2048)
            except (BlockingIOError, OSError):
                break
            if sender[0] != self.ip:
                continue   # not from the sim we asked
            if not data.startswith(b"RREF") or len(data) < 13:
                continue
            for i in range(5, len(data) - 7, 8):   # 8-byte (index, value) pairs
                idx, value = struct.unpack("<if", data[i:i + 8])
                if idx == self.INDEX and usable_g(value):   # skips NaN, inf, absurd values
                    self.last_value = value
                    self.last_rx = now
        if now - self.last_rx > LIVE_TIMEOUT_S:
            return None
        return self.last_value

    def close(self):
        self._request(0)   # rate 0 = unsubscribe
        self.sock.close()


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def main():
    global spike_started_at

    parser = argparse.ArgumentParser(description="Send G-load to the Arduino.")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--demo", action="store_true", help="play the scripted demo flight")
    mode.add_argument("--live", action="store_true", help="read live G from the flight sim")
    mode.add_argument("--step", action="store_true",
                      help="square-wave 1 G -> 6 G -> 1 G, for measuring cuff lag")
    parser.add_argument("--print", action="store_true", help="print lines instead of sending them")
    parser.add_argument("--loop", action="store_true", help="repeat the demo forever")
    parser.add_argument("--port", help="serial port, e.g. /dev/tty.usbmodem1101 (default: auto-detect)")
    parser.add_argument("--sim", choices=["flightgear", "xplane"], default="flightgear",
                        help="which sim --live reads from (default: flightgear)")
    parser.add_argument("--sim-host", default="127.0.0.1",
                        help="IP of the computer running the sim (default: this one)")
    parser.add_argument("--fg-port", type=int, default=FG_PORT,
                        help="FlightGear --httpd port (default: 5400)")
    parser.add_argument("--fg-prop", help="FlightGear G property to read (default: auto-detect)")
    parser.add_argument("--dataref", default=XPLANE_DATAREF, help="X-Plane value to read")
    parser.add_argument("--smoothing", type=float, default=SMOOTHING,
                        help=f"live-mode low-pass, 0..1 (default {SMOOTHING}; 1 = no smoothing,"
                             " lower = smoother but laggier)")
    args = parser.parse_args()
    if not 0 < args.smoothing <= 1:
        parser.error("--smoothing must be above 0 and at most 1")

    # Open the Arduino connection unless we're only printing.
    ser = None if args.print else connect(args.port)
    sim = None
    if args.live and args.sim == "flightgear":
        sim = FlightGear(args.sim_host, args.fg_port, args.fg_prop)
    elif args.live:
        sim = XPlane(args.sim_host, args.dataref)

    # Start a CSV log file for this run, e.g. bridge/logs/run-2026-10-10_14-03-22.csv
    # (always next to this script, wherever you run it from)
    log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
    os.makedirs(log_dir, exist_ok=True)
    log_path = os.path.join(log_dir, datetime.now().strftime("run-%Y-%m-%d_%H-%M-%S.csv"))
    log_file = open(log_path, "w", newline="")
    log = csv.writer(log_file)
    log.writerow(["time_s", "g_raw", "g_sent", "source"])
    print(f"Logging to {log_path}")

    threading.Thread(target=listen_for_enter, daemon=True).start()
    print("Running. Press ENTER for a spike, Ctrl+C to quit.\n")

    start = time.time()
    demo_length = DEMO_PROFILE[-1][0]
    smoothed = None
    waiting_shown = False
    step_phase = None

    try:
        while True:
            now = time.time()
            t = now - start

            # 1. Decide on G
            if args.live:
                raw = sim.read()
                if raw is not None and not usable_g(raw):
                    raw = None   # treat as no data so the Arduino vents
                if raw is None:
                    # No data from the sim: send nothing, so the Arduino vents.
                    if not waiting_shown:
                        print(f"Waiting for {sim.name} at {args.sim_host}... (cuff stays vented)")
                        waiting_shown = True
                    smoothed = None
                    time.sleep(1 / SEND_RATE_HZ)
                    continue
                if waiting_shown:
                    print(f"{sim.name} connected.")
                    waiting_shown = False
                smoothed = raw if smoothed is None else smoothed + args.smoothing * (raw - smoothed)
                g = smoothed
                source = "live"
            elif args.step:
                g, phase, finished = step_g(t)
                if finished:
                    print("Step test finished. The jump instants are in the CSV "
                          "(look at the 'source' column).")
                    break
                if phase != step_phase:
                    step_phase = phase
                    if phase in ("step-up", "step-down"):
                        print(f">>> {phase.upper()} at t={t:.2f}s, now sending G:{g:.2f}"
                              " - time the cuff from here")
                raw = g
                source = f"step-{phase}"
            else:
                if args.loop:
                    t_demo = t % demo_length
                elif t > demo_length:
                    print("Demo finished.")
                    break
                else:
                    t_demo = t
                raw = g = demo_g(t_demo)
                source = "demo"

            if spike_started_at is not None:
                s = spike_g(now - spike_started_at)
                if s is None:
                    spike_started_at = None      # spike over
                elif s > g:
                    g = s                        # spike wins if it's higher
                    source = "spike"

            g = clamp(g)
            line = f"G:{g:.2f}\n"

            # 2. Send it (or just print it)
            if args.print:
                print(line, end="")
            else:
                try:
                    ser.write(line.encode())
                    ser.read(ser.in_waiting or 1)   # throw away anything the Arduino sends back
                except (serial.SerialException, OSError):
                    print("Lost the Arduino! Reconnecting...")
                    ser.close()
                    ser = connect(args.port)

            # 3. Write it to the log
            log.writerow([f"{t:.2f}", f"{raw:.2f}", f"{g:.2f}", source])
            log_file.flush()   # save now, so a crash doesn't lose the log

            # 4. Wait until it's time for the next line
            time.sleep(max(0, 1 / SEND_RATE_HZ - (time.time() - now)))

    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        log_file.close()
        if sim:
            sim.close()
        if ser:
            ser.close()   # Arduino stops hearing us -> vents the cuff on its own


if __name__ == "__main__":
    main()
