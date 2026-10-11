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
import { Component, Suspense, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import * as THREE from "three";
import { buildJet } from "./jetSpec";

export const MODEL_URL = "/models/f35.glb";
/** Real F-35 length, metres. The loaded model is scaled to this. */
const JET_LENGTH = 15.7;
/**
 * Yaw to apply to a loaded model so its nose points -Z. Models differ in which
 * way they face; if the jet flies backwards, change this to 0 or Math.PI.
 */
const MODEL_YAW = Math.PI;

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
function useModelAvailable(): boolean {
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
