'use client';
import { useRef, useEffect, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, MeshTransmissionMaterial } from '@react-three/drei';
import * as THREE from 'three';

// Blood liquid mesh with gravity simulation
function BloodLiquid({ tubeRotation }: { tubeRotation: React.MutableRefObject<number> }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const liquidTilt = useRef(0);
  const targetTilt = useRef(0);

  useFrame(() => {
    // Blood reacts to rotation with inertia
    targetTilt.current = Math.sin(tubeRotation.current) * 0.15;
    liquidTilt.current += (targetTilt.current - liquidTilt.current) * 0.05;
    if (meshRef.current) {
      meshRef.current.rotation.z = liquidTilt.current;
    }
  });

  return (
    <mesh ref={meshRef} position={[0, -0.6, 0]}>
      <cylinderGeometry args={[0.195, 0.195, 0.8, 64, 1, false]} />
      <meshPhysicalMaterial
        color="#8B0000"
        transparent
        opacity={0.92}
        roughness={0.1}
        metalness={0.05}
        transmission={0.1}
        thickness={0.5}
        envMapIntensity={0.8}
      />
    </mesh>
  );
}

// Glass tube with PBR transmission material
function GlassTube({ tubeRotation, mousePos, samples }: {
  tubeRotation: React.MutableRefObject<number>;
  mousePos: React.MutableRefObject<{ x: number; y: number }>;
  samples: number;
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
      {/* Glass tube body */}
      <mesh>
        <cylinderGeometry args={[0.22, 0.20, 2.4, 64, 1, true]} />
        <MeshTransmissionMaterial
          backside
          samples={samples}
          resolution={512}
          transmission={0.95}
          roughness={0.05}
          thickness={0.15}
          ior={1.5}
          chromaticAberration={0.03}
          anisotropy={0.1}
          distortion={0.1}
          distortionScale={0.1}
          temporalDistortion={0.02}
          color="#e8f4f8"
          attenuationColor="#ffffff"
          attenuationDistance={0.5}
          envMapIntensity={2}
        />
      </mesh>

      {/* Glass tube outer shell for Fresnel */}
      <mesh>
        <cylinderGeometry args={[0.22, 0.20, 2.4, 64, 1, false]} />
        <meshPhysicalMaterial
          color="#ffffff"
          transparent
          opacity={0.08}
          roughness={0.0}
          metalness={0.0}
          transmission={0.0}
          side={THREE.FrontSide}
          envMapIntensity={3}
        />
      </mesh>

      {/* Rounded bottom cap */}
      <mesh position={[0, -1.2, 0]}>
        <sphereGeometry args={[0.20, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <MeshTransmissionMaterial
          samples={Math.max(2, Math.floor(samples / 2))}
          transmission={0.95}
          roughness={0.05}
          thickness={0.2}
          ior={1.5}
          color="#e8f4f8"
          envMapIntensity={2}
        />
      </mesh>

      {/* Red laboratory cap */}
      <mesh position={[0, 1.25, 0]}>
        <cylinderGeometry args={[0.235, 0.225, 0.28, 64]} />
        <meshPhysicalMaterial
          color="#CC0000"
          roughness={0.3}
          metalness={0.1}
          envMapIntensity={1.5}
        />
      </mesh>

      {/* Cap top */}
      <mesh position={[0, 1.39, 0]}>
        <cylinderGeometry args={[0.235, 0.235, 0.02, 64]} />
        <meshPhysicalMaterial color="#AA0000" roughness={0.4} />
      </mesh>

      {/* Label wrapped around tube */}
      <mesh position={[0, -0.1, 0]}>
        <cylinderGeometry args={[0.225, 0.205, 1.1, 64, 1, true]} />
        <meshStandardMaterial
          color="#f5f0e8"
          roughness={0.8}
          metalness={0}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Label text lines (simulated) */}
      {[-0.05, 0.15, 0.3].map((y, i) => (
        <mesh key={i} position={[0, y, 0]}>
          <cylinderGeometry args={[0.226, 0.206, 0.04, 64, 1, true]} />
          <meshStandardMaterial
            color={i === 0 ? '#333333' : '#666666'}
            roughness={0.9}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}

      {/* Blood inside */}
      <BloodLiquid tubeRotation={tubeRotation} />

      {/* Blood surface meniscus */}
      <mesh position={[0, -0.19, 0]}>
        <cylinderGeometry args={[0.193, 0.193, 0.015, 64]} />
        <meshPhysicalMaterial
          color="#6B0000"
          roughness={0.05}
          metalness={0.1}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Specular highlight strip */}
      <mesh position={[0.18, 0, 0.05]}>
        <cylinderGeometry args={[0.005, 0.005, 2.0, 16, 1, true]} />
        <meshStandardMaterial
          color="#ffffff"
          transparent
          opacity={0.4}
          roughness={0}
          emissive="#ffffff"
          emissiveIntensity={0.3}
        />
      </mesh>
    </group>
  );
}

function Scene({ mousePos, samples }: {
  mousePos: React.MutableRefObject<{ x: number; y: number }>;
  samples: number;
}) {
  const tubeRotation = useRef(0);

  return (
    <>
      {/* Three-point lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[3, 5, 3]} intensity={1.8} castShadow color="#ffffff" />
      <directionalLight position={[-3, 2, -2]} intensity={0.6} color="#b0c8ff" />
      <pointLight position={[0, -2, 3]} intensity={0.4} color="#ffffff" />

      {/* Environment for reflections */}
      <Environment preset="studio" />

      <GlassTube tubeRotation={tubeRotation} mousePos={mousePos} samples={samples} />

      {/* Soft shadow plane */}
      <mesh position={[0, -1.8, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.8, 32]} />
        <meshStandardMaterial color="#000000" transparent opacity={0.15} />
      </mesh>
    </>
  );
}

export function SpecimenTube3D() {
  const mousePos = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Adaptive quality — throttle samples / DPR on low-end (≤4 core) devices.
  const isLowEnd = typeof navigator !== 'undefined' && navigator.hardwareConcurrency <= 4;
  const samples = isLowEnd ? 4 : 8;

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
        camera={{ position: [0, 0, 4], fov: 35 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
        }}
        shadows
        dpr={isLowEnd ? [1, 1] : [1, 2]}
      >
        <Suspense fallback={null}>
          <Scene mousePos={mousePos} samples={samples} />
        </Suspense>
      </Canvas>
    </div>
  );
}
