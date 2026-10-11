"""
Vent feel-test: set the firmware's vent time, then run a pull the operator can watch.

    .venv/bin/python tune_vent.py --ventms 3000 --print    # dry run, opens no port
    .venv/bin/python tune_vent.py --ventms 3000            # real run (auto-detects the Uno)

Sequence: VENTMS:<n>, hold 1 G until ENTER, 6 G for 15 s, 1 G for 15 s, then STOP.
Lines go out at 20 Hz like the bridge, so the firmware dead-man never trips. Ctrl+C is safe (STOP is sent).
"""

import argparse
import sys
import time

import serial

from bridge import BAUD, SEND_RATE_HZ, clamp, find_arduino_port

MIN_VENTMS, MAX_VENTMS = 500, 10000   # same bounds the firmware enforces
PULL_G, PULL_S, RECOVER_S = 6.0, 15, 15

clamp_g = clamp


def parse_args(argv=None):
    p = argparse.ArgumentParser(description="Set ventMs and run a vent feel-test.")
    p.add_argument("--ventms", type=int, required=True, help=f"vent time in ms ({MIN_VENTMS} to {MAX_VENTMS})")
    p.add_argument("--port", help="serial port, e.g. /dev/ttyACM0 (default: auto-detect)")
    p.add_argument("--print", action="store_true", help="dry run: print lines, open no port")
    args = p.parse_args(argv)
    if not MIN_VENTMS <= args.ventms <= MAX_VENTMS:
        p.error(f"--ventms must be {MIN_VENTMS} to {MAX_VENTMS}")
    return args


class Link:
    def __init__(self, port):
        self.ser = serial.Serial(port, BAUD, timeout=0) if port else None
        if self.ser:
            time.sleep(2)   # opening the port resets the Uno

    def send(self, line):
        print(f"  > {line}") if self.ser is None else self.ser.write((line + "\n").encode())

    def close(self):
        if self.ser:
            self.ser.close()


def hold(link, g, seconds=None, until_enter=False):
    """Send G at 20 Hz for `seconds`, or (until_enter) until the operator presses ENTER."""
    line = f"G:{clamp_g(g):.2f}"
    end = None if seconds is None else time.time() + seconds
    if until_enter:
        import select
        while not select.select([sys.stdin], [], [], 0)[0]:
            link.send(line)
            time.sleep(1 / SEND_RATE_HZ)
        if not sys.stdin.readline():
            raise SystemExit("stdin closed, aborting")   # no operator, no pull
        return
    while time.time() < end:
        link.send(line)
        time.sleep(1 / SEND_RATE_HZ)


def main(argv=None):
    args = parse_args(argv)
    port = None
    if not args.print:
        port = args.port or find_arduino_port()
        if port is None:
            sys.exit("No Arduino found. Plug it in or pass --port.")
    print(f"About to set ventMs={args.ventms}, then: 1 G until ENTER, {PULL_G:g} G for {PULL_S} s, "
          f"1 G for {RECOVER_S} s, STOP.")
    print("The cuff WILL inflate and vent. Check the strap and the kill switch.")
    link = Link(port)
    try:
        link.send(f"VENTMS:{args.ventms}")
        print("Holding 1 G (preload). Press ENTER when the cuff is at baseline and you are ready.")
        hold(link, 1.0, until_enter=True)
        print(f"{PULL_G:g} G pull...")
        hold(link, PULL_G, PULL_S)
        print("Back to 1 G: watch how far it vents...")
        hold(link, 1.0, RECOVER_S)
    except KeyboardInterrupt:
        print("\nInterrupted.")
    finally:
        link.send("STOP")
        link.close()
        print("STOP sent.")


if __name__ == "__main__":
    main()
