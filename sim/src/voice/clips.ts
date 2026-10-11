import type { CalloutId } from "./callouts";

/**
 * Pre-rendered clips, empty by default (falls back to browser speech).
 * To use one: put the mp3 in public/voice/ and register it, e.g.
 *   g6: "/voice/g6.mp3"
 */
export const CLIP_URLS: Partial<Record<CalloutId, string>> = {};
