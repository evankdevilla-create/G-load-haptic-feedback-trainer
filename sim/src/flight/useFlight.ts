/**
 * Drives the flight model from the render loop.
 *
 * Two things matter here:
 *
 *  - **Fixed timestep.** The physics always advances in PHYSICS_DT slices no
 *    matter what the frame rate is doing, so the route flies identically on a
 *    fast laptop and a struggling one. A demo you cannot reproduce is not a demo.
 *  - **The live state lives in a ref, not in React state.** At 100 Hz, putting
 *    it in state would re-render the tree a hundred times a second. The 3D view
 *    reads the ref inside its own frame loop; the HUD samples it at a readable
 *    rate (see `useSampled`).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { PHYSICS_DT, initialState, step } from "./dynamics";
import type { FlightState, Route } from "./types";

/**
 * Never let a stall turn into a burst of catch-up physics. If the tab was in the
 * background or the GC paused us, we drop the missing time rather than fast
 * forwarding through a 6 G pull in one frame.
 */
const MAX_CATCHUP_S = 0.25;

export interface FlightController {
  /** The live state. Mutated in place every tick - read it, do not store it. */
  stateRef: React.RefObject<FlightState>;
  /**
   * `performance.now()` when the physics last actually advanced.
   *
   * This matters for safety rather than for display. The physics is driven by
   * requestAnimationFrame, which the browser SUSPENDS when the tab is in the
   * background - but timers keep running, so telemetry would happily carry on
   * posting the last G it saw. If that G was 6, the cuff would hold a full
   * squeeze on someone's leg while the sortie looked like it was still flying.
   * Anything sending G must check this and refuse to send stale values.
   */
  lastStepAtRef: React.RefObject<number>;
  route: Route;
  running: boolean;
  looping: boolean;
  start: () => void;
  pause: () => void;
  toggleRunning: () => void;
  restart: () => void;
  toggleLooping: () => void;
  /** Advance by this many real seconds. Call once per rendered frame. */
  advance: (dtReal: number) => FlightState;
}

export function useFlight(route: Route): FlightController {
  const stateRef = useRef<FlightState>(initialState(route));
  const lastStepAtRef = useRef<number>(performance.now());
  const [running, setRunning] = useState(true);
  const [looping, setLooping] = useState(true);

  // Mirrors, so the frame loop can read them without re-subscribing.
  const runningRef = useRef(running);
  const loopingRef = useRef(looping);
  const accRef = useRef(0);
  runningRef.current = running;
  loopingRef.current = looping;

  // Starting a different route starts a different flight.
  useEffect(() => {
    stateRef.current = initialState(route);
    accRef.current = 0;
  }, [route]);

  const advance = useCallback(
    (dtReal: number): FlightState => {
      if (!runningRef.current) return stateRef.current;

      accRef.current = Math.min(accRef.current + dtReal, MAX_CATCHUP_S);
      let s = stateRef.current;
      let reachedEnd = false;

      while (accRef.current >= PHYSICS_DT) {
        accRef.current -= PHYSICS_DT;
        s = step(s, route);
        if (s.finished) {
          if (loopingRef.current) {
            s = initialState(route);
          } else {
            reachedEnd = true;
            break;
          }
        }
      }

      stateRef.current = s;
      lastStepAtRef.current = performance.now();
      if (reachedEnd) setRunning(false);
      return s;
    },
    [route],
  );

  const restart = useCallback(() => {
    stateRef.current = initialState(route);
    accRef.current = 0;
    setRunning(true);
  }, [route]);

  const start = useCallback(() => setRunning(true), []);
  const pause = useCallback(() => setRunning(false), []);
  const toggleRunning = useCallback(() => setRunning((r) => !r), []);
  const toggleLooping = useCallback(() => setLooping((l) => !l), []);

  return {
    stateRef,
    lastStepAtRef,
    route,
    running,
    looping,
    start,
    pause,
    toggleRunning,
    restart,
    toggleLooping,
    advance,
  };
}

/**
 * Read a fast-changing value at a sane rate for display.
 *
 * The HUD does not need 100 updates a second and React should not be asked to
 * do that much work; 20 Hz already looks continuous.
 */
export function useSampled<T>(read: () => T, hz = 20): T {
  const readRef = useRef(read);
  readRef.current = read;
  const [value, setValue] = useState<T>(() => read());

  useEffect(() => {
    const id = setInterval(() => setValue(readRef.current()), 1000 / hz);
    return () => clearInterval(id);
  }, [hz]);

  return value;
}
