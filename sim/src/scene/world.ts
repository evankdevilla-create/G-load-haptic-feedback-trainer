/**
 * The ground: modelled on the "Simulation" maps of Totally Accurate Battle
 * Simulator, which the TABS wiki (tabs.wiki.gg/wiki/Simulation) describes as
 * "a white plane with a light-gray grid on top of it". Flat, matte, nothing else.
 * Cell size and line weight are our choice: the wiki gives neither.
 */

import * as THREE from "three";

export const GROUND_SIZE = 60_000; // metres across
/** One texture tile per kilometre, ten grid cells (100 m) across. */
const TILE_METRES = 1000;
const CELLS_PER_TILE = 10;

const PLANE = "#e4e6e8"; // white, a touch grey so the lit plane does not clip to pure white
const GRID = "#a9adb2"; // light grey

export function makeGroundTexture(): THREE.Texture {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d canvas context");

  ctx.fillStyle = PLANE;
  ctx.fillRect(0, 0, size, size);

  const cell = size / CELLS_PER_TILE;
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 7;
  ctx.beginPath();
  for (let i = 0; i <= CELLS_PER_TILE; i++) {
    const p = i * cell;
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
  }
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const repeat = GROUND_SIZE / TILE_METRES;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 16;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
