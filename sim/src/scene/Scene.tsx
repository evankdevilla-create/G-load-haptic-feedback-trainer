/**
 * The 3D view, from the pilot's eyes.
 *
 * The camera *is* the pilot's head: it sits at the aircraft's position and takes
 * the aircraft's attitude, so there is no external model to draw. The cockpit
 * you see is an overlay on top (see `CockpitFrame`), which is also physically
 * right - a canopy rail is bolted to your airframe, so it never moves relative
 * to your eyes.
 */

import { Sky } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { FlightController } from "../flight/useFlight";
import {
  GROUND_SIZE,
  makeCloudTexture,
  makeClouds,
  makeGroundTexture,
  makeHills,
} from "./world";

/** Where the pilot's eyes sit relative to the aircraft reference point, metres. */
const EYE_HEIGHT = 1.1;

/**
 * Steps the flight model and points the camera.
 *
 * This lives inside the Canvas because it needs `useFrame`. It is also the only
 * place the physics is advanced, which keeps the simulation and the picture on
 * the same clock.
 */
function PilotCamera({ flight }: { flight: FlightController }) {
  const { camera } = useThree();

  useFrame((_, delta) => {
    const s = flight.advance(delta);

    camera.position.set(s.pos.x, s.pos.y + EYE_HEIGHT, s.pos.z);

    // Heading is measured from north, and north is -Z, so the yaw that turns the
    // camera's default -Z view towards our heading is -psi.
    // The nose sits at the flight path angle plus the angle of attack, which is
    // why the horizon drops during a hard pull before any height is gained.
    camera.rotation.order = "YXZ";
    camera.rotation.set(s.gamma + s.alpha, -s.psi, -s.phi);
  });

  return null;
}

function Ground() {
  const texture = useMemo(() => makeGroundTexture(), []);
  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow={false}>
      <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
      <meshLambertMaterial map={texture} />
    </mesh>
  );
}

/** All the hills in one instanced mesh, so 500 of them cost one draw call. */
function Hills() {
  const hills = useMemo(() => makeHills(), []);
  const ref = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const colour = new THREE.Color();
    hills.forEach((h, i) => {
      m.makeScale(h.radius, h.height, h.radius);
      m.setPosition(h.x, h.height / 2, h.z);
      mesh.setMatrixAt(i, m);
      // Taller ground is barer and greyer, like real high ground; low hills stay
      // green so they sit against the fields rather than glowing out of them.
      const bare = Math.min(1, Math.max(0, (h.height - 400) / 1600));
      colour.setRGB(0.13 + bare * 0.33, 0.2 + bare * 0.26, 0.12 + bare * 0.3);
      mesh.setColorAt(i, colour);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [hills]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, hills.length]} frustumCulled={false}>
      <coneGeometry args={[1, 1, 7]} />
      <meshLambertMaterial />
    </instancedMesh>
  );
}

function CloudLayer() {
  const clouds = useMemo(() => makeClouds(), []);
  const texture = useMemo(() => makeCloudTexture(), []);
  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <group>
      {clouds.map((c, i) => (
        <sprite key={i} position={[c.x, c.y, c.z]} scale={[c.scale, c.scale * 0.55, 1]}>
          <spriteMaterial
            map={texture}
            transparent
            opacity={0.55}
            depthWrite={false}
            fog={false}
          />
        </sprite>
      ))}
    </group>
  );
}

/** A runway, so there is one unmistakable landmark on the ground. */
function Runway() {
  return (
    <group position={[0, 1, -1200]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[60, 2800]} />
        <meshLambertMaterial color="#2b2b2e" />
      </mesh>
      {/* Centreline dashes. */}
      {Array.from({ length: 18 }, (_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.5, -1300 + i * 150]}>
          <planeGeometry args={[3, 70]} />
          <meshBasicMaterial color="#d8d8d0" />
        </mesh>
      ))}
    </group>
  );
}

export function Scene({ flight }: { flight: FlightController }) {
  return (
    <Canvas
      className="viewport"
      camera={{ fov: 72, near: 1, far: 120_000 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      dpr={[1, 2]}
    >
      <PilotCamera flight={flight} />

      {/* Haze, so distant ground fades instead of ending in a hard edge. */}
      <fogExp2 attach="fog" args={["#9fb6c9", 0.000019]} />
      {/* `distance` must stay inside the camera's far plane or the sky dome is
          clipped away and you fly under a black void. */}
      <Sky distance={60_000} sunPosition={[120, 55, 80]} turbidity={4} rayleigh={1.1} />

      <hemisphereLight args={["#cfe3f2", "#3c4a35", 1.15]} />
      <directionalLight position={[1200, 900, 600]} intensity={1.5} />

      <Ground />
      <Hills />
      <Runway />
      <CloudLayer />
    </Canvas>
  );
}
