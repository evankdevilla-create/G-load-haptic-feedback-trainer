# Instrument cluster: research notes

Four round gauges (G, airspeed, altimeter, attitude), modelled on fighter instruments.
Flat SVG, black faces, white marks, one amber accent, red only for the limit arc.

## Verified against source text

- F-16 accelerometer: main pointer reads -5 g to +10 g; two more pointers hold the max positive and max negative g seen so far, and a reset push-button snaps them back to the main pointer. Applied: dial -5..+10, max/min hold markers, reset on restart.
  https://scottbouch.com/rtfm/volume/ap/4269/c/v1/al75/ap4269c-v1-al75-s5-c2-gd.pdf (via search result text; I did not open the PDF itself)
- Pressure altimeter: three-pointer face, pointers for 100 ft, 1,000 ft and 10,000 ft per revolution, plus a Kollsman window for the pressure setting. Applied: main needle 1,000 ft per turn, short pointer 10,000 ft per turn, digital window. Kollsman window not applied (no pressure model).
  https://en.wikipedia.org/wiki/Altimeter
- Attitude indicator: top half sky (blue), bottom half ground (brown), reference lines for pitch, bank index at the top, fixed miniature aircraft. Applied as such.
  https://en.wikipedia.org/wiki/Attitude_indicator
- HUD: flight path vector, pitch ladder, airspeed tape left and altitude tape right, monochrome (green) symbology. Not applied as tapes; our cluster is head-down analog dials.
  https://en.wikipedia.org/wiki/Head-up_display
- ISA: 15 C / 288.15 K at sea level, -6.5 C per km up to 11 km (-56.5 C), constant above. Speed of sound = sqrt(1.4 * 287.058 * T): 340.3 m/s at sea level, 295.1 m/s at 11 km (checked in test/instruments.test.ts).
  https://en.wikipedia.org/wiki/International_Standard_Atmosphere

## Not verified (my choices)

- Pitch ladder every 5 deg (long rung with numbers every 10), bank marks at 0/10/20/30/45/60/90 (the pitch spacing was not stated on the Wikipedia page; the bank mark set is the brief's).
- Sky-pointer convention: the pointer on the ball turns with the horizon, so on a right bank it moves left on the fixed scale. The digital readout says R or L to remove any doubt.
- Airspeed 0..700 kt over 270 deg, ticks every 25 kt: sized for this jet, not copied from a manual. Shown value is true airspeed (state.v), not indicated.
- 6 G "cuff full" mark and red above 9 G are this trainer's own markings.
- The F-35 panoramic display was not researched in primary sources.
