/**
 * The world the aeroplane flies over: a flat, matte, cartoon-grass plane.
 * No lines, no neon. Soft patches in a few greens give the eye something to
 * track past, and a very faint tile seam adds scale without looking like a grid.
 */

import * as THREE from "three";

export const GROUND_SIZE = 60_000; // metres across
/** One texture tile per this many metres. */
const TILE_METRES = 800;

/** Deterministic PRNG (mulberry32): the same ground every run. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GREENS = ["#86b85f", "#7db057", "#8fc066", "#76a850", "#82b55b"];

export function makeGroundTexture(): THREE.Texture {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d canvas context");
  const rand = rng(8675309);

  ctx.fillStyle = "#80b25a";
  ctx.fillRect(0, 0, size, size);

  // Draw each patch nine times so anything crossing a tile edge wraps cleanly.
  const wrapped = (draw: (ox: number, oy: number) => void) => {
    for (let gx = -1; gx <= 1; gx++) for (let gy = -1; gy <= 1; gy++) draw(gx * size, gy * size);
  };

  // Large soft-edged patches of slightly different green.
  for (let i = 0; i < 46; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const rx = 50 + rand() * 150;
    const ry = 50 + rand() * 150;
    const fill = GREENS[Math.floor(rand() * GREENS.length)] ?? "#80b25a";
    wrapped((ox, oy) => {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.ellipse(x + ox, y + oy, rx, ry, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.globalAlpha = 1;

  // Small darker tufts, for texture at close range.
  for (let i = 0; i < 900; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 2 + rand() * 5;
    ctx.fillStyle = `rgba(52,92,40,${0.07 + rand() * 0.1})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // A faint seam where tiles meet: scale cue, not a grid.
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const repeat = GROUND_SIZE / TILE_METRES;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 16;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
