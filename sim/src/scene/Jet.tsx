/**
 * The aircraft, seen in chase view.
 *
 * Uses /models/f35.glb when it exists (see public/models/README.txt for the
 * source and licence), and otherwise a plain F-35-style jet built from three.js
 * shapes, so the sim never depends on a downloaded file to run.
 *
 * Local axes match the flight model: the nose points -Z, up is +Y, right wing +X.
 */

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Component, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import * as THREE from "three";
import { flameLength } from "./flame";
import { buildJet } from "./jetSpec";

export const MODEL_URL = "/models/f35.glb";
/** Real F-35 length, metres. The loaded model is scaled to this. */
const JET_LENGTH = 15.7;
/**
 * Yaw to apply to a loaded model so its nose points -Z. Models differ in which
 * way they face; if the jet flies backwards, change this to 0 or Math.PI.
 */
const MODEL_YAW = Math.PI / 2;

/** Procedural F-35A; the geometry lives in jetSpec.ts so tests can measure it. */
function ProceduralJet() {
  const jet = useMemo(() => buildJet(), []);
  return <primitive object={jet} />;
}

/** The downloaded model, centred and scaled to JET_LENGTH. */
function LoadedJet() {
  const { scene } = useGLTF(MODEL_URL);
  const model = useMemo(() => {
    const clone = scene.clone(true);
    // Some models ship gear-up and gear-down meshes together; show gear up only.
    clone.traverse((o) => {
      if (/landing[_-]?on/i.test(o.name)) o.visible = false;
    });
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const longest = Math.max(size.x, size.y, size.z) || 1;
    const k = JET_LENGTH / longest;
    clone.position.sub(centre.multiplyScalar(k));
    clone.scale.setScalar(k);
    return clone;
  }, [scene]);
  return (
    <group rotation={[0, MODEL_YAW, 0]}>
      <primitive object={model} />
    </group>
  );
}

/** Fall back to the procedural jet if the model fails to load or parse. */
class ModelBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** True only if the file is really there: the dev server answers unknown paths with index.html. */
export function useModelAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch(MODEL_URL, { method: "HEAD" })
      .then((r) => {
        const type = r.headers.get("content-type") ?? "";
        if (!cancelled) setAvailable(r.ok && !type.includes("text/html"));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return available;
}

export function Jet() {
  const available = useModelAvailable();
  return available ? (
    <ModelBoundary fallback={<ProceduralJet />}>
      <Suspense fallback={<ProceduralJet />}>
        <LoadedJet />
      </Suspense>
    </ModelBoundary>
  ) : (
    <ProceduralJet />
  );
}

/** Where the exhaust leaves the airframe, in jet-local metres (nose is -Z). */
const NOZZLE_Z = JET_LENGTH / 2 - 0.2;
const NOZZLE_Y = 0.15;

/**
 * The exhaust flame: one solid, flat-shaded cone whose colour runs from pale
 * yellow at the nozzle to deep orange at the tip (vertex colours, unlit). No
 * transparency, additive blending or halo, so it reads as fire without becoming a
 * glow effect. It lengthens with throttle and is hidden after a crash.
 */
const FLAME_BASE = new THREE.Color("#fff0c8");
const FLAME_MID = new THREE.Color("#ffb347");
const FLAME_TIP = new THREE.Color("#ff5a10");

export function Afterburner({
  getThrottle,
  isCrashed,
}: {
  getThrottle: () => number;
  isCrashed: () => boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const flame = useRef<THREE.Mesh>(null);

  // Cone tips point +Y by default: lay it along +Z with the base at the nozzle.
  const geo = useMemo(() => {
    const g = new THREE.ConeGeometry(1, 1, 16, 4, true);
    g.rotateX(Math.PI / 2); // tip now +Z
    g.translate(0, 0, 0.5); // z in 0..1: base at the nozzle, tip trailing behind
    const pos = g.getAttribute("position");
    const colours = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const t = Math.min(1, Math.max(0, pos.getZ(i)));
      if (t < 0.4) c.copy(FLAME_BASE).lerp(FLAME_MID, t / 0.4);
      else c.copy(FLAME_MID).lerp(FLAME_TIP, (t - 0.4) / 0.6);
      colours.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(colours, 3));
    return g;
  }, []);

  useFrame(({ clock }) => {
    if (!group.current || !flame.current) return;
    const crashed = isCrashed();
    group.current.visible = !crashed;
    if (crashed) return;
    // A small, fast flicker in length so it is not a rigid cone.
    const flick = 1 + 0.06 * Math.sin(clock.elapsedTime * 47) + 0.04 * Math.sin(clock.elapsedTime * 83);
    flame.current.scale.set(0.5, 0.5, flameLength(getThrottle()) * flick);
  });

  return (
    <group ref={group} position={[0, NOZZLE_Y, NOZZLE_Z]}>
      <mesh ref={flame} geometry={geo}>
        <meshBasicMaterial vertexColors side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
