/** Air-data maths for the gauges: ISA speed of sound, Mach, vertical speed, altimeter pointers. */

import { wrapDeg } from "./scale";

export const KNOTS_PER_MS = 1.944;
export const FEET_PER_M = 3.281;
const FPM_PER_MS = 196.85;
const GAMMA_AIR = 1.4;
const R_AIR = 287.058;
const T0 = 288.15;
const LAPSE = 0.0065;
const TROPOPAUSE_M = 11000;

/** Speed of sound (m/s) in the International Standard Atmosphere. Constant above 11 km. */
export function speedOfSound(altM: number): number {
  const h = Number.isFinite(altM) ? Math.max(0, altM) : 0;
  const t = h < TROPOPAUSE_M ? T0 - LAPSE * h : T0 - LAPSE * TROPOPAUSE_M;
  return Math.sqrt(GAMMA_AIR * R_AIR * t);
}

export function machNumber(vMs: number, altM: number): number {
  return Number.isFinite(vMs) ? vMs / speedOfSound(altM) : 0;
}

/** Vertical speed in feet per minute from true airspeed and flight path angle (rad). */
export function vviFpm(vMs: number, gammaRad: number): number {
  const fpm = vMs * Math.sin(gammaRad) * FPM_PER_MS;
  return Number.isFinite(fpm) ? fpm : 0;
}

/** Altimeter pointer angles (deg): main needle 1000 ft per turn, thousands pointer 10000 ft per turn. */
export function altimeterPointers(altFt: number): { hundreds: number; thousands: number } {
  const ft = Number.isFinite(altFt) ? Math.max(0, altFt) : 0;
  return { hundreds: (ft % 1000) * 0.36, thousands: (ft % 10000) * 0.036 };
}

/** Heading in whole degrees 0..359 from radians. */
export function headingDeg(psiRad: number): number {
  return Math.round(wrapDeg((psiRad * 180) / Math.PI)) % 360;
}
