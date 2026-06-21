import { Component, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer } from "@react-three/drei";

import Drone from "./Drone.jsx";

function hasWebGL() {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

/** Soft CSS stand-in when WebGL isn't available or the canvas errors out. */
function SceneFallback() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="h-72 w-72 animate-floaty rounded-full bg-aero-400/40 blur-3xl" />
      <svg
        viewBox="0 0 24 24"
        className="absolute h-40 w-40 text-aero-500 drop-shadow-[0_20px_40px_rgba(14,144,241,0.35)]"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M2 12 22 3l-7 18-3.2-7.2L2 12z" />
      </svg>
    </div>
  );
}

class CanvasBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <SceneFallback />;
    return this.props.children;
  }
}

export default function HeroScene() {
  if (!hasWebGL()) return <SceneFallback />;

  return (
    <CanvasBoundary>
      <Canvas
        shadows
        dpr={[1, 1.8]}
        camera={{ position: [0.15, 0.6, 3.1], fov: 38 }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.65} />
        <directionalLight
          position={[4, 6, 4]}
          intensity={2.1}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-bias={-0.0001}
        />
        <directionalLight position={[-5, 2, -3]} intensity={0.7} color="#9ed3ff" />
        <pointLight position={[0, -2, 2]} intensity={0.8} color="#7fc8ff" />

        <Suspense fallback={null}>
          <Drone />
          {/* Procedural reflections — no external HDR file required */}
          <Environment resolution={256} frames={1}>
            <Lightformer intensity={3} position={[0, 5, 1]} scale={[10, 5, 1]} color="#ffffff" />
            <Lightformer intensity={1.4} position={[-5, 1, -2]} scale={[5, 5, 1]} color="#7fc8ff" />
            <Lightformer intensity={1.2} position={[5, 0, 2]} scale={[5, 5, 1]} color="#ffffff" />
          </Environment>
          <ContactShadows
            position={[0, -2.4, 0]}
            opacity={0.32}
            scale={12}
            blur={3.8}
            far={4.5}
            resolution={512}
            color="#0a4685"
          />
        </Suspense>
      </Canvas>
    </CanvasBoundary>
  );
}
