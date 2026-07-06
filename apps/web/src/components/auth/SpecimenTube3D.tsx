'use client';
import { useRef, useEffect, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';

// Blood liquid — a STATIC volume filling the lower half of the tube. Rendered
// inside the glass group (see GlassTube) so it rotates with the tube but never
// tilts independently — an independent tilt pokes the rigid mesh through the
// glass walls. Radius is kept well inside the glass inner wall (0.195).
function BloodLiquid(_props: {
  tubeRotation: React.MutableRefObject<number>;
  mousePos: React.MutableRefObject<{ x: number; y: number }>;
}) {
  return (
    <group>
      {/* Blood body */}
      <mesh position={[0, -0.3, 0]}>
        <cylinderGeometry args={[0.172, 0.172, 1.6, 64]} />
        <meshPhysicalMaterial
          color="#3d0000"
          roughness={0.05}
          metalness={0.15}
          envMapIntensity={1.5}
        />
      </mesh>
      {/* Rounded bottom */}
      <mesh position={[0, -1.1, 0]}>
        <sphereGeometry args={[0.172, 64, 64, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshPhysicalMaterial color="#3d0000" roughness={0.05} metalness={0.15} />
      </mesh>
      {/* Blood surface — glossy top */}
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.170, 0.170, 0.02, 64]} />
        <meshPhysicalMaterial
          color="#1a0000"
          roughness={0.0}
          metalness={0.3}
          envMapIntensity={3}
        />
      </mesh>
      {/* Surface highlight — tiny bright spot */}
      <mesh position={[-0.06, 0.51, 0.1]}>
        <sphereGeometry args={[0.025, 16, 16]} />
        <meshStandardMaterial
          color="#ffffff"
          transparent
          opacity={0.15}
          roughness={0}
          emissive="#ffffff"
          emissiveIntensity={0.3}
        />
      </mesh>
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

      {/* Cream paper label — hugs the glass outer surface (radius ≈ glass 0.215) */}
      <mesh position={[0, 0.0, 0]}>
        <cylinderGeometry args={[0.216, 0.201, 0.9, 128, 1, true]} />
        <meshStandardMaterial
          color="#ede8d8"
          roughness={0.88}
          metalness={0}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Single thin barcode stripe — just outside the label so it sits ON it */}
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.217, 0.202, 0.05, 128, 1, true]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.95} side={THREE.DoubleSide} />
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
      <group scale={[1.62, 1.62, 1.62]}>
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
