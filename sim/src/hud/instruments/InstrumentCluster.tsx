/**
 * Bottom instrument cluster: G, airspeed, altimeter, attitude. Needles and the
 * ADI ball follow the per-frame state; the aria labels use the 20 Hz sample.
 */

import { useRef } from "react";
import type { FlightState } from "../../flight/types";
import { SATURATED_G, SatTag } from "../GMeter";
import { useFrameValue } from "../useFrameValue";
import { FEET_PER_M, headingDeg, KNOTS_PER_MS, machNumber } from "./air";
import { AdiRing, AltRing, GRing, SpeedRing, vviLabel } from "./Rings";
import { updateHold, type Hold } from "./scale";

const DEG = 180 / Math.PI;
const pad3 = (n: number) => String(n).padStart(3, "0");
const signed = (n: number) => `${n >= 0 ? "+" : "-"}${Math.abs(Math.round(n))}`;

export function InstrumentCluster({ state, getState }: { state: FlightState; getState?: () => FlightState }) {
  const s = useFrameValue(getState ?? (() => state));
  const hold = useRef<Hold | undefined>(undefined);
  hold.current = updateHold(hold.current, s.g, s.t);

  const pitch = (s.gamma + s.alpha) * DEG;
  const bank = s.phi * DEG;
  const bankText = `${bank >= 0 ? "R" : "L"} ${Math.abs(Math.round(bank))}°`;
  const mach = machNumber(s.v, s.pos.y).toFixed(2);

  const label = (name: string, text: string) => `${name} ${text}`;
  return (
    <div className="panel instruments" role="group" aria-label="Flight instruments">
      <div className="ins-grid">
        <figure className="ins-g" role="group" aria-label={label("G load", `${state.g.toFixed(1)} G`)}>
          <GRing g={s.g} hold={hold.current} />
          <figcaption>
            <span>MAX <b>{hold.current.max.toFixed(1)}</b></span>
            <span>MIN <b>{hold.current.min.toFixed(1)}</b></span>
          </figcaption>
        </figure>
        <figure role="group" aria-label={label("True airspeed", `${Math.round(state.v * KNOTS_PER_MS)} knots`)}>
          <SpeedRing vMs={s.v} />
          <figcaption>
            <span>MACH <b>{mach}</b></span>
          </figcaption>
        </figure>
        <figure role="group" aria-label={label("Altitude", `${Math.round(state.pos.y * FEET_PER_M)} feet`)}>
          <AltRing altM={s.pos.y} />
          <figcaption>
            <span>VS <b>{vviLabel(s.v, s.gamma)}</b> fpm</span>
          </figcaption>
        </figure>
        <figure role="group" aria-label={label("Attitude", `pitch ${Math.round(pitch)} degrees, bank ${Math.round(Math.abs(bank))} degrees`)}>
          <AdiRing pitchDeg={pitch} bankDeg={bank} />
          <figcaption>
            <span>PIT <b>{signed(pitch)}&deg;</b></span>
            <span>BNK <b>{bankText}</b></span>
            <span>HDG <b>{pad3(headingDeg(s.psi))}&deg;</b></span>
          </figcaption>
        </figure>
      </div>
      <div className="ins-foot">
        <div className="ins-sat">{s.g > SATURATED_G && <SatTag />}</div>
        <p className="honest-note">Haptic cue = preload + G squeeze. Not a G-force simulator.</p>
      </div>
    </div>
  );
}
