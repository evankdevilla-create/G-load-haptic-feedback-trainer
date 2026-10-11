# Firmware (handoff 02)

Arduino Uno sketch that turns `G:<float>` lines into pump and vent-valve relay actions.
Wiring: [docs/wiring.md](../docs/wiring.md).

## Upload

1. Install the Arduino IDE (arduino.cc/en/software).
2. Open `g_trainer/g_trainer.ino`. The IDE also opens `trainer_logic.h` as a second tab.
3. Tools → Board → Arduino Uno. Tools → Port → the `usbmodem` (or `usbserial` for clones) entry.
4. Click Upload.

## Set the real timings (do this once 01 has measured them)

Open `trainer_logic.h` and change these in `TrainerConfig`:

| Setting | Meaning | Current value (01, hand-timed on the leg) |
|---|---|---|
| `inflateMs` | pump time, empty → comfortably firm | 30000 |
| `ventMs` | vent time, firm → completely empty (starting point, real vent is non-linear; tune live with `VENTMS:<n>`) | 3000 |
| `pumpMaxRunMs` | hard cap on one pump run; keep it above `inflateMs` | 35000 |
| `preloadMs` | pump time from empty to the baseline held at 1 G (0 = no preload) | 25000 |
| `gFull` | G that means a full squeeze | 6.0 |

## Hand test (no laptop script needed)

Tools → Serial Monitor, set **115200 baud** and **Newline**. Type:

| Type | Expect |
|---|---|
| `TEST` | inflate 2 s, then vent 2 s (one-shot, 10 s cooldown, ignored after STOP) |
| `G:6.0` (keep resending) | inflates to full, then holds |
| `G:1.0` | vents |
| `STATUS` | one line: g, target, fill estimate, mode |
| `STOP` | vents immediately |
| `VENTMS:3000` | sets the vent time (500 to 10000 ms, runtime only); `STATUS` shows `ventms=` |
| `CLEAR` | clears a `FAULT` (output watchdog tripped; outputs stay off until then) |

Typing a single `G:6.0` and waiting will vent after 0.5 s: that's the dead-man safety working, because the
real script sends 20 lines a second. Use `TEST` for hand checks, or run `bridge.py --demo`.

## How it decides

There's no pressure sensor, so the sketch estimates how full the cuff is from how long it has pumped and vented.

- G is mapped to a target fill: 1 G or less = the **preload** baseline (`preloadMs / inflateMs`, 25 s of 30 s = 0.83), 6 G or more = full, straight line in between. With `preloadMs = 0` the baseline is empty.
- **Prep:** at start (or after the signal returns) the first G line makes it pump up to the baseline and hold; it then follows G from there. Back at 1 G it vents only down to the baseline, not empty.
- Below target → inflate (pump on, valve closed). Above target → vent (both off). Close enough → hold (valve closed only).
- A deadband stops the relays chattering on small G wiggles.
- Dead-man or `STOP` vents all the way to empty, which resets any estimate drift. With a preload, returning to 1 G no longer does that, so the estimate can drift over many pulls. Re-zero by sending `STOP`, waiting ~6 s, then letting G lines resume (it re-preps). A pump cap lockout also only clears after a full vent.

## Safety built in

- No valid line for 500 ms → vent.
- Pump run capped at `pumpMaxRunMs`; locked out until the cuff has fully vented.
- Pump never runs with the valve open.
- Pump budget: at most `pumpWindowBudgetMs` (60 s) of pump-on time in any rolling 120 s, so flapping or repeated TESTs cannot dodge the per-run cap.
- Full-hold limit: fill at 0.95+ for `fullHoldMaxMs` (20 s) forces a vent to the baseline until G drops below 2.
- Output watchdog: pump relay continuously on past `pumpMaxRunMs` + 2 s latches `FAULT` (both relays off, G lines ignored) until `CLEAR`.
- Watchdog resets the board if the code hangs. A reset or unplugged board leaves every relay off = valve open = vented.
- Overlong or garbage serial lines are dropped.

## Tests

The control logic is unit-tested on a laptop (34 checks, including preload, dead-man, pump cap, deadband, garbage input):

```bash
cd firmware/test && g++ -std=c++11 -I../g_trainer test_logic.cpp -o test_logic && ./test_logic
```
