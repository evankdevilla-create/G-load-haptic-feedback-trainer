# Wiring and plumbing

Two separate circuits. They only meet inside the relay board.

- **Logic side (5V):** Arduino ↔ relay board inputs. Powered by the laptop's USB.
- **Load side (12V):** 8xAA pack → kill switch → relay contacts → pump and valve. Never runs through the Arduino.

## Logic side

| Relay board pin | Arduino pin |
|---|---|
| VCC | 5V |
| GND | GND |
| IN1 (pump) | D7 |
| IN2 (vent valve) | D8 |

If the board has a JD-VCC jumper, leave it on (powers the relay coils from the Arduino's 5V; two relays is fine from USB).

**Check the polarity before connecting any loads:** upload the sketch, power the board, and the relays should stay silent with their LEDs off. If both click on at power-up, set `RELAY_ACTIVE_LOW = false` in `g_trainer.ino`.

## Load side

```
 8xAA (+) ──── KILL SWITCH ───┬──── Relay 1 COM      Relay 1 NO ──── Pump (+, red)
                              └──── Relay 2 COM      Relay 2 NO ──── Valve (+)

 8xAA (−) ──────────────────────────────────────────┬─ Pump (−, black)
                                                    └─ Valve (−)
```

- Use each relay's **NO** terminal (normally open *contact*), not NC. Relay off = load unpowered.
  (Not to be confused with the *valve* being normally open: that's about air, this is about electricity.)
- **Kill switch:** any inline on/off switch on the 12V positive lead, in the wearer's hand.
  Because the valve is normally open, cutting 12V stops the pump *and* vents the cuff at once.
- **Flyback diodes (if you can get them):** a 1N4007 (or any 1N400x) across the pump and one across the valve,
  **stripe to the + side**. They soak up the voltage spike when the motor/coil switches off.
- Pump polarity: red to +. If the pump hums but barely blows, check you haven't swapped it.

## What each state means

| Firmware mode | Pump relay | Valve relay | Valve | Cuff |
|---|---|---|---|---|
| VENT (also: unpowered, reset, no signal) | off | off | open | deflates |
| INFLATE | on | on | closed | fills |
| HOLD | off | on | closed | holds pressure |

The pump never runs with the valve open.

## Air path

```
Pump ──► cuff tube A
         cuff tube B ──► vent valve ──► air
```

If the cuff only has one tube, join pump and valve with a T-fitting (aquarium air-line T works):

```
Pump ──► T ──► cuff
          └──► vent valve ──► air
```

Zip-tie every barb. Silicone tubing slides off under pressure otherwise.

## Two legs (no electrical change)

The relay has only 2 channels (pump, valve), so both cuffs share them. Daisy-chain through the bladders, no T fittings needed, because both tubes of a cuff open into the same bladder:

```
Pump ──► cuff 1 tube A     cuff 1 tube B ──► cuff 2 tube A     cuff 2 tube B ──► vent valve ──► air
```

Join cuff 1 tube B to cuff 2 tube A with a short piece of tubing or a coupler that fits the cuff connectors, zip-tied. The valve at the end vents both cuffs (leg 1 drains through leg 2, so it vents a little slower). Fill time roughly doubles, so re-time the preload with both cuffs on. The pump holds pressure on its own, so no check valve is used.
