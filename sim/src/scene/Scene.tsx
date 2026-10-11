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
import { chaseCamera } from "./chaseCam";
import { Jet } from "./Jet";
import {
  GROUND_SIZE,
  makeGroundTexture,
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
export type CameraView = "cockpit" | "chase";

/** How fast the chase camera catches up, 1/s. Higher is stiffer. */
const CHASE_FOLLOW = 7;

function PilotCamera({
  flight,
  view,
  jetRef,
}: {
  flight: FlightController;
  view: CameraView;
  jetRef: React.RefObject<THREE.Group | null>;
}) {
  const { camera } = useThree();
  const smoothed = useRef(new THREE.Vector3());
  const seeded = useRef(false);

  useFrame((_, delta) => {
    const s = flight.advance(delta);

    // The jet always follows the physics; it is only visible in chase view.
    const jet = jetRef.current;
    if (jet) {
      jet.visible = view === "chase";
      jet.position.set(s.pos.x, s.pos.y, s.pos.z);
      jet.rotation.order = "YXZ";
      jet.rotation.set(s.gamma + s.alpha, -s.psi, -s.phi);
    }

    if (view === "chase") {
      const c = chaseCamera(s);
      const target = new THREE.Vector3(c.position.x, c.position.y, c.position.z);
      // Smooth the follow so a 6 G snap does not whip the picture, but never lag
      // so far that the jet leaves the frame.
      if (!seeded.current) {
        smoothed.current.copy(target);
        seeded.current = true;
      } else {
        smoothed.current.lerp(target, 1 - Math.exp(-CHASE_FOLLOW * delta));
      }
      camera.position.copy(smoothed.current);
      camera.up.set(0, 1, 0);
      camera.lookAt(c.lookAt.x, c.lookAt.y, c.lookAt.z);
      return;
    }
    seeded.current = false;

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

export function Scene({ flight, view = "cockpit" }: { flight: FlightController; view?: CameraView }) {
  const jetRef = useRef<THREE.Group>(null);
  return (
    <Canvas
      className="viewport"
      camera={{ fov: 72, near: 1, far: 120_000 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      dpr={[1, 2]}
    >
      <PilotCamera flight={flight} view={view} jetRef={jetRef} />
      <group ref={jetRef} visible={false}>
        <Jet />
      </group>

      {/* Haze, so distant ground fades instead of ending in a hard edge. */}
      <fogExp2 attach="fog" args={["#b4c6d6", 0.00008]} />
      {/* `distance` must stay inside the camera's far plane or the sky dome is
          clipped away and you fly under a black void. */}
      <Sky distance={60_000} sunPosition={[120, 55, 80]} turbidity={4} rayleigh={1.1} />

      <hemisphereLight args={["#cfe3f2", "#3c4a35", 1.15]} />
      <directionalLight position={[1200, 900, 600]} intensity={1.5} />

      <Ground />
    </Canvas>
  );
}
