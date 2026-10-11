"""Port detection and tune_vent argument tests, no hardware. Run: .venv/bin/python test_ports.py"""
from types import SimpleNamespace as P

import bridge
import tune_vent


def ports(*items):
    return lambda: [P(device=d, description=desc, manufacturer=man, vid=vid) for d, desc, man, vid in items]


def find(*items):
    bridge.serial.tools.list_ports.comports = ports(*items)
    return bridge.find_arduino_port()


def test_port_detection():
    assert find(("/dev/ttyACM0", "ttyACM0", None, None)) == "/dev/ttyACM0"
    assert find(("/dev/ttyUSB0", "USB Serial", None, None)) == "/dev/ttyUSB0"
    assert find(("/dev/tty.usbmodem1101", "n/a", None, None)) == "/dev/tty.usbmodem1101"
    assert find(("COM3", "USB Serial Device", "Arduino LLC", None)) == "COM3"
    assert find(("COM4", "USB Serial", None, 0x2341)) == "COM4"
    assert find(("COM5", "USB-SERIAL CH340", None, 0x1A86)) == "COM5"
    assert find(("/dev/ttyS0", "n/a", None, None), ("/dev/ttyACM1", "x", None, None)) == "/dev/ttyACM1"
    assert find(("/dev/ttyS0", "n/a", None, None), ("/dev/ttyS1", "n/a", None, None)) is None
    assert find() is None


def test_tune_args():
    assert tune_vent.parse_args(["--ventms", "3000", "--print"]).ventms == 3000
    for bad in ("499", "10001", "-5", "0"):
        try:
            tune_vent.parse_args(["--ventms", bad])
        except SystemExit:
            continue
        raise AssertionError(f"--ventms {bad} should be refused")
    assert tune_vent.clamp_g(99) == 9.0 and tune_vent.clamp_g(-3) == 0.0 and tune_vent.clamp_g(6) == 6.0
    assert tune_vent.clamp_g(float("nan")) == 0.0


if __name__ == "__main__":
    test_port_detection()
    test_tune_args()
    print("ok")
