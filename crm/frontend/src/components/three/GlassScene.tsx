import { Environment, Float, Lightformer, MeshTransmissionMaterial, RoundedBox } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/** Floating liquid-glass objects (real refraction, chromatic dispersion). */

/** Pastel gradient the glass refracts (instead of the transparent canvas, which reads as black). */
function useRefractionBackdrop(dark: boolean) {
  return useMemo(() => {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const g = canvas.getContext("2d")!;
    g.fillStyle = dark ? "#0b0e22" : "#eef1ff";
    g.fillRect(0, 0, size, size);
    const blobs: [number, number, number, string][] = dark
      ? [
          [0.2, 0.25, 0.55, "79,93,255"],
          [0.85, 0.3, 0.5, "177,76,255"],
          [0.5, 0.9, 0.55, "17,197,230"],
          [0.1, 0.85, 0.4, "255,79,179"],
        ]
      : [
          [0.2, 0.25, 0.55, "125,139,255"],
          [0.85, 0.3, 0.5, "216,140,255"],
          [0.5, 0.9, 0.55, "94,224,245"],
          [0.1, 0.85, 0.4, "255,164,212"],
        ];
    for (const [x, y, r, rgb] of blobs) {
      const grd = g.createRadialGradient(x * size, y * size, 0, x * size, y * size, r * size);
      grd.addColorStop(0, `rgba(${rgb},${dark ? 0.85 : 0.9})`);
      grd.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = grd;
      g.fillRect(0, 0, size, size);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, [dark]);
}

function useGlass(dark: boolean) {
  const background = useRefractionBackdrop(dark);
  return useMemo(
    () => ({
      background,
      transmission: 1,
      thickness: 1.4,
      roughness: 0.04,
      ior: 1.42,
      chromaticAberration: 0.12,
      anisotropy: 0.25,
      distortion: 0.35,
      distortionScale: 0.4,
      temporalDistortion: 0.08,
      clearcoat: 1,
      attenuationDistance: 2.4,
      attenuationColor: dark ? "#c7ceff" : "#ffffff",
      color: dark ? "#dfe3ff" : "#ffffff",
      backside: true,
      backsideThickness: 0.6,
      samples: 6,
      resolution: 384,
    }),
    [dark, background],
  );
}

function Prism({ dark }: { dark: boolean }) {
  const glass = useGlass(dark);
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.25;
  });
  return (
    <Float speed={1.4} rotationIntensity={0.5} floatIntensity={1.1}>
      <mesh ref={ref} position={[0.2, 0.15, 0]} rotation={[0.25, 0.4, 0.1]}>
        <cylinderGeometry args={[1.05, 1.05, 1.6, 3, 1]} />
        <MeshTransmissionMaterial {...glass} />
      </mesh>
    </Float>
  );
}

function Ring({ dark }: { dark: boolean }) {
  const glass = useGlass(dark);
  return (
    <Float speed={1.1} rotationIntensity={1.2} floatIntensity={0.8}>
      <mesh position={[-2.05, -0.55, -0.6]} rotation={[1.1, 0.2, 0.3]}>
        <torusGeometry args={[0.62, 0.22, 48, 96]} />
        <MeshTransmissionMaterial {...glass} thickness={0.8} />
      </mesh>
    </Float>
  );
}

function Pill({ dark }: { dark: boolean }) {
  const glass = useGlass(dark);
  return (
    <Float speed={1.6} rotationIntensity={0.8} floatIntensity={1.4}>
      <RoundedBox args={[1.05, 1.05, 0.38]} radius={0.18} smoothness={6} position={[2.1, -0.65, -0.3]} rotation={[0.4, -0.5, 0.2]}>
        <MeshTransmissionMaterial {...glass} thickness={0.9} />
      </RoundedBox>
    </Float>
  );
}

function Orb({ dark }: { dark: boolean }) {
  const glass = useGlass(dark);
  return (
    <Float speed={2} rotationIntensity={0.3} floatIntensity={1.8}>
      <mesh position={[1.55, 1.15, -0.8]}>
        <sphereGeometry args={[0.36, 64, 64]} />
        <MeshTransmissionMaterial {...glass} thickness={0.6} chromaticAberration={0.2} />
      </mesh>
    </Float>
  );
}

/** Colored light fields behind the glass: what the glass refracts. */
function Aura({ dark }: { dark: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.getElapsedTime();
    group.current.children.forEach((child, i) => {
      child.position.x += Math.sin(t * 0.4 + i) * 0.0025;
      child.position.y += Math.cos(t * 0.3 + i * 2) * 0.002;
    });
  });
  const colors = dark ? ["#4f5dff", "#b14cff", "#11c5e6", "#ff4fb3"] : ["#7d8bff", "#d88cff", "#5ee0f5", "#ffa4d4"];
  const positions: [number, number, number][] = [
    [-1.6, 0.9, -3],
    [1.9, 0.6, -3.4],
    [0.2, -1.4, -3.2],
    [-0.3, 1.6, -3.8],
  ];
  return (
    <group ref={group}>
      {positions.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[1.25 - i * 0.12, 32, 32]} />
          <meshBasicMaterial color={colors[i]} transparent opacity={dark ? 0.85 : 0.75} />
        </mesh>
      ))}
    </group>
  );
}

function Rig() {
  const { camera, pointer } = useThree();
  useFrame(() => {
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, pointer.x * 0.6, 0.04);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, pointer.y * 0.35, 0.04);
    camera.lookAt(0, 0, 0);
  });
  return null;
}

export default function GlassScene({ dark = true, className }: { dark?: boolean; className?: string }) {
  return (
    <div className={className}>
      <Canvas dpr={[1, 1.75]} camera={{ position: [0, 0, 5.4], fov: 42 }} gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}>
        <ambientLight intensity={dark ? 0.4 : 0.8} />
        <directionalLight position={[3, 4, 5]} intensity={dark ? 1.4 : 2} />
        <Aura dark={dark} />
        <Prism dark={dark} />
        <Ring dark={dark} />
        <Pill dark={dark} />
        <Orb dark={dark} />
        <Environment resolution={256}>
          <group rotation={[-Math.PI / 3, 0, 1]}>
            <Lightformer form="circle" intensity={4} position={[0, 5, -9]} scale={10} />
            <Lightformer form="circle" intensity={2} rotation-y={Math.PI / 2} position={[-5, 1, -1]} scale={3} />
            <Lightformer form="ring" color="#a78bfa" intensity={6} rotation-y={Math.PI / 2} position={[-5, -1, -1]} scale={6} />
            <Lightformer form="rect" color="#67e8f9" intensity={3} rotation-y={-Math.PI / 2} position={[10, 1, 0]} scale={8} />
          </group>
        </Environment>
        <Rig />
      </Canvas>
    </div>
  );
}
