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
import type { PilotInputController } from "../input/usePilotInput";
import { PHYSICS_DT, calmed, initialManualState, initialState, step, stepManual } from "./dynamics";
import { lerpState } from "./interp";
import type { FlightMode, FlightState, Route } from "./types";

/**
 * Never let a stall turn into a burst of catch-up physics. If the tab was in the
 * background or the GC paused us, we drop the missing time rather than fast
 * forwarding through a 6 G pull in one frame.
 */
const MAX_CATCHUP_S = 0.25;
/** No physics step for this long = paused, hidden or stalled. */
const STALL_MS = MAX_CATCHUP_S * 1000;

/**
 * Sim seconds per real second. Below 1 slows the whole flight (scenery, G onset,
 * everything) without touching the physics, so a route still flies identically.
 */
export const TIME_SCALE = 0.6;

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
  /** manual = player flies (never finishes); auto = scripted route. */
  mode: FlightMode;
  setMode: (m: FlightMode) => void;
  toggleMode: () => void;
  start: () => void;
  pause: () => void;
  toggleRunning: () => void;
  /** Drop G to 1 and centre the stick, so the sim's G matches the 1 G being posted (the cuff sits at its preload). */
  calm: () => void;
  restart: () => void;
  toggleLooping: () => void;
  /** Advance by this many real seconds. Call once per rendered frame. */
  advance: (dtReal: number) => FlightState;
  /**
   * The state to DRAW: interpolated between the last two physics steps by how far
   * into the next step the frame is. Smooth at any frame rate; the cuff and HUD
   * numbers keep reading the real `stateRef`.
   */
  renderState: () => FlightState;
}

const freshState = (mode: FlightMode, route: Route): FlightState =>
  mode === "manual" ? initialManualState(route) : initialState(route);

/** `pilot` is advanced once per frame inside `advance`; manual mode reads it. */
export function useFlight(route: Route, pilot?: PilotInputController): FlightController {
  const [mode, setModeState] = useState<FlightMode>("manual");
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const stateRef = useRef<FlightState>(freshState("manual", route));
  const lastStepAtRef = useRef<number>(performance.now());
  const [running, setRunning] = useState(true);
  const [looping, setLooping] = useState(true);

  // Mirrors, so the frame loop can read them without re-subscribing.
  const runningRef = useRef(running);
  const loopingRef = useRef(looping);
  const accRef = useRef(0);
  const prevRef = useRef<FlightState>(stateRef.current);
  runningRef.current = running;
  loopingRef.current = looping;

  // Starting a different route starts a different flight.
  useEffect(() => {
    stateRef.current = freshState(modeRef.current, route);
    prevRef.current = stateRef.current;
    accRef.current = 0;
  }, [route]);

  const advance = useCallback(
    (dtReal: number): FlightState => {
      if (!runningRef.current) return stateRef.current;
      if (modeRef.current === "manual" && !pilot) return stateRef.current;

      accRef.current = Math.min(accRef.current + dtReal * TIME_SCALE, MAX_CATCHUP_S);
      let s = stateRef.current;
      let prev = prevRef.current;
      let reachedEnd = false;
      // The cuff was told 1 G while we were paused, hidden or stalled (no physics
      // steps), so the state's old G must not come back: a pause at 6 G would
      // otherwise jump the cuff 1 -> 6 on resume. Come back at 1 G with a
      // centred stick and let the normal onset rate ramp up.
      if (performance.now() - lastStepAtRef.current > STALL_MS) {
        s = calmed(s);
        prev = s;
        pilot?.release();
      }
      const manual = modeRef.current === "manual";
      // Keys ramp in real time (one update per frame); physics reads the result.
      const input = manual ? pilot?.update(Math.min(dtReal, MAX_CATCHUP_S)) : undefined;

      while (accRef.current >= PHYSICS_DT) {
        accRef.current -= PHYSICS_DT;
        prev = s;
        if (manual) {
          if (input) s = stepManual(s, input);
          continue;
        }
        s = step(s, route);
        if (s.finished) {
          if (loopingRef.current) {
            s = initialState(route);
            prev = s;
          } else {
            reachedEnd = true;
            break;
          }
        }
      }

      stateRef.current = s;
      prevRef.current = prev;
      lastStepAtRef.current = performance.now();
      if (reachedEnd) setRunning(false);
      return s;
    },
    [route, pilot],
  );

  const renderState = useCallback(
    (): FlightState => lerpState(prevRef.current, stateRef.current, accRef.current / PHYSICS_DT),
    [],
  );

  const restart = useCallback(() => {
    stateRef.current = freshState(modeRef.current, route);
    prevRef.current = stateRef.current;
    accRef.current = 0;
    setRunning(true);
  }, [route]);

  const setMode = useCallback(
    (m: FlightMode) => {
      if (m === modeRef.current) return;
      modeRef.current = m;
      // To manual: carry on from where we are. To auto: the script starts over.
      if (m === "auto") stateRef.current = initialState(route);
      prevRef.current = stateRef.current;
      pilot?.release();
      accRef.current = 0;
      setModeState(m);
    },
    [route, pilot],
  );
  const toggleMode = useCallback(
    () => setMode(modeRef.current === "manual" ? "auto" : "manual"),
    [setMode],
  );

  const start = useCallback(() => setRunning(true), []);
  // The cuff is told 1 G whenever we are paused, killed or panicking, so the sim's
  // own G has to come down with it. Otherwise whatever resumes the live value
  // (resume, restore, end of a panic) jumps the cuff from empty to the old G.
  const calm = useCallback(() => {
    stateRef.current = calmed(stateRef.current);
    prevRef.current = stateRef.current;
    pilot?.release();
  }, [pilot]);
  const pause = useCallback(() => {
    calm();
    setRunning(false);
  }, [calm]);
  const toggleRunning = useCallback(() => {
    if (runningRef.current) calm();
    setRunning((r) => !r);
  }, [calm]);
  const toggleLooping = useCallback(() => setLooping((l) => !l), []);

  return {
    stateRef,
    lastStepAtRef,
    route,
    running,
    looping,
    mode,
    setMode,
    toggleMode,
    start,
    pause,
    toggleRunning,
    calm,
    restart,
    toggleLooping,
    advance,
    renderState,
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
