import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Float, useGLTF } from "@react-three/drei";
import * as THREE from "three";

const MODEL_URL = "/drone.glb";
const TARGET_SIZE = 8.5;
const DISPLAY_SCALE = 1.35;

useGLTF.preload(MODEL_URL);

/**
 * Hero drone loaded from drone.glb (user-provided asset).
 * Auto-scales to fit the scene and slowly rotates like a product turntable.
 */
export default function Drone() {
  const { scene } = useGLTF(MODEL_URL);
  const rig = useRef();

  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = TARGET_SIZE / maxDim;

    clone.scale.setScalar(scale);
    clone.position.set(-center.x * scale, -center.y * scale, -center.z * scale);

    return clone;
  }, [scene]);

  useFrame((state) => {
    if (!rig.current) return;
    const t = state.clock.elapsedTime;
    rig.current.rotation.y = t * 0.35 + state.pointer.x * 0.4;
    rig.current.rotation.x = 0.1 + state.pointer.y * 0.14;
  });

  return (
    <Float speed={2} rotationIntensity={0.18} floatIntensity={0.75} floatingRange={[-0.08, 0.08]}>
      <group ref={rig} scale={DISPLAY_SCALE} position={[0, -0.08, 0]} rotation={[0.08, 0.5, 0]}>
        <primitive object={model} />
      </group>
    </Float>
  );
}
