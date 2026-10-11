/**
 * Procedural F-35A geometry, all dimensions in metres. Pure three.js, no React, so a test can build it.
 * Local axes match the flight model: nose -Z, up +Y, right wing +X. Centred on z = 0 lengthwise.
 */

import * as THREE from "three";

// Real F-35A figures.
export const F35_LENGTH = 15.67;
export const F35_SPAN = 10.7;
export const F35_HEIGHT = 4.38; // lowest point of the airframe to top of the tails

export const HULL = "#9aa3ad";
export const DARK = "#6d747d";
const NOZZLE_COLOR = "#3f444b";
const CANOPY_COLOR = "#3b4a5a";

const NOSE_Z = -F35_LENGTH / 2;
const TAIL_Z = F35_LENGTH / 2;
const HALF_SPAN = F35_SPAN / 2;

/** Fuselage loft stations: z, half-width, top and bottom y, superellipse exponent (higher = boxier/chined). */
interface Station {
  z: number;
  w: number;
  top: number;
  bot: number;
  n: number;
}
const FUSE_BOTTOM_Y = -0.85;
const FUSELAGE: Station[] = [
  { z: NOSE_Z, w: 0.03, top: 0.08, bot: -0.2, n: 2 },
  { z: -6.8, w: 0.35, top: 0.25, bot: -0.3, n: 2.4 },
  { z: -5.2, w: 0.65, top: 0.45, bot: -0.6, n: 2.8 },
  { z: -3.5, w: 0.95, top: 0.55, bot: -0.8, n: 3 },
  { z: -1.5, w: 1.25, top: 0.6, bot: FUSE_BOTTOM_Y, n: 3 },
  { z: 1.5, w: 1.35, top: 0.65, bot: -0.8, n: 3 },
  { z: 4.0, w: 1.15, top: 0.6, bot: -0.65, n: 2.8 },
  { z: 6.0, w: 0.85, top: 0.55, bot: -0.55, n: 2.4 },
  { z: 6.9, w: 0.62, top: 0.5, bot: -0.5, n: 2 },
];
const RING_SEGMENTS = 14;

// Wing: clipped delta, 34 degree leading-edge sweep, trailing edge forward-swept.
const WING_SWEEP = THREE.MathUtils.degToRad(34);
const WING_ROOT_X = 0.8;
const WING_Y = -0.25;
const WING_THICKNESS = 0.16;
const WING_LE_ROOT_Z = -1.6;
const WING_TIP_CHORD = 1.5;
const WING_TE_ROOT_Z = 4.4;
const WING_LE_TIP_Z = WING_LE_ROOT_Z + (HALF_SPAN - WING_ROOT_X) * Math.tan(WING_SWEEP);

// Stabilators (all-moving horizontal tails).
const STAB_ROOT_X = 1.0;
const STAB_TIP_X = 3.05;
const STAB_Y = -0.3;
const STAB_THICKNESS = 0.12;
const STAB_LE_ROOT_Z = 4.4;
const STAB_LE_TIP_Z = 5.5;
const STAB_TE_ROOT_Z = 7.0;
const STAB_TE_TIP_Z = 6.6;

// Twin vertical tails, canted outward from vertical.
const FIN_CANT = THREE.MathUtils.degToRad(27);
const FIN_ROOT_X = 0.7;
const FIN_ROOT_Y = 0.35;
const FIN_THICKNESS = 0.12;
const FIN_LE_ROOT_Z = 3.0;
const FIN_TE_ROOT_Z = 6.4;
const FIN_LE_TIP_Z = 5.3;
const FIN_TE_TIP_Z = 6.1;
/** Slant length so the tip tops out at F35_HEIGHT above the lowest point. */
const FIN_SLANT = (FUSE_BOTTOM_Y + F35_HEIGHT - FIN_ROOT_Y) / Math.cos(FIN_CANT);

// Canopy, intakes, nozzle.
const CANOPY_CENTER = new THREE.Vector3(0, 0.5, -4.2);
const CANOPY_RADII = new THREE.Vector3(0.5, 0.45, 1.55);
const INTAKE_X = 1.05;
const INTAKE_Y = -0.25;
const INTAKE_Z = -2.2;
const INTAKE_LENGTH = 2.2;
const INTAKE_RADIUS = 0.5;
const INTAKE_WIDTH_SCALE = 0.7;
const NOZZLE_FRONT_Z = 6.6;
const NOZZLE_R_FRONT = 0.58;
const NOZZLE_R_BACK = 0.5;

const signedPow = (v: number, p: number) => Math.sign(v) * Math.abs(v) ** p;

