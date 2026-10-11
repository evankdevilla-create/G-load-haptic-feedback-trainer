"""Live-input safety tests, no serial port and no sim needed. Run: .venv/bin/python test_safety.py"""
import math
import struct
import time

import bridge


def test_clamp_nan_safe():
    assert bridge.clamp(float("nan")) == 0.0
    assert bridge.clamp(float("inf")) == 0.0 and bridge.clamp(float("-inf")) == 0.0
    assert bridge.clamp(99) == 9.0 and bridge.clamp(-3) == 0.0 and bridge.clamp(6.5) == 6.5


def test_usable_g():
    for ok in (-5.0, 0.0, 1.0, 9.0, 15.0):
        assert bridge.usable_g(ok)
    for bad in (float("nan"), float("inf"), float("-inf"), -5.01, 15.01, 1e9, None):
        assert not bridge.usable_g(bad)


def fake_fg(values):
    """A FlightGear whose poll loop runs over `values` (None = failed poll), no thread, no network."""
    fg = bridge.FlightGear.__new__(bridge.FlightGear)
    fg.prop, fg.sign, fg.last_value, fg.last_rx, fg.running = "/p", 1.0, None, 0.0, True
    seq = iter(values)

    def get(_prop):
        try:
            return next(seq)
        except StopIteration:
            fg.running = False
            return None

    fg._get = get
    return fg


def test_flightgear_bad_values_never_reach_read():
    real_sleep = time.sleep
    time.sleep = lambda s: None
    try:
        for bad in (float("inf"), float("nan"), 1e9, -50.0):
            fg = fake_fg([3.0, bad])
            fg._poll()
            assert fg.read() is None, bad
    finally:
        time.sleep = real_sleep


def test_failed_poll_clears_value_and_timeout_short():
    assert bridge.LIVE_TIMEOUT_S <= 0.3
    real_sleep = time.sleep
    time.sleep = lambda s: None
    try:
        fg = fake_fg([4.0])               # one good reading, then 404/timeouts
        fg._poll()
        assert fg.last_value is None and fg.read() is None   # stale value is gone, can't be re-sent
        fg = fake_fg([])
        fg.last_value, fg.last_rx = 5.0, time.time()
        assert fg.read() == 5.0           # fresh data is served
        fg.last_rx = time.time() - 0.5
        assert fg.read() is None          # older than the timeout: no data
    finally:
        time.sleep = real_sleep


def rref(value, idx=1):
    return b"RREF\0" + struct.pack("<if", idx, value)


class FakeSock:
    def __init__(self, packets):
        self.packets = list(packets)

    def recvfrom(self, n):
        if not self.packets:
            raise BlockingIOError
        return self.packets.pop(0)

    def sendto(self, *a):
        pass


def test_xplane_binding_and_sender():
    assert bridge.bind_address("127.0.0.1") == "127.0.0.1" and bridge.bind_address("localhost") == "127.0.0.1"
    assert bridge.bind_address("192.168.1.20") == "0.0.0.0"
    x = bridge.XPlane("127.0.0.1", "d")
    assert x.sock.getsockname()[0] == "127.0.0.1"
    x.sock.close()
    x.sock = FakeSock([(rref(7.0), ("10.9.9.9", 49000))])
    assert x.read() is None, "packet from another address must be ignored"
    x.sock = FakeSock([(rref(3.0), ("127.0.0.1", 49000))])
    assert x.read() == 3.0
    for bad in (float("inf"), float("nan"), 1e9):
        x.last_value, x.last_rx = None, 0.0
        x.sock = FakeSock([(rref(bad), ("127.0.0.1", 49000))])
        assert x.read() is None, bad


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
    print("ok")
