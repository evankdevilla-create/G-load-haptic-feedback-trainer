/**
 * The world the aeroplane flies over: a flat plate with a grid, and nothing else.
 * The grid is the only motion cue, so it has fine lines for near-field speed and
 * heavier lines every kilometre for scale.
 */

import * as THREE from "three";

export const GROUND_SIZE = 60_000; // metres across
/** One texture tile per kilometre; ten minor cells (100 m) per tile. */
const TILE_METRES = 1000;
const CELLS_PER_TILE = 10;

/** Procedural grid texture: flat plate, thin minor lines, heavier tile lines. */
export function makeGroundTexture(): THREE.Texture {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d canvas context");

  ctx.fillStyle = "#26302b";
  ctx.fillRect(0, 0, size, size);

  const cell = size / CELLS_PER_TILE;
  ctx.strokeStyle = "#3c4a42";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 1; i < CELLS_PER_TILE; i++) {
    const p = i * cell;
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
  }
  ctx.stroke();

  // The tile edge doubles as the kilometre line when the texture repeats.
  ctx.strokeStyle = "#6b8274";
  ctx.lineWidth = 5;
  ctx.strokeRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const repeat = GROUND_SIZE / TILE_METRES;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 16;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