/** Loft rings of superellipse sections along z; closes the tail end with a cap. */
function loft(stations: Station[]): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const st of stations) {
    for (let j = 0; j < RING_SEGMENTS; j++) {
      const a = (j / RING_SEGMENTS) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      pos.push(st.w * signedPow(c, 2 / st.n), (s >= 0 ? st.top : st.bot) * Math.abs(s) ** (2 / st.n), st.z);
    }
  }
  const last = stations[stations.length - 1]!;
  const capIndex = stations.length * RING_SEGMENTS;
  pos.push(0, (last.top + last.bot) / 2, last.z);
  const idx: number[] = [];
  for (let i = 0; i < stations.length - 1; i++) {
    for (let j = 0; j < RING_SEGMENTS; j++) {
      const a = i * RING_SEGMENTS + j;
      const b = i * RING_SEGMENTS + ((j + 1) % RING_SEGMENTS);
      idx.push(a, b, a + RING_SEGMENTS, b, b + RING_SEGMENTS, a + RING_SEGMENTS);
    }
  }
  const lastRing = (stations.length - 1) * RING_SEGMENTS;
  for (let j = 0; j < RING_SEGMENTS; j++) idx.push(lastRing + j, lastRing + ((j + 1) % RING_SEGMENTS), capIndex);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A flat slab in the XZ plane from [x, z] outline points, centred on y = 0. */
function panel(points: [number, number][], thickness: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -thickness / 2, 0);
  return g;
}

const mat = (color: string, flat = false) =>
  new THREE.MeshStandardMaterial({ color, metalness: 0, roughness: 0.75, flatShading: flat, side: THREE.DoubleSide });

/** Add a mesh (and its x-mirror) to the group; the mirror is a negative-x-scaled copy. */
function addPair(group: THREE.Group, make: () => THREE.Object3D) {
  group.add(make());
  const mirror = new THREE.Group();
  mirror.scale.x = -1;
  mirror.add(make());
  group.add(mirror);
}

/** Build the whole airframe. Nose at -Z, about F35_LENGTH long. */
export function buildJet(): THREE.Group {
  const jet = new THREE.Group();
  const hull = mat(HULL);
  const dark = mat(DARK);

  const fuselage = new THREE.Mesh(loft(FUSELAGE), mat(HULL, true));
  fuselage.name = "fuselage";
  jet.add(fuselage);

  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), mat(CANOPY_COLOR));
  canopy.name = "canopy";
  canopy.position.copy(CANOPY_CENTER);
  canopy.scale.copy(CANOPY_RADII);
  jet.add(canopy);

  const nozzleLength = TAIL_Z - NOZZLE_FRONT_Z;
  const nozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(NOZZLE_R_BACK, NOZZLE_R_FRONT, nozzleLength, 16, 1, true),
    mat(NOZZLE_COLOR),
  );
  nozzle.name = "nozzle";
  nozzle.rotation.x = Math.PI / 2; // cylinder axis y -> z, wide end forward
  nozzle.position.set(0, 0, NOZZLE_FRONT_Z + nozzleLength / 2);
  jet.add(nozzle);

  const wing = panel(
    [
      [WING_ROOT_X, WING_LE_ROOT_Z],
      [HALF_SPAN, WING_LE_TIP_Z],
      [HALF_SPAN, WING_LE_TIP_Z + WING_TIP_CHORD],
      [WING_ROOT_X, WING_TE_ROOT_Z],
    ],
    WING_THICKNESS,
  );
  const stab = panel(
    [
      [STAB_ROOT_X, STAB_LE_ROOT_Z],
      [STAB_TIP_X, STAB_LE_TIP_Z],
      [STAB_TIP_X, STAB_TE_TIP_Z],
      [STAB_ROOT_X, STAB_TE_ROOT_Z],
    ],
    STAB_THICKNESS,
  );
  const fin = panel(
    [
      [0, FIN_LE_ROOT_Z],
      [FIN_SLANT, FIN_LE_TIP_Z],
      [FIN_SLANT, FIN_TE_TIP_Z],
      [0, FIN_TE_ROOT_Z],
    ],
    FIN_THICKNESS,
  );

  addPair(jet, () => {
    const m = new THREE.Mesh(wing, hull);
    m.name = "wing";
    m.position.y = WING_Y;
    return m;
  });
  addPair(jet, () => {
    const m = new THREE.Mesh(stab, hull);
    m.name = "stabilator";
    m.position.y = STAB_Y;
    return m;
  });
  addPair(jet, () => {
    const m = new THREE.Mesh(fin, dark);
    m.name = "fin";
    m.position.set(FIN_ROOT_X, FIN_ROOT_Y, 0);
    m.rotation.z = Math.PI / 2 - FIN_CANT; // span axis x -> up, leaning outward
    return m;
  });
  addPair(jet, () => {
    // DSI intake: a squat tube along z; the forward cap is the dark opening.
    const m = new THREE.Mesh(new THREE.CylinderGeometry(INTAKE_RADIUS, INTAKE_RADIUS, INTAKE_LENGTH, 14), [
      hull,
      dark,
      dark,
    ]);
    m.name = "intake";
    m.rotation.x = Math.PI / 2;
    m.scale.set(INTAKE_WIDTH_SCALE, 1, 1); // pre-rotation x stays x, y (axis) stays length
    m.position.set(INTAKE_X, INTAKE_Y, INTAKE_Z);
    return m;
  });

  return jet;
}

/** Bounding box of the built procedural jet, metres. */
export function jetBounds(): THREE.Box3 {
  const jet = buildJet();
  jet.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(jet);
}
