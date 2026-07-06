'use client';
import { useRef, useEffect, useMemo, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';

// Specimen label — drawn to a 2D canvas (barcode + patient data) and mapped
// around the label cylinder so it curves with the glass. Content sits in the
// middle arc with cream margins, so it reads on the front as the tube turns.
function createLabelTexture(): THREE.CanvasTexture {
  const W = 1024, H = 696;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Cream paper base.
  ctx.fillStyle = '#efeae0';
  ctx.fillRect(0, 0, W, H);

  const cxL = W * 0.25, cxR = W * 0.75, cw = cxR - cxL, mid = W * 0.5;

  // Barcode — alternating bars of varied width.
  const widths = [3,1,2,4,1,2,1,3,2,1,4,1,2,1,3,2,1,3,1,2,4,1,2,1,3,1,2,4,1,2,3,1,2,1,4,1,3,2,1,2,4,1,2,3,1,2,1,3];
  const unit = cw / widths.reduce((a, b) => a + b, 0);
  ctx.fillStyle = '#111111';
  let x = cxL, ink = true;
  for (const wgt of widths) {
    const bw = wgt * unit;
    if (ink) ctx.fillRect(x, H * 0.07, bw, H * 0.20);
    x += bw;
    ink = !ink;
  }

  // Patient text.
  ctx.fillStyle = '#1a1a1a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 46px Arial, sans-serif';
  ctx.fillText('PTN ID: ABX58732', mid, H * 0.375);

  // Subtle divider.
  ctx.strokeStyle = '#c8b878';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cxL, H * 0.50);
  ctx.lineTo(cxR, H * 0.50);
  ctx.stroke();

  ctx.fillStyle = '#1a1a1a';
  ctx.font = '600 44px Arial, sans-serif';
  ctx.fillText('NAME: JOHN DOE', mid, H * 0.655);
  ctx.font = '500 40px Arial, sans-serif';
  ctx.fillText('DOB: 12/05/1982', mid, H * 0.80);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// Blood liquid — a living volume filling the lower half of the tube. The body
// cylinder + rounded bottom stay RIGID (an independent tilt pokes the mesh
// through the glass walls), but the thin top surface ripples like a real
// meniscus and a handful of droplets bob above it to read as sloshing/splash.
// Radius is kept well inside the glass inner wall (0.195). Rendered inside the
// glass group (see GlassTube) so it rotates with the tube.
const SURFACE_Y = 0.5;
const DROPS = [
  { r: 0.055, a: 0.0, speed: 1.9, phase: 0.0, size: 0.020 },
  { r: 0.100, a: 2.1, speed: 1.5, phase: 1.2, size: 0.015 },
  { r: 0.040, a: 4.0, speed: 2.3, phase: 2.4, size: 0.024 },
  { r: 0.110, a: 5.2, speed: 1.7, phase: 3.1, size: 0.013 },
  { r: 0.080, a: 3.0, speed: 2.0, phase: 0.6, size: 0.018 },
];

function BloodLiquid({ mousePos }: {
  tubeRotation: React.MutableRefObject<number>;
  mousePos: React.MutableRefObject<{ x: number; y: number }>;
}) {
  const surfaceRef = useRef<THREE.Mesh>(null);
  const dropsRef = useRef<THREE.Group>(null);
  const glintRef = useRef<THREE.Mesh>(null);
  const flowRef = useRef<THREE.Group>(null);

  // Rippling surface disc — flat-lying circle whose vertices we displace each
  // frame. Keep a pristine copy of the base positions to offset from.
  const surfaceGeom = useMemo(() => new THREE.CircleGeometry(0.168, 56), []);
  const basePos = useMemo(
    () => Float32Array.from(surfaceGeom.attributes.position.array as ArrayLike<number>),
    [surfaceGeom],
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    // 1) Ripple the meniscus — sum of a few sine waves for organic motion.
    if (surfaceRef.current) {
      const pos = surfaceRef.current.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = basePos[i * 3], y = basePos[i * 3 + 1];
        const r = Math.sqrt(x * x + y * y);
        const wave =
          Math.sin(r * 26 - t * 3.4) * 0.010 +
          Math.sin(x * 22 + t * 2.1) * 0.006 +
          Math.cos(y * 20 - t * 1.7) * 0.005;
        pos.setZ(i, wave);
      }
      pos.needsUpdate = true;
      surfaceRef.current.geometry.computeVertexNormals();

      // Gentle slosh — a slow idle sway plus a nudge toward the cursor.
      surfaceRef.current.rotation.x = -Math.PI / 2 + Math.sin(t * 0.9) * 0.05 + mousePos.current.y * 0.06;
      surfaceRef.current.rotation.z = Math.cos(t * 0.7) * 0.05 - mousePos.current.x * 0.06;
    }

    // 2) Splash droplets — bob just above the surface and drift in a slow orbit.
    if (dropsRef.current) {
      dropsRef.current.children.forEach((child, i) => {
        const d = DROPS[i];
        const bob = Math.abs(Math.sin(t * d.speed + d.phase));
        child.position.set(
          Math.cos(d.a + t * 0.4) * d.r,
          SURFACE_Y + 0.01 + bob * 0.055,
          Math.sin(d.a + t * 0.4) * d.r,
        );
        child.scale.setScalar(0.6 + bob * 0.6);
      });
    }

    // 3) Specular glint skating across the surface.
    if (glintRef.current) {
      glintRef.current.position.x = Math.sin(t * 0.8) * 0.07;
      glintRef.current.position.z = Math.cos(t * 0.8) * 0.07;
    }

    // 4) Flow streaks — bright caustic highlights orbiting the lower body so the
    //    rigid blood column reads as moving/flowing liquid.
    if (flowRef.current) {
      flowRef.current.rotation.y = t * 0.6;
      flowRef.current.position.y = Math.sin(t * 1.3) * 0.02;
    }
  });

  return (
    <group>
      {/* Blood body — rigid */}
      <mesh position={[0, -0.3, 0]}>
        <cylinderGeometry args={[0.172, 0.172, 1.6, 64]} />
        <meshPhysicalMaterial color="#3d0000" roughness={0.05} metalness={0.15} envMapIntensity={1.5} />
      </mesh>
      {/* Rounded bottom — rigid */}
      <mesh position={[0, -1.1, 0]}>
        <sphereGeometry args={[0.172, 64, 64, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshPhysicalMaterial color="#3d0000" roughness={0.05} metalness={0.15} />
      </mesh>

      {/* Rippling meniscus — glossy, reflective liquid surface */}
      <mesh ref={surfaceRef} geometry={surfaceGeom} position={[0, SURFACE_Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <meshPhysicalMaterial
          color="#2a0000"
          roughness={0.02}
          metalness={0.35}
          clearcoat={1}
          clearcoatRoughness={0.05}
          envMapIntensity={3}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Moving specular glint on the surface */}
      <mesh ref={glintRef} position={[0, SURFACE_Y + 0.012, 0]}>
        <sphereGeometry args={[0.03, 16, 16]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.18} roughness={0} emissive="#ffffff" emissiveIntensity={0.35} />
      </mesh>

      {/* Splash droplets bobbing above the surface */}
      <group ref={dropsRef}>
        {DROPS.map((d, i) => (
          <mesh key={i} position={[0, SURFACE_Y, 0]}>
            <sphereGeometry args={[d.size, 20, 20]} />
            <meshPhysicalMaterial color="#4a0000" roughness={0.04} metalness={0.2} clearcoat={1} envMapIntensity={2} />
          </mesh>
        ))}
      </group>

      {/* Flow streaks — orbit the lower blood column to fake liquid motion */}
      <group ref={flowRef}>
        {[0, 2.1, 4.2].map((ang, i) => (
          <mesh key={i} position={[Math.cos(ang) * 0.1735, -0.68, Math.sin(ang) * 0.1735]} rotation={[0, -ang + Math.PI / 2, 0]}>
            <planeGeometry args={[0.045, 0.92]} />
            <meshStandardMaterial
              color="#ff5a5a"
              transparent
              opacity={0.16}
              emissive="#ff2a2a"
              emissiveIntensity={0.5}
              roughness={0}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// Glass tube with PBR transmission material
function GlassTube({ tubeRotation, mousePos }: {
  tubeRotation: React.MutableRefObject<number>;
  mousePos: React.MutableRefObject<{ x: number; y: number }>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const targetRotY = useRef(0);
  const currentRotY = useRef(0);
  const currentTiltX = useRef(0);
  const labelTex = useMemo(() => createLabelTexture(), []);

  useFrame((_, delta) => {
    // Continuous slow rotation
    targetRotY.current += delta * (Math.PI * 2 / 15); // one rotation per 15s

    // Mouse influence — max ±15°
    const mouseInfluenceY = mousePos.current.x * (Math.PI / 12);
    const mouseInfluenceX = mousePos.current.y * (Math.PI / 24);

    currentRotY.current += ((targetRotY.current + mouseInfluenceY) - currentRotY.current) * 0.05;
    currentTiltX.current += (mouseInfluenceX - currentTiltX.current) * 0.05;

    tubeRotation.current = currentRotY.current;

    if (groupRef.current) {
      groupRef.current.rotation.y = currentRotY.current;
      groupRef.current.rotation.x = currentTiltX.current;
      // Subtle floating idle
      groupRef.current.position.y = Math.sin(Date.now() * 0.001) * 0.04;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Glass tube body — transparent (opacity-based, renders consistently) */}
      <mesh>
        <cylinderGeometry args={[0.215, 0.200, 2.2, 64, 1, true]} />
        <meshPhysicalMaterial
          color="#ddeeff"
          transparent
          opacity={0.18}
          roughness={0.0}
          metalness={0.0}
          side={THREE.DoubleSide}
          envMapIntensity={3.0}
          reflectivity={1.0}
        />
      </mesh>

      {/* Glass inner surface */}
      <mesh>
        <cylinderGeometry args={[0.195, 0.180, 2.2, 64, 1, true]} />
        <meshPhysicalMaterial
          color="#ccddff"
          transparent
          opacity={0.08}
          roughness={0.0}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Rounded bottom (glass) */}
      <mesh position={[0, -1.1, 0]}>
        <sphereGeometry args={[0.200, 64, 64, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshPhysicalMaterial
          color="#ddeeff"
          transparent
          opacity={0.18}
          roughness={0.0}
          envMapIntensity={3.0}
        />
      </mesh>

      {/* Red laboratory cap */}
      <mesh position={[0, 1.15, 0]}>
        <cylinderGeometry args={[0.235, 0.225, 0.28, 64]} />
        <meshPhysicalMaterial
          color="#CC0000"
          roughness={0.3}
          metalness={0.1}
          envMapIntensity={1.5}
        />
      </mesh>

      {/* Cap top */}
      <mesh position={[0, 1.29, 0]}>
        <cylinderGeometry args={[0.235, 0.235, 0.02, 64]} />
        <meshPhysicalMaterial color="#AA0000" roughness={0.4} />
      </mesh>

      {/* Cream paper label with printed barcode + patient data (canvas texture).
          Hugs the glass outer surface (radius ≈ glass 0.215). */}
      <mesh position={[0, 0.0, 0]}>
        <cylinderGeometry args={[0.216, 0.201, 0.9, 128, 1, true]} />
        <meshStandardMaterial
          map={labelTex}
          color="#ffffff"
          roughness={0.82}
          metalness={0}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Primary specular highlight */}
      <mesh position={[-0.195, 0.3, 0.08]}>
        <cylinderGeometry args={[0.004, 0.003, 1.6, 8]} />
        <meshStandardMaterial
          color="#ffffff"
          transparent
          opacity={0.85}
          emissive="#ffffff"
          emissiveIntensity={1.2}
          roughness={0}
        />
      </mesh>

      {/* Soft secondary highlight */}
      <mesh position={[0.175, 0.0, 0.11]}>
        <cylinderGeometry args={[0.012, 0.010, 1.2, 8]} />
        <meshStandardMaterial
          color="#ffffff"
          transparent
          opacity={0.2}
          emissive="#ffffff"
          emissiveIntensity={0.4}
          roughness={0}
        />
      </mesh>

      {/* Blood — inside the glass group so it rotates with the tube (no independent tilt) */}
      <BloodLiquid tubeRotation={tubeRotation} mousePos={mousePos} />
    </group>
  );
}

function Scene({ mousePos }: { mousePos: React.MutableRefObject<{ x: number; y: number }> }) {
  const tubeRotation = useRef(0);

  return (
    <>
      {/* High-contrast directional lighting */}
      <ambientLight intensity={0.15} />
      <directionalLight position={[3, 6, 4]} intensity={3.0} color="#ffffff" />
      <directionalLight position={[-2, 2, -1]} intensity={1.0} color="#8899ff" />
      <spotLight position={[1, 4, 3]} intensity={2.0} angle={0.35} penumbra={0.6} color="#ffffff" />
      <pointLight position={[0, -1, 2]} intensity={0.5} color="#ff9999" />

      {/* Environment for reflections (not drawn as background) */}
      <Environment preset="city" background={false} />

      {/* Scaled up to fill the backdrop. Blood lives inside the GlassTube group
          so it rotates with the tube (see GlassTube). */}
      <group scale={[1.42, 1.42, 1.42]}>
        <GlassTube tubeRotation={tubeRotation} mousePos={mousePos} />
      </group>
    </>
  );
}

export function SpecimenTube3D() {
  const mousePos = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Adaptive quality — throttle DPR on low-end (≤4 core) devices.
  const isLowEnd = typeof navigator !== 'undefined' && navigator.hardwareConcurrency <= 4;

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      mousePos.current = {
        x: ((e.clientX - rect.left) / rect.width - 0.5) * 2,
        y: -((e.clientY - rect.top) / rect.height - 0.5) * 2,
      };
    };
    const handleMouseLeave = () => {
      mousePos.current = { x: 0, y: 0 };
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', cursor: 'none' }}>
      <Canvas
        camera={{ position: [0, 0.1, 7.5], fov: 26 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
        }}
        style={{ background: 'transparent' }}
        dpr={isLowEnd ? [1, 1] : [1, 2]}
      >
        <Suspense fallback={null}>
          <Scene mousePos={mousePos} />
        </Suspense>
      </Canvas>
    </div>
  );
}
