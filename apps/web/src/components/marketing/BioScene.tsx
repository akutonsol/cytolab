'use client';
import { useMemo, useRef, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Soft radial glow texture for additive bloom sprites (fakes post-process bloom).
function makeGlow(): THREE.CanvasTexture {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,150,150,0.55)');
  g.addColorStop(1, 'rgba(255,60,60,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Bloom({ position, scale, color = '#ff5a5a', opacity = 0.5 }: { position: [number, number, number]; scale: number; color?: string; opacity?: number }) {
  const tex = useMemo(makeGlow, []);
  return (
    <sprite position={position} scale={[scale, scale, 1]}>
      <spriteMaterial map={tex} color={color} transparent opacity={opacity} depthWrite={false} blending={THREE.AdditiveBlending} />
    </sprite>
  );
}

// ── Red blood cells — flattened biconcave discs orbiting at varied depths ──
interface Cell { radius: number; y: number; ySpread: number; speed: number; phase: number; size: number; toward: number; }
const RBCS: Cell[] = Array.from({ length: 18 }, (_, i) => ({
  radius: 1.4 + (i % 6) * 0.55,
  y: (i % 5) * 0.7 - 1.6,
  ySpread: 0.25 + (i % 4) * 0.12,
  speed: 0.12 + (i % 7) * 0.03,
  phase: i * 1.19,
  size: 0.16 + (i % 5) * 0.05,
  toward: i % 4 === 0 ? 1 : 0, // a few drift toward the camera
}));

function RedCells() {
  const ref = useRef<THREE.Group>(null);
  const geo = useMemo(() => new THREE.SphereGeometry(1, 20, 20), []);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const g = ref.current;
    if (!g) return;
    g.children.forEach((child, i) => {
      const c = RBCS[i];
      const a = t * c.speed + c.phase;
      const towardZ = c.toward ? Math.sin(t * 0.35 + c.phase) * 1.6 : 0;
      child.position.set(
        Math.cos(a) * c.radius,
        c.y + Math.sin(t * 0.6 + c.phase) * c.ySpread,
        Math.sin(a) * c.radius + towardZ,
      );
      child.rotation.x = a * 0.6;
      child.rotation.z = a * 0.4;
    });
  });
  return (
    <group ref={ref}>
      {RBCS.map((c, i) => (
        <mesh key={i} geometry={geo} scale={[c.size, c.size * 0.42, c.size]}>
          <meshStandardMaterial color="#c11722" emissive="#5a0000" emissiveIntensity={0.5} roughness={0.35} metalness={0.1} transparent opacity={0.96} />
        </mesh>
      ))}
    </group>
  );
}

// ── White blood cells — translucent, softly glowing, independent drift ──
const WBCS = Array.from({ length: 5 }, (_, i) => ({ x: (i - 2) * 1.5, y: (i % 3) * 1.1 - 1, z: (i % 2 ? 1 : -1) * 1.2, speed: 0.18 + i * 0.04, phase: i * 2.1, size: 0.34 + (i % 3) * 0.08 }));
function WhiteCells() {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    ref.current?.children.forEach((child, i) => {
      const w = WBCS[i];
      child.position.set(
        w.x + Math.sin(t * w.speed + w.phase) * 1.1,
        w.y + Math.cos(t * w.speed * 0.8 + w.phase) * 0.9,
        w.z + Math.sin(t * w.speed * 0.6 + w.phase) * 0.8,
      );
    });
  });
  return (
    <group ref={ref}>
      {WBCS.map((w, i) => (
        <group key={i}>
          <mesh>
            <sphereGeometry args={[w.size, 24, 24]} />
            <meshPhysicalMaterial color="#ffd9e0" transparent opacity={0.22} roughness={0.15} transmission={0.6} thickness={0.5} />
          </mesh>
          <Bloom position={[0, 0, 0]} scale={w.size * 4.4} color="#ffb0c4" opacity={0.28} />
        </group>
      ))}
    </group>
  );
}

