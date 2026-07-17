'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * Living biological microscopy scene for the CTA right side. Raw Three.js on a
 * transparent canvas (matches HeroVial): a large translucent WBC centerpiece, red
 * blood cells across three depth layers (opacity/scale/segments fake depth-of-
 * field), AI "data" particles traveling between cells, ambient plasma drift, a
 * volumetric fog plane, breathing red lights, and mouse parallax.
 */
export default function CtaBioScene() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let width = mount.clientWidth || 1;
    let height = mount.clientHeight || 1;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.z = 4.0;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.4;
    mount.appendChild(renderer.domElement);

    const disposables: { dispose(): void }[] = [];
    const track = <T extends { dispose(): void }>(o: T): T => { disposables.push(o); return o; };

    const CENTER_X = 0.3;

    // ── Centerpiece WBC ──
    const wbc = new THREE.Group();
    wbc.position.set(CENTER_X, 0, 0);

    const outer = new THREE.Mesh(
      track(new THREE.SphereGeometry(0.9, 64, 64)),
      track(new THREE.MeshPhysicalMaterial({ color: 0xffd6e8, transparent: true, opacity: 0.18, transmission: 0.85, thickness: 0.3, roughness: 0.0, ior: 1.38, clearcoat: 1.0, clearcoatRoughness: 0.0, side: THREE.DoubleSide })),
    );
    const inner = new THREE.Mesh(
      track(new THREE.SphereGeometry(0.78, 64, 64)),
      track(new THREE.MeshPhysicalMaterial({ color: 0xff8faa, transparent: true, opacity: 0.1, transmission: 0.9, roughness: 0.0, side: THREE.DoubleSide })),
    );
    const nucleus = new THREE.Mesh(
      track(new THREE.SphereGeometry(0.32, 32, 32)),
      track(new THREE.MeshPhysicalMaterial({ color: 0x8b1a4a, transparent: true, opacity: 0.75, transmission: 0.25, roughness: 0.15, emissive: 0x3d0018, emissiveIntensity: 0.4 })),
    );
    nucleus.position.set(0.08, 0.05, 0.0);
    const nucleusGlow = new THREE.Mesh(
      track(new THREE.SphereGeometry(0.18, 16, 16)),
      track(new THREE.MeshBasicMaterial({ color: 0xff2055, transparent: true, opacity: 0.3 })),
    );
    nucleusGlow.position.copy(nucleus.position);
    wbc.add(outer, inner, nucleus, nucleusGlow);
    scene.add(wbc);

    // ── Red blood cells across three depth layers ──
    interface Cell {
      mesh: THREE.Mesh;
      orbitAngle: number; orbitRadius: number; orbitSpeed: number;
      orbitTiltX: number; orbitTiltY: number;
      floatPhase: number; floatAmp: number; floatSpeed: number;
      rotSelf: number; baseZ: number;
    }
    const cells: Cell[] = [];
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);

    const makeLayer = (count: number, zMin: number, zMax: number, sizeMin: number, sizeMax: number, opacity: number, color: number, segW: number, segH: number) => {
      const geo = track(new THREE.SphereGeometry(1, segW, segH));
      for (let i = 0; i < count; i++) {
        const size = rnd(sizeMin, sizeMax);
        const mat = track(new THREE.MeshPhysicalMaterial({ color, transparent: true, roughness: 0.2, metalness: 0.0, transmission: 0.3, thickness: 0.06, opacity, side: THREE.DoubleSide }));
        const mesh = new THREE.Mesh(geo, mat);
        mesh.scale.set(size, size, size * 0.3); // biconcave disc
        const baseZ = rnd(zMin, zMax);
        mesh.position.z = baseZ;
        scene.add(mesh);
        cells.push({
          mesh,
          orbitAngle: rnd(0, Math.PI * 2),
          orbitRadius: rnd(0.6, 2.2),
          orbitSpeed: rnd(0.002, 0.006),
          orbitTiltX: rnd(0.3, 1.2),
          orbitTiltY: rnd(0.3, 1.4),
          floatPhase: rnd(0, Math.PI * 2),
          floatAmp: rnd(0.04, 0.1),
          floatSpeed: rnd(0.2, 0.5),
          rotSelf: rnd(0.003, 0.008),
          baseZ,
        });
      }
    };
    // foreground / midground / background (DOF via opacity + scale + segment count)
    makeLayer(4, 0.8, 1.4, 0.12, 0.16, 0.9, 0xd4213d, 32, 16);
    makeLayer(7, -0.2, 0.3, 0.09, 0.12, 0.75, 0xd4213d, 24, 12);
    makeLayer(6, -1.2, -0.6, 0.06, 0.09, 0.45, 0xc45070, 12, 8);

    // ── AI data particles (travel between cells) ──
    const AI_N = 60;
    const aiPos = new Float32Array(AI_N * 3);
    interface AiP { start: THREE.Vector3; end: THREE.Vector3; progress: number; speed: number; amp: number; }
    const aiParts: AiP[] = [];
    const randCellPoint = () => {
      const c = cells[Math.floor(Math.random() * cells.length)];
      return new THREE.Vector3().copy(c.mesh.position);
    };
    for (let i = 0; i < AI_N; i++) {
      aiParts.push({ start: randCellPoint(), end: randCellPoint(), progress: Math.random(), speed: rnd(0.003, 0.008), amp: rnd(0.06, 0.16) });
    }
    const aiGeo = track(new THREE.BufferGeometry());
    aiGeo.setAttribute('position', new THREE.BufferAttribute(aiPos, 3));
    const aiPoints = new THREE.Points(aiGeo, track(new THREE.PointsMaterial({ color: 0xff6b8a, size: 0.018, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })));
    scene.add(aiPoints);
    const tmpDir = new THREE.Vector3();
    const tmpPerp = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    // ── Ambient plasma particles ──
    const PL_N = 120;
    const plPos = new Float32Array(PL_N * 3);
    for (let i = 0; i < PL_N; i++) {
      plPos[i * 3] = rnd(-3.5, 3.5);
      plPos[i * 3 + 1] = rnd(-3, 3);
      plPos[i * 3 + 2] = rnd(-2, 1.2);
    }
    const plGeo = track(new THREE.BufferGeometry());
    plGeo.setAttribute('position', new THREE.BufferAttribute(plPos, 3));
    const plasma = new THREE.Points(plGeo, track(new THREE.PointsMaterial({ color: 0xffffff, size: 0.004, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false })));
    scene.add(plasma);

    // ── Volumetric fog plane ──
    const fogMat = track(new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform float uTime; varying vec2 vUv;
        void main(){
          vec2 c = vec2(0.5 + sin(uTime*0.1)*0.12, 0.5 + cos(uTime*0.08)*0.1);
          float d = distance(vUv, c);
          float a = smoothstep(0.55, 0.0, d) * 0.15;
          gl_FragColor = vec4(0.784, 0.078, 0.235, a);
        }`,
    }));
    const fog = new THREE.Mesh(track(new THREE.PlaneGeometry(8, 6)), fogMat);
    fog.position.z = -1.5;
    scene.add(fog);

    // ── Lighting ──
    scene.add(new THREE.AmbientLight(0xff4060, 0.6));
    const key = new THREE.PointLight(0xff2040, 2.0, 6); key.position.set(1.5, 1.0, 2.0); scene.add(key);
    const fill = new THREE.PointLight(0xff80a0, 0.8, 4); fill.position.set(-1.5, -0.5, 1.0); scene.add(fill);
    const top = new THREE.PointLight(0xffffff, 0.6, 3); top.position.set(0, 2, 1); scene.add(top);
    const bottom = new THREE.PointLight(0xff1040, 1.2, 5); bottom.position.set(0, -2, 0.5); scene.add(bottom);

    // ── Mouse parallax ──
    let targetX = 0, targetY = 0;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let inView = false;
    let pageVisible = document.visibilityState === 'visible';
    const onMove = (e: MouseEvent) => {
      const r = mount.getBoundingClientRect();
      targetX = ((e.clientX - r.left) / r.width - 0.5) * 0.3;
      targetY = ((e.clientY - r.top) / r.height - 0.5) * 0.2;
    };
    window.addEventListener('mousemove', onMove);

    // ── Animate ──
    const clock = new THREE.Clock();
    let raf = 0;
    const animate = () => {
      if (!inView || !pageVisible || reduce) {
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      // Centerpiece
      const pulse = 1.0 + Math.sin(t * 0.8) * 0.03;
      wbc.scale.setScalar(pulse);
      wbc.rotation.y += 0.003;
      wbc.rotation.x += 0.001;
      nucleus.rotation.y -= 0.002;

      // RBCs
      for (const c of cells) {
        c.orbitAngle += c.orbitSpeed;
        c.mesh.position.x = Math.cos(c.orbitAngle) * c.orbitRadius + CENTER_X;
        c.mesh.position.y = Math.sin(c.orbitAngle * c.orbitTiltY) * c.orbitRadius * 0.4 + Math.sin(t * c.floatSpeed + c.floatPhase) * c.floatAmp;
        c.mesh.position.z = c.baseZ;
        c.mesh.rotation.z += c.rotSelf;
      }

      // AI data particles
      for (let i = 0; i < AI_N; i++) {
        const p = aiParts[i];
        p.progress += p.speed;
        if (p.progress > 1) { p.progress = 0; p.start.copy(p.end); p.end.copy(randCellPoint()); }
        tmpDir.subVectors(p.end, p.start);
        const len = tmpDir.length() || 1;
        tmpDir.divideScalar(len);
        tmpPerp.crossVectors(tmpDir, up).normalize();
        const wobble = Math.sin(p.progress * Math.PI) * p.amp;
        aiPos[i * 3] = p.start.x + (p.end.x - p.start.x) * p.progress + tmpPerp.x * wobble;
        aiPos[i * 3 + 1] = p.start.y + (p.end.y - p.start.y) * p.progress + tmpPerp.y * wobble;
        aiPos[i * 3 + 2] = p.start.z + (p.end.z - p.start.z) * p.progress + tmpPerp.z * wobble;
      }
      aiGeo.attributes.position.needsUpdate = true;

      // Plasma drift
      for (let i = 0; i < PL_N; i++) {
        plPos[i * 3 + 1] += 0.0005;
        if (plPos[i * 3 + 1] > 3) { plPos[i * 3 + 1] = -3; plPos[i * 3] = rnd(-3.5, 3.5); plPos[i * 3 + 2] = rnd(-2, 1.2); }
      }
      plGeo.attributes.position.needsUpdate = true;

      // Fog + breathing lights
      fogMat.uniforms.uTime.value = t;
      key.position.x = 1.5 + Math.sin(t * 0.4) * 0.5;
      key.intensity = 1.8 + Math.sin(t * 0.7) * 0.3;
      fill.intensity = 0.7 + Math.sin(t * 0.5 + 1.0) * 0.2;

      // Parallax
      if (!reduce) {
        scene.rotation.y += (targetX - scene.rotation.y) * 0.04;
        scene.rotation.x += (-targetY - scene.rotation.x) * 0.04;
      }

      renderer.render(scene, camera);
    };

    const start = () => {
      if (!raf && inView && pageVisible && !reduce) {
        clock.start();
        raf = requestAnimationFrame(animate);
      }
    };
    const stop = () => {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      clock.stop();
    };

    const io = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      if (inView) start();
      else stop();
    }, { rootMargin: '240px 0px', threshold: 0.01 });
    io.observe(mount);

    const onVisibility = () => {
      pageVisible = document.visibilityState === 'visible';
      if (pageVisible) start();
      else stop();
    };
    document.addEventListener('visibilitychange', onVisibility);
    renderer.render(scene, camera);

    // ── Resize ──
    const onResize = () => {
      if (!mount) return;
      width = mount.clientWidth || 1;
      height = mount.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('resize', onResize);
      ro.disconnect();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />;
}
