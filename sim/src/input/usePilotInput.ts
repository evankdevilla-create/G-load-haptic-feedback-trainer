/**
 * Keyboard -> PilotInput. Held keys live in a Set, the current input in a ref
 * (no React state at 100 Hz). Anything that could leave a key "stuck" - focus
 * loss, tab hidden, unmount - clears the set so the stick snaps to neutral.
 */

import { useCallback, useEffect, useRef } from "react";
import { NEUTRAL_INPUT } from "../flight/types";
import type { PilotInput } from "../flight/types";
import { PREVENT_DEFAULT_CODES, stepPilotInput } from "./pilotInput";

export interface PilotInputController {
  inputRef: React.RefObject<PilotInput>;
  /** Advance the ramps by this many real seconds. Call once per frame. */
  update: (dtReal: number) => PilotInput;
  /** Drop every held key and centre the stick. */
  release: () => void;
}

export function usePilotInput(): PilotInputController {
  const inputRef = useRef<PilotInput>(NEUTRAL_INPUT);
  const heldRef = useRef<Set<string>>(new Set());

  const release = useCallback(() => {
    heldRef.current.clear();
    inputRef.current = NEUTRAL_INPUT;
  }, []);

  useEffect(() => {
    const held = heldRef.current;
    const down = (e: KeyboardEvent) => {
      // Cmd+key swallows the keyup on macOS, which would leave the key stuck.
      if (e.metaKey) {
        release();
        return;
      }
      // A focused HUD button would also fire its click on Space (stick centre).
      if (e.code === "Space") (document.activeElement as HTMLElement | null)?.blur?.();
      if (PREVENT_DEFAULT_CODES.has(e.code)) e.preventDefault();
      held.add(e.code);
    };
    const up = (e: KeyboardEvent) => {
      held.delete(e.code);
    };
    const onVisibility = () => {
      if (document.hidden) release();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", onVisibility);
      release();
    };
  }, [release]);

  const update = useCallback((dtReal: number): PilotInput => {
    inputRef.current = stepPilotInput(inputRef.current, heldRef.current, dtReal);
    return inputRef.current;
  }, []);

  return { inputRef, update, release };
}