// ── DNA fragment — faint double helix, slow rotate, fades in/out ──
function Dna({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);
  const nodes = useMemo(() => Array.from({ length: 22 }, (_, i) => i), []);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (ref.current) {
      ref.current.rotation.y = t * 0.4;
      const fade = (Math.sin(t * 0.5) * 0.5 + 0.5) * 0.5 + 0.1;
      ref.current.children.forEach((c) => {
        const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
        if (m) m.opacity = fade;
      });
    }
  });
  return (
    <group ref={ref} position={position} scale={0.5}>
      {nodes.map((i) => {
        const yy = i * 0.22 - 2.4;
        const ang = i * 0.5;
        return (
          <group key={i}>
            <mesh position={[Math.cos(ang) * 0.6, yy, Math.sin(ang) * 0.6]}>
              <sphereGeometry args={[0.07, 10, 10]} />
              <meshBasicMaterial color="#ff8aa0" transparent opacity={0.3} depthWrite={false} />
            </mesh>
            <mesh position={[Math.cos(ang + Math.PI) * 0.6, yy, Math.sin(ang + Math.PI) * 0.6]}>
              <sphereGeometry args={[0.07, 10, 10]} />
              <meshBasicMaterial color="#ffc0cb" transparent opacity={0.3} depthWrite={false} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// ── Holographic rings around the vial ──
function Rings() {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (!ref.current) return;
    ref.current.rotation.z = t * 0.15;
    ref.current.rotation.x = Math.sin(t * 0.2) * 0.3 + Math.PI / 2.4;
  });
  return (
    <group ref={ref}>
      {[1.6, 2.1, 2.7].map((r, i) => (
        <mesh key={i} rotation={[0, 0, i * 0.4]}>
          <torusGeometry args={[r, 0.006, 8, 120]} />
          <meshBasicMaterial color="#ff7a7a" transparent opacity={0.22 - i * 0.04} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

// ── Drifting microscopic dust ──
function Dust() {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const n = 340;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 16;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 10;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame((state) => {
    if (ref.current) ref.current.rotation.y = state.clock.elapsedTime * 0.02;
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial size={0.03} color="#ffc4c4" transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

// ── Stylized premium specimen vial (compact — one Canvas for the whole scene) ──
function Vial() {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (ref.current) ref.current.rotation.y = state.clock.elapsedTime * (Math.PI * 2) / 22;
  });
  return (
    <group ref={ref} scale={1.15}>
      {/* Glass body */}
      <mesh>
        <cylinderGeometry args={[0.42, 0.4, 2.6, 48, 1, true]} />
        <meshPhysicalMaterial color="#ffe3e3" transparent opacity={0.16} roughness={0} metalness={0} side={THREE.DoubleSide} envMapIntensity={2} />
      </mesh>
      {/* Blood fill */}
      <mesh position={[0, -0.55, 0]}>
        <cylinderGeometry args={[0.37, 0.37, 1.5, 48]} />
        <meshStandardMaterial color="#8b0000" emissive="#3a0000" emissiveIntensity={0.6} roughness={0.1} metalness={0.2} />
      </mesh>
      <mesh position={[0, -1.3, 0]}>
        <sphereGeometry args={[0.37, 40, 40, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#8b0000" roughness={0.1} metalness={0.2} />
      </mesh>
      {/* Red cap */}
      <mesh position={[0, 1.42, 0]}>
        <cylinderGeometry args={[0.46, 0.44, 0.32, 48]} />
        <meshStandardMaterial color="#d81f27" roughness={0.35} metalness={0.15} />
      </mesh>
      <Bloom position={[0, -0.2, 0]} scale={3.4} color="#ff4d4d" opacity={0.4} />
    </group>
  );
}

function Scene() {
  const root = useRef<THREE.Group>(null);
  const assemble = useRef(0);
  useFrame((state, delta) => {
    const g = root.current;
    if (!g) return;
    // Slow assemble on mount, then hold.
    assemble.current = Math.min(1, assemble.current + delta * 0.6);
    const s = 0.92 + assemble.current * 0.08;
    g.scale.setScalar(s);
    // Mouse parallax — the whole ecosystem leans toward the cursor.
    const { x, y } = state.pointer;
    g.rotation.y += ((x * 0.28) - g.rotation.y) * 0.04;
    g.rotation.x += ((-y * 0.16) - g.rotation.x) * 0.04;
    state.camera.position.x += (x * 0.4 - state.camera.position.x) * 0.03;
    state.camera.position.y += (y * 0.3 - state.camera.position.y) * 0.03;
    state.camera.lookAt(2.2, 0, 0);
  });
  return (
    // Offset to center-right; the copy occupies the left.
    <group position={[2.4, 0, 0]}>
      <group ref={root}>
        <Vial />
        <Rings />
        <RedCells />
        <WhiteCells />
        <Dna position={[-2.6, 0.6, -1]} />
        <Dna position={[2.4, -0.8, -0.5]} />
        <Dust />
      </group>
    </group>
  );
}

export function BioScene() {
  return (
    <Canvas
      camera={{ position: [0, 0, 9], fov: 42 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.15 }}
      style={{ background: 'transparent' }}
      dpr={[1, 2]}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 6, 5]} intensity={2.2} color="#ffdede" />
      <pointLight position={[3, 0, 4]} intensity={40} color="#ff5a5a" distance={20} decay={2} />
      <pointLight position={[-3, 2, 2]} intensity={14} color="#ff9a9a" distance={18} decay={2} />
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
    </Canvas>
  );
}
