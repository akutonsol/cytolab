'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * Cinematic hero scene: a slowly rotating, tilted blood-specimen vial with a
 * rippling surface, orbiting blood cells, a liquid ripple beneath the base, and
 * drifting background particles. Pure Three.js on a transparent canvas so it
 * sits over the hero's light gradient.
 *
 * Bloom (UnrealBloomPass) is intentionally skipped — it composites to a black
 * background over an alpha canvas. Glow is faked with emissive materials and
 * additive glow planes, which keeps the canvas transparent.
 */
export default function HeroVial() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let W = mount.clientWidth || 600;
    let H = mount.clientHeight || 700;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(28, W / H, 0.1, 100);
    camera.position.set(0, 0.2, 5.5);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(W, H);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    const canvas = renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    mount.appendChild(canvas);

    // ── Environment (reflections for the glass) ──────────────
    const pmrem = new THREE.PMREMGenerator(renderer);
    let envRT: THREE.WebGLRenderTarget | null = null;
    try {
      const roomEnv = new RoomEnvironment();
      envRT = pmrem.fromScene(roomEnv, 0.04);
      scene.environment = envRT.texture;
      roomEnv.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
    } catch {
      /* env unavailable — glass still renders, just flatter */
    }

    // ── Lighting ─────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));

    const key = new THREE.DirectionalLight(0xffffff, 2.5);
    key.position.set(3, 4, 5);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xe8f4ff, 1.2);
    fill.position.set(-3, 2, 3);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xff3040, 0.8);
    rim.position.set(-2, -1, -3);
    scene.add(rim);

    const bounce = new THREE.PointLight(0xff1a2e, 0.5, 4);
    bounce.position.set(0, -1.5, 1);
    scene.add(bounce);

    // ── The vial ─────────────────────────────────────────────
    const vialGroup = new THREE.Group();
    scene.add(vialGroup);

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.12,
      roughness: 0.0,
      metalness: 0.0,
      transmission: 0.97,
      thickness: 0.4,
      ior: 1.52,
      reflectivity: 0.9,
      clearcoat: 1.0,
      clearcoatRoughness: 0.0,
      side: THREE.DoubleSide,
      envMapIntensity: 3.0,
    });

    const R = 0.18; // body radius
    // Body
    const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 1.1, 64, 1, true), glassMat);
    body.position.y = 0;
    vialGroup.add(body);
    // Bottom dome
    const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 32, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), glassMat);
    dome.position.y = -0.55;
    vialGroup.add(dome);
    // Shoulder taper
    const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.14, R, 0.12, 64, 1, true), glassMat);
    shoulder.position.y = 0.61;
    vialGroup.add(shoulder);
    // Neck
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 64, 1, true), glassMat);
    neck.position.y = 0.71;
    vialGroup.add(neck);
    // Cap
    const capMat = new THREE.MeshPhysicalMaterial({
      color: 0xc1121f,
      roughness: 0.55,
      metalness: 0.0,
      clearcoat: 0.3,
      clearcoatRoughness: 0.4,
      emissive: 0x3a0509,
      emissiveIntensity: 0.4,
    });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.18, 64), capMat);
    cap.position.y = 0.84;
    vialGroup.add(cap);

    // ── Label ────────────────────────────────────────────────
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 256;
    labelCanvas.height = 348;
    const lc = labelCanvas.getContext('2d')!;
    lc.fillStyle = '#ffffff';
    lc.fillRect(0, 0, 256, 348);
    lc.fillStyle = '#1a1a2e';
    lc.font = 'bold 34px Inter, Arial, sans-serif';
    lc.textAlign = 'center';
    lc.fillText('CYTOLAB', 128, 52);
    // red cross icon
    lc.fillStyle = '#C1121F';
    lc.fillRect(120, 70, 16, 40);
    lc.fillRect(108, 82, 40, 16);
    // specimen id + barcode
    lc.fillStyle = '#1a1a2e';
    lc.font = '15px Inter, Arial, sans-serif';
    lc.textAlign = 'left';
    lc.fillText('SPECIMEN ID: DM26-07-908', 22, 150);
    for (let i = 0; i < 30; i++) {
      const bw = 1 + (i % 3);
      lc.fillRect(22 + i * 7, 168, bw, 44);
    }
    lc.font = '13px Inter, Arial, sans-serif';
    lc.textAlign = 'center';
    lc.fillStyle = '#6b7280';
    lc.fillText('CYTOLOGY · PATHOLOGY', 128, 300);
    const labelTex = new THREE.CanvasTexture(labelCanvas);
    labelTex.anisotropy = 4;
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(0.28, 0.38),
      new THREE.MeshStandardMaterial({ map: labelTex, color: 0xffffff, roughness: 0.8 }),
    );
    label.position.set(0, 0.05, R + 0.001);
    vialGroup.add(label);

    // ── Blood ────────────────────────────────────────────────
    const fillFrac = 0.42;
    const bodyBottom = -0.55;
    const bloodH = 1.1 * fillFrac;
    const bloodTopY = bodyBottom + bloodH;

    const bloodMat = new THREE.MeshPhysicalMaterial({
      color: 0x8b0000,
      roughness: 0.05,
      metalness: 0.1,
      transmission: 0.2,
      thickness: 0.8,
      ior: 1.35,
      opacity: 0.92,
      transparent: true,
      emissive: 0x2a0000,
      emissiveIntensity: 0.35,
    });
    const bloodColumn = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.165, bloodH, 48), bloodMat);
    bloodColumn.position.y = bodyBottom + bloodH / 2;
    vialGroup.add(bloodColumn);
    // rounded bottom of blood to sit in the dome
    const bloodDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.165, 48, 24, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      bloodMat,
    );
    bloodDome.position.y = bodyBottom;
    vialGroup.add(bloodDome);

    // Blood surface with a gentle animated ripple
    const bloodSurfaceMat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        uniform float uTime;
        varying float vD;
        void main() {
          vec3 pos = position;
          float dist = length(pos.xy);
          vD = dist;
          pos.z += sin(dist * 8.0 - uTime * 2.0) * 0.004;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        varying float vD;
        void main() {
          vec3 deep = vec3(0.42, 0.02, 0.05);
          vec3 edge = vec3(0.62, 0.07, 0.10);
          vec3 col = mix(edge, deep, smoothstep(0.0, 0.165, vD));
          gl_FragColor = vec4(col, 0.95);
        }
      `,
    });
    const bloodSurface = new THREE.Mesh(new THREE.CircleGeometry(0.165, 64), bloodSurfaceMat);
    bloodSurface.rotation.x = -Math.PI / 2;
    bloodSurface.position.y = bloodTopY;
    vialGroup.add(bloodSurface);

    // ── Floating blood cells ─────────────────────────────────
    interface Cell {
      mesh: THREE.Mesh;
      baseX: number;
      baseY: number;
      orbitRadius: number;
      orbitSpeed: number;
      floatSpeed: number;
      floatAmplitude: number;
      rotationSpeed: number;
      phase: number;
    }
    const cells: Cell[] = [];
    const rbcGeo = new THREE.SphereGeometry(0.055, 16, 8);
    const wbcGeo = new THREE.SphereGeometry(0.045, 16, 12);
    const pltGeo = new THREE.SphereGeometry(0.015, 10, 8);

    const rnd = (a: number, b: number) => a + Math.random() * (b - a);

    function spawnCell(kind: 'rbc' | 'wbc' | 'plt') {
      let mat: THREE.MeshPhysicalMaterial;
      let mesh: THREE.Mesh;
      if (kind === 'rbc') {
        mat = new THREE.MeshPhysicalMaterial({
          color: 0xc1121f, roughness: 0.3, metalness: 0.0, transmission: 0.25,
          thickness: 0.1, opacity: 0.85, transparent: true, side: THREE.DoubleSide,
          emissive: 0x30060a, emissiveIntensity: 0.25,
        });
        mesh = new THREE.Mesh(rbcGeo, mat);
        mesh.scale.set(1, 1, 0.28); // biconcave disc
      } else if (kind === 'wbc') {
        mat = new THREE.MeshPhysicalMaterial({
          color: 0xf0e6ff, roughness: 0.4, metalness: 0.0, transmission: 0.4,
          thickness: 0.2, opacity: 0.7, transparent: true,
        });
        mesh = new THREE.Mesh(wbcGeo, mat);
      } else {
        mat = new THREE.MeshPhysicalMaterial({
          color: 0xffcccc, roughness: 0.5, metalness: 0.0, opacity: 0.6, transparent: true,
        });
        mesh = new THREE.Mesh(pltGeo, mat);
        mesh.scale.set(rnd(0.8, 1.2), rnd(0.8, 1.2), rnd(0.8, 1.2));
      }

      // Distribute in a shell around the vial
      const theta = Math.random() * Math.PI * 2;
      const radius = rnd(0.4, 1.8);
      const baseX = Math.cos(theta) * radius;
      const baseY = rnd(-0.9, 0.9);
      const z = rnd(-1.0, 0.8);
      mesh.position.set(baseX, baseY, z);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

      // Depth-based opacity
      if (z < -0.3) mat.opacity = 0.3;
      else if (z > 0.2) mat.opacity = Math.min(mat.opacity + 0.05, 0.9);

      scene.add(mesh);
      cells.push({
        mesh,
        baseX,
        baseY,
        orbitRadius: radius,
        orbitSpeed: rnd(0.08, 0.3),
        floatSpeed: rnd(0.3, 0.8),
        floatAmplitude: rnd(0.04, 0.12),
        rotationSpeed: rnd(0.001, 0.004),
        phase: Math.random() * Math.PI * 2,
      });
    }
    for (let i = 0; i < 35; i++) spawnCell('rbc');
    for (let i = 0; i < 4; i++) spawnCell('wbc');
    for (let i = 0; i < 8; i++) spawnCell('plt');

    // ── Liquid ripple below the tube ─────────────────────────
    interface Ripple { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; t: number; speed: number }
    const ripples: Ripple[] = [];
    const ringDefs: [number, number, number, number][] = [
      [0.15, 0.17, 0.0, 0.012],
      [0.25, 0.27, 0.33, 0.008],
      [0.38, 0.4, 0.66, 0.006],
    ];
    for (const [inner, outer, start, speed] of ringDefs) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xe63946, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 64), mat);
      mesh.rotation.x = -Math.PI * 0.5;
      mesh.position.y = -0.85;
      vialGroup.add(mesh);
      ripples.push({ mesh, mat, t: start, speed });
    }
    // Soft glow ellipse stack under the base
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Mesh(
        new THREE.PlaneGeometry(0.6 - i * 0.12, 0.14 - i * 0.03),
        new THREE.MeshBasicMaterial({ color: 0xe63946, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      g.rotation.x = -Math.PI * 0.5;
      g.position.y = -0.86;
      vialGroup.add(g);
    }

    // ── Background particles ─────────────────────────────────
    const pCount = 200;
    const pPos = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      pPos[i * 3] = rnd(-3, 3);
      pPos[i * 3 + 1] = rnd(-4, 4);
      pPos[i * 3 + 2] = rnd(-2, 0);
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const particles = new THREE.Points(
      pGeo,
      new THREE.PointsMaterial({ color: 0xcccccc, size: 0.008, transparent: true, opacity: 0.4, depthWrite: false }),
    );
    scene.add(particles);

    // ── Animation loop ───────────────────────────────────────
    const clock = new THREE.Clock();
    let raf = 0;
    const tilt = (18 * Math.PI) / 180;

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      vialGroup.rotation.y += 0.004;
      vialGroup.rotation.z = tilt;
      vialGroup.position.y = Math.sin(t * 0.5) * 0.06;
      vialGroup.position.x = Math.sin(t * 0.3) * 0.02;

      // subtle slosh inertia on the blood
      const slosh = Math.sin(t * 0.9) * 0.012;
      bloodColumn.position.x = slosh;
      bloodSurface.position.x = slosh;
      bloodDome.position.x = slosh;
      bloodSurfaceMat.uniforms.uTime.value = t;

      camera.position.z = 5.5 - Math.sin(t * 0.1) * 0.15;
      camera.lookAt(0, 0, 0);

      for (const c of cells) {
        c.mesh.position.x = c.baseX + Math.cos(t * c.orbitSpeed + c.phase) * (c.orbitRadius * 0.08);
        c.mesh.position.y = c.baseY + Math.sin(t * c.floatSpeed + c.phase) * c.floatAmplitude;
        c.mesh.rotation.x += c.rotationSpeed;
        c.mesh.rotation.z += c.rotationSpeed * 0.7;
      }

      for (const r of ripples) {
        r.t = (r.t + r.speed) % 1.0;
        r.mesh.scale.setScalar(0.8 + r.t * 1.4);
        r.mat.opacity = (1 - r.t) * 0.4;
      }

      const pa = pGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pCount; i++) {
        let y = pa.getY(i) + 0.0025;
        if (y > 4) y = -4;
        pa.setY(i, y);
      }
      pa.needsUpdate = true;

      renderer.render(scene, camera);
    };
    animate();

    // ── Resize ───────────────────────────────────────────────
    const onResize = () => {
      W = mount.clientWidth || W;
      H = mount.clientHeight || H;
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      renderer.setSize(W, H);
    };
    window.addEventListener('resize', onResize);

    // ── Cleanup ──────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else if (m) m.dispose();
      });
      labelTex.dispose();
      envRT?.dispose();
      pmrem.dispose();
      renderer.dispose();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }, []);

  return <div ref={mountRef} style={{ width: '600px', height: '700px', position: 'relative' }} />;
}
