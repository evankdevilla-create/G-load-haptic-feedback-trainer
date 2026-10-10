/**
 * The world the aeroplane flies over.
 *
 * At 1500 m a bare plane looks completely static, so the ground needs features
 * at a scale you can actually see going past: field-sized texture detail, hills
 * for parallax, and clouds, which are by far the strongest speed cue.
 *
 * Everything is generated from a fixed seed, so the scenery is the same every
 * run - the same reason the physics uses a fixed timestep.
 */

import * as THREE from "three";

/** Deterministic PRNG (mulberry32). Same seed, same world, every time. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const GROUND_SIZE = 60_000; // metres across
/** One texture tile per this many metres. Field-sized, so motion reads. */
const TILE_METRES = 420;

/** Procedural ground texture: patchwork fields with tracks between them. */
export function makeGroundTexture(): THREE.Texture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d canvas context");
  const rand = rng(20261010);

  ctx.fillStyle = "#4a5c3f";
  ctx.fillRect(0, 0, size, size);

  /**
   * Draw something nine times, once per neighbouring tile, so anything crossing
   * an edge reappears on the far side. Without this the tile edges line up into
   * an obvious lattice once the texture repeats a hundred times across.
   */
  const wrapped = (draw: (ox: number, oy: number) => void) => {
    for (let gx = -1; gx <= 1; gx++) {
      for (let gy = -1; gy <= 1; gy++) draw(gx * size, gy * size);
    }
  };

  // Irregular fields, so there is something to watch slide past.
  const palette = ["#55663f", "#4e6140", "#5d6b43", "#41543a", "#667049", "#48593c"];
  for (let i = 0; i < 110; i++) {
    const w = 30 + rand() * 120;
    const h = 30 + rand() * 120;
    const x = rand() * size;
    const y = rand() * size;
    const fill = palette[Math.floor(rand() * palette.length)] ?? "#4e6140";
    wrapped((ox, oy) => {
      ctx.fillStyle = fill;
      ctx.fillRect(x + ox, y + oy, w, h);
    });
  }

  // Soft blotches to break up the straight field edges.
  for (let i = 0; i < 70; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 12 + rand() * 46;
    const alpha = 0.05 + rand() * 0.1;
    const dark = rand() > 0.5;
    wrapped((ox, oy) => {
      ctx.beginPath();
      ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
      ctx.fillStyle = dark ? `rgba(30,40,26,${alpha})` : `rgba(140,150,110,${alpha})`;
      ctx.fill();
    });
  }

  // Fine speckle to break up the flat colour at close range.
  for (let i = 0; i < 4200; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.02 + rand() * 0.05})`;
    ctx.fillRect(rand() * size, rand() * size, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const repeat = GROUND_SIZE / TILE_METRES;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 16;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface Hill {
  x: number;
  z: number;
  radius: number;
  height: number;
}

/**
 * Hills and mountains, clustered into ridges rather than sprinkled evenly, so
 * the horizon has some shape to it.
 */
export function makeHills(count = 520): Hill[] {
  const rand = rng(777);
  const hills: Hill[] = [];
  const ridges = 14;

  for (let r = 0; r < ridges; r++) {
    const cx = (rand() - 0.5) * GROUND_SIZE * 0.8;
    const cz = (rand() - 0.5) * GROUND_SIZE * 0.8;
    const dir = rand() * Math.PI * 2;
    const bigRidge = rand() > 0.6;
    const per = Math.floor(count / ridges);

    for (let i = 0; i < per; i++) {
      const along = (rand() - 0.5) * 16_000;
      const across = (rand() - 0.5) * 3_500;
      const scale = 0.45 + rand() * 0.9;
      hills.push({
        x: cx + Math.cos(dir) * along - Math.sin(dir) * across,
        z: cz + Math.sin(dir) * along + Math.cos(dir) * across,
        radius: (bigRidge ? 900 : 480) * scale,
        height: (bigRidge ? 1500 : 480) * scale,
      });
    }
  }
  return hills;
}

export interface Cloud {
  x: number;
  y: number;
  z: number;
  scale: number;
}

/** Scattered cloud puffs. The best speed cue in the whole scene. */
export function makeClouds(count = 190): Cloud[] {
  const rand = rng(31337);
  const clouds: Cloud[] = [];
  for (let i = 0; i < count; i++) {
    // The route flies at roughly 1400-1800 m, so spread the deck across that
    // band: clouds level with you and below you are the strongest speed cue in
    // the scene, and clouds entirely overhead give you nothing.
    clouds.push({
      x: (rand() - 0.5) * 40_000,
      y: 350 + rand() * 3100,
      z: (rand() - 0.5) * 40_000,
      scale: 600 + rand() * 1300,
    });
  }
  return clouds;
}

/** A soft round puff, drawn once and reused by every cloud sprite. */
export function makeCloudTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d canvas context");

  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,0.95)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
