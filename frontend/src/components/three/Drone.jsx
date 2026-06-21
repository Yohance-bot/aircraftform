import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Float, RoundedBox } from "@react-three/drei";

// FPV racing quad palette — matched to the reference photo.
const CARBON = "#16191f"; // matte carbon frame
const CARBON_HI = "#272d38"; // lighter carbon edges / plates
const METAL = "#2b2f36"; // motor stators
const RED = "#e0211f"; // motor bells / accents
const RED_DK = "#9c1414";
const BATTERY = "#f97316"; // orange LiPo pack
const BATTERY_HI = "#ffb066";
const STRAP = "#0c0e12"; // battery strap / rubber
const LENS = "#0a1a2a";

// True X-frame: arms splay to the four corners.
const ARM_ANGLES = [45, 135, 225, 315].map((d) => (d * Math.PI) / 180);
const ARM_LEN = 1.18;
const PROP_R = 0.6;

function TriProp({ spin = 1 }) {
  const ref = useRef();
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 30 * spin;
  });
  return (
    <group ref={ref}>
      {/* hub */}
      <mesh castShadow>
        <cylinderGeometry args={[0.06, 0.07, 0.07, 16]} />
        <meshStandardMaterial color={CARBON_HI} metalness={0.6} roughness={0.35} />
      </mesh>
      {/* three swept racing blades */}
      {[0, (2 * Math.PI) / 3, (4 * Math.PI) / 3].map((rot, i) => (
        <group key={i} rotation={[0, rot, 0]}>
          <mesh position={[PROP_R / 2, 0, 0]} rotation={[0.18, 0, 0]} castShadow>
            <boxGeometry args={[PROP_R, 0.015, 0.12]} />
            <meshStandardMaterial
              color="#11151c"
              transparent
              opacity={0.42}
              metalness={0.1}
              roughness={0.5}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Motor({ angle, spin }) {
  return (
    <group rotation={[0, angle, 0]}>
      {/* flat carbon arm */}
      <mesh position={[ARM_LEN / 2, -0.02, 0]} castShadow receiveShadow>
        <boxGeometry args={[ARM_LEN, 0.05, 0.15]} />
        <meshStandardMaterial color={CARBON} metalness={0.5} roughness={0.4} />
      </mesh>
      {/* arm taper tip / motor mount */}
      <mesh position={[ARM_LEN, 0.0, 0]} castShadow>
        <cylinderGeometry args={[0.17, 0.17, 0.05, 20]} />
        <meshStandardMaterial color={CARBON_HI} metalness={0.55} roughness={0.4} />
      </mesh>
      {/* motor stator (dark) */}
      <mesh position={[ARM_LEN, 0.1, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.15, 0.13, 24]} />
        <meshStandardMaterial color={METAL} metalness={0.85} roughness={0.3} />
      </mesh>
      {/* red motor bell */}
      <mesh position={[ARM_LEN, 0.2, 0]} castShadow>
        <cylinderGeometry args={[0.155, 0.14, 0.1, 24]} />
        <meshStandardMaterial color={RED} metalness={0.6} roughness={0.28} />
      </mesh>
      {/* red prop nut */}
      <mesh position={[ARM_LEN, 0.27, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.06, 0.05, 18]} />
        <meshStandardMaterial color={RED_DK} metalness={0.7} roughness={0.25} />
      </mesh>
      {/* propeller */}
      <group position={[ARM_LEN, 0.31, 0]}>
        <TriProp spin={spin} />
      </group>
      {/* under-arm LED glow */}
      <mesh position={[ARM_LEN, -0.06, 0]}>
        <boxGeometry args={[0.16, 0.02, 0.1]} />
        <meshStandardMaterial color={RED} emissive={RED} emissiveIntensity={2.4} />
      </mesh>
    </group>
  );
}

/**
 * Procedural FPV racing quadcopter (no external model files):
 * carbon X-frame stack, red motor bells, an orange LiPo strapped on top with
 * an XT60 lead, a tilted FPV camera and a tail antenna.
 * Slowly rotates like a product turntable and reacts to the pointer.
 */
export default function Drone() {
  const rig = useRef();

  useFrame((state) => {
    if (!rig.current) return;
    const t = state.clock.elapsedTime;
    rig.current.rotation.y = t * 0.35 + state.pointer.x * 0.4;
    rig.current.rotation.x = 0.12 + state.pointer.y * 0.16;
  });

  return (
    <Float speed={2} rotationIntensity={0.22} floatIntensity={0.85} floatingRange={[-0.1, 0.1]}>
      {/* tilt back slightly so the top-mounted battery reads clearly */}
      <group ref={rig} scale={1.25} position={[0, -0.05, 0]} rotation={[0.12, 0.5, 0]}>
        {/* ---- carbon frame stack ---- */}
        {/* bottom plate */}
        <RoundedBox
          args={[1.34, 0.05, 0.52]}
          radius={0.04}
          smoothness={4}
          position={[0, -0.08, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color={CARBON} metalness={0.5} roughness={0.4} />
        </RoundedBox>
        {/* top plate */}
        <RoundedBox
          args={[1.05, 0.045, 0.46]}
          radius={0.04}
          smoothness={4}
          position={[0, 0.08, 0]}
          castShadow
        >
          <meshStandardMaterial color={CARBON} metalness={0.5} roughness={0.4} />
        </RoundedBox>
        {/* standoffs between plates */}
        {[
          [0.42, 0.16],
          [0.42, -0.16],
          [-0.42, 0.16],
          [-0.42, -0.16],
        ].map(([x, z], i) => (
          <mesh key={i} position={[x, 0, z]} castShadow>
            <cylinderGeometry args={[0.035, 0.035, 0.18, 12]} />
            <meshStandardMaterial color={CARBON_HI} metalness={0.7} roughness={0.3} />
          </mesh>
        ))}

        {/* ---- arms + motors + props ---- */}
        {ARM_ANGLES.map((a, i) => (
          <Motor key={i} angle={a} spin={i % 2 === 0 ? 1 : -1} />
        ))}

        {/* ---- orange LiPo battery on top ---- */}
        <group position={[0, 0.24, 0]}>
          <RoundedBox args={[1.0, 0.24, 0.42]} radius={0.05} smoothness={4} castShadow>
            <meshStandardMaterial color={BATTERY} metalness={0.25} roughness={0.45} />
          </RoundedBox>
          {/* highlight label band */}
          <mesh position={[0, 0.02, 0.212]}>
            <boxGeometry args={[0.7, 0.12, 0.01]} />
            <meshStandardMaterial color={BATTERY_HI} metalness={0.2} roughness={0.5} />
          </mesh>
          {/* black rubber strap across the pack */}
          <mesh position={[0.12, 0.01, 0]}>
            <boxGeometry args={[0.16, 0.27, 0.45]} />
            <meshStandardMaterial color={STRAP} metalness={0.1} roughness={0.7} />
          </mesh>
          {/* XT60 connector + leads poking out the front */}
          <mesh position={[0.56, -0.02, 0]} castShadow>
            <boxGeometry args={[0.14, 0.14, 0.16]} />
            <meshStandardMaterial color="#f5c542" metalness={0.3} roughness={0.5} />
          </mesh>
          <mesh position={[0.69, 0.0, 0.05]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.025, 0.025, 0.18, 10]} />
            <meshStandardMaterial color={RED} roughness={0.5} />
          </mesh>
          <mesh position={[0.69, 0.0, -0.05]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.025, 0.025, 0.18, 10]} />
            <meshStandardMaterial color="#0c0e12" roughness={0.5} />
          </mesh>
        </group>

        {/* ---- tilted FPV camera at the front ---- */}
        <group position={[0.52, 0.12, 0]} rotation={[0, 0, 0.32]}>
          <mesh castShadow>
            <boxGeometry args={[0.2, 0.2, 0.22]} />
            <meshStandardMaterial color={CARBON_HI} metalness={0.5} roughness={0.4} />
          </mesh>
          {/* lens */}
          <mesh position={[0.12, 0.0, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.07, 0.08, 0.08, 20]} />
            <meshStandardMaterial color={LENS} metalness={0.6} roughness={0.15} />
          </mesh>
          <mesh position={[0.17, 0.0, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <cylinderGeometry args={[0.045, 0.045, 0.02, 16]} />
            <meshStandardMaterial color="#1f6dff" emissive="#1f6dff" emissiveIntensity={0.6} metalness={0.5} roughness={0.1} />
          </mesh>
        </group>

        {/* ---- tail VTX antenna ---- */}
        <group position={[-0.5, 0.16, 0]} rotation={[0, 0, -0.5]}>
          <mesh position={[-0.12, 0.16, 0]} castShadow>
            <cylinderGeometry args={[0.018, 0.018, 0.4, 10]} />
            <meshStandardMaterial color="#0c0e12" roughness={0.6} />
          </mesh>
          {/* pagoda tip */}
          <mesh position={[-0.2, 0.34, 0]} castShadow>
            <capsuleGeometry args={[0.045, 0.1, 4, 12]} />
            <meshStandardMaterial color={RED} metalness={0.3} roughness={0.4} />
          </mesh>
        </group>

        {/* front orientation LEDs (white) */}
        {[0.22, -0.22].map((z, i) => (
          <mesh key={i} position={[0.62, -0.04, z]}>
            <sphereGeometry args={[0.04, 12, 12]} />
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={2.4} />
          </mesh>
        ))}
      </group>
    </Float>
  );
}
