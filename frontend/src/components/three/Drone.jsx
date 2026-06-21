import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Float, RoundedBox } from "@react-three/drei";

const CARBON = "#121826";
const CARBON_LIGHT = "#1f2a3d";
const SILVER = "#c9d4e2";
const AERO = "#0E90F1";
const AERO_LIGHT = "#7fc8ff";

const ARM_ANGLES = [45, 135, 225, 315].map((d) => (d * Math.PI) / 180);

function Propeller({ spin = 1 }) {
  const ref = useRef();
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 26 * spin;
  });
  return (
    <group ref={ref}>
      {/* hub */}
      <mesh castShadow>
        <cylinderGeometry args={[0.07, 0.07, 0.08, 16]} />
        <meshStandardMaterial color={CARBON_LIGHT} metalness={0.7} roughness={0.3} />
      </mesh>
      {/* two blades, slightly pitched */}
      {[0, Math.PI / 2].map((rot, i) => (
        <mesh key={i} rotation={[0, rot, 0.12]} castShadow>
          <boxGeometry args={[1.15, 0.02, 0.14]} />
          <meshStandardMaterial
            color={AERO_LIGHT}
            transparent
            opacity={0.55}
            metalness={0.2}
            roughness={0.4}
            emissive={AERO}
            emissiveIntensity={0.12}
          />
        </mesh>
      ))}
    </group>
  );
}

function Arm({ angle }) {
  const ARM_LEN = 1.28;
  return (
    <group rotation={[0, angle, 0]}>
      {/* arm spar */}
      <mesh position={[ARM_LEN / 2, 0, 0]} castShadow>
        <boxGeometry args={[ARM_LEN, 0.1, 0.16]} />
        <meshStandardMaterial color={CARBON} metalness={0.55} roughness={0.35} />
      </mesh>
      {/* motor bell */}
      <mesh position={[ARM_LEN, 0.12, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.18, 0.26, 24]} />
        <meshStandardMaterial color={SILVER} metalness={0.9} roughness={0.25} />
      </mesh>
      {/* motor cap */}
      <mesh position={[ARM_LEN, 0.27, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.12, 0.06, 24]} />
        <meshStandardMaterial color={AERO} metalness={0.6} roughness={0.3} />
      </mesh>
      {/* propeller */}
      <group position={[ARM_LEN, 0.33, 0]}>
        <Propeller spin={angle > Math.PI ? -1 : 1} />
      </group>
    </group>
  );
}

/**
 * A quadcopter assembled entirely from primitive geometry (no model files).
 * Gently turns like a product turntable and reacts subtly to the pointer.
 */
export default function Drone() {
  const rig = useRef();

  useFrame((state) => {
    if (!rig.current) return;
    const t = state.clock.elapsedTime;
    // slow turntable rotation + subtle pointer parallax
    rig.current.rotation.y = t * 0.35 + state.pointer.x * 0.4;
    rig.current.rotation.x = -0.12 + state.pointer.y * 0.18;
  });

  return (
    <Float speed={2} rotationIntensity={0.25} floatIntensity={0.9} floatingRange={[-0.12, 0.12]}>
      <group ref={rig} scale={1.15} position={[0, -0.1, 0]} rotation={[-0.12, 0.4, 0]}>
        {/* main body */}
        <RoundedBox args={[1.5, 0.34, 1.0]} radius={0.14} smoothness={5} castShadow receiveShadow>
          <meshStandardMaterial color={CARBON} metalness={0.6} roughness={0.32} />
        </RoundedBox>

        {/* aero-blue canopy */}
        <RoundedBox
          args={[0.92, 0.26, 0.62]}
          radius={0.12}
          smoothness={5}
          position={[0.12, 0.2, 0]}
          castShadow
        >
          <meshStandardMaterial color={AERO} metalness={0.45} roughness={0.22} />
        </RoundedBox>

        {/* glossy top stripe */}
        <RoundedBox args={[0.5, 0.06, 0.3]} radius={0.03} smoothness={4} position={[0.2, 0.34, 0]}>
          <meshStandardMaterial color={AERO_LIGHT} metalness={0.3} roughness={0.15} />
        </RoundedBox>

        {/* front camera gimbal */}
        <mesh position={[0.72, -0.06, 0]} castShadow>
          <sphereGeometry args={[0.17, 24, 24]} />
          <meshStandardMaterial color={CARBON_LIGHT} metalness={0.7} roughness={0.25} />
        </mesh>
        <mesh position={[0.84, -0.06, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 0.08, 20]} />
          <meshStandardMaterial color="#05070b" metalness={0.4} roughness={0.1} />
        </mesh>

        {/* arms + motors + props */}
        {ARM_ANGLES.map((a, i) => (
          <Arm key={i} angle={a} />
        ))}

        {/* landing skids */}
        {[-0.42, 0.42].map((z, i) => (
          <group key={i}>
            <mesh position={[0, -0.32, z]} castShadow>
              <boxGeometry args={[0.9, 0.05, 0.06]} />
              <meshStandardMaterial color={CARBON_LIGHT} metalness={0.5} roughness={0.4} />
            </mesh>
            <mesh position={[0.38, -0.2, z]} rotation={[0, 0, 0.5]}>
              <boxGeometry args={[0.05, 0.26, 0.05]} />
              <meshStandardMaterial color={CARBON_LIGHT} metalness={0.5} roughness={0.4} />
            </mesh>
            <mesh position={[-0.38, -0.2, z]} rotation={[0, 0, -0.5]}>
              <boxGeometry args={[0.05, 0.26, 0.05]} />
              <meshStandardMaterial color={CARBON_LIGHT} metalness={0.5} roughness={0.4} />
            </mesh>
          </group>
        ))}

        {/* orientation LEDs: green front, red rear */}
        <mesh position={[0.78, 0.04, 0.34]}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshStandardMaterial color="#39ff9b" emissive="#39ff9b" emissiveIntensity={2.2} />
        </mesh>
        <mesh position={[0.78, 0.04, -0.34]}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshStandardMaterial color="#39ff9b" emissive="#39ff9b" emissiveIntensity={2.2} />
        </mesh>
        <mesh position={[-0.7, 0.04, 0.3]}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshStandardMaterial color="#ff4d5e" emissive="#ff4d5e" emissiveIntensity={2.2} />
        </mesh>
        <mesh position={[-0.7, 0.04, -0.3]}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshStandardMaterial color="#ff4d5e" emissive="#ff4d5e" emissiveIntensity={2.2} />
        </mesh>
      </group>
    </Float>
  );
}
