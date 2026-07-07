'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';

/**
 * Hero product render matching the reference: a tall, thin, near-vertical blood
 * specimen test-tube dipping into a rippling water pool, on soft white with a
 * subtle red radial glow behind it. Real glass (transmission + Fresnel), a
 * ridged red screw cap, a white CYTOLAB label (logo + barcode), volumetric
 * crimson blood with a concave meniscus + bubbles, an orbital field of biconcave
 * RBCs and translucent purple-nucleus WBCs (depth-faded/scaled for a DOF feel),
 * concentric glossy ripple rings, soft pink bokeh, and interactive mouse
 * parallax.
 *
 * Rendered on a TRANSPARENT canvas — no post-FX bloom/DOF (they wash a bright
 * white scene to haze); glow is faked with emissive/additive and depth with
 * per-cell opacity/scale, keeping the subject crisp.
 */
export default function HeroVial() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let W = mount.clientWidth || 600;
    let H = mount.clientHeight || 700;
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(W, H);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    mount.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, W / H, 0.1, 100);
    camera.position.set(0, 0.12, 5.0);
    camera.lookAt(0.85, 0.1, 0);

    // Environment for glass reflections
    const pmrem = new THREE.PMREMGenerator(renderer);
    let envRT: THREE.WebGLRenderTarget | null = null;
    try {
      const roomEnv = new RoomEnvironment();
      envRT = pmrem.fromScene(roomEnv, 0.04);
      scene.environment = envRT.texture;
      roomEnv.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
    } catch {
      /* flatter glass, still fine */
    }

    // ── Red radial glow behind the tube ──────────────────────
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowCanvas.height = 256;
    const gx = glowCanvas.getContext('2d')!;
    const gg = gx.createRadialGradient(128, 128, 10, 128, 128, 128);
    gg.addColorStop(0, 'rgba(230,57,70,0.5)');
    gg.addColorStop(0.5, 'rgba(230,57,70,0.14)');
    gg.addColorStop(1, 'rgba(230,57,70,0)');
    gx.fillStyle = gg;
    gx.fillRect(0, 0, 256, 256);
    const glowTex = new THREE.CanvasTexture(glowCanvas);
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 4.2),
      new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0.5, depthWrite: false }),
    );
    glow.position.set(0.1, 0.05, -1.8);
    scene.add(glow);

    // ── Softbox lighting rig ─────────────────────────────────
    RectAreaLightUniformsLib.init();
    scene.add(new THREE.AmbientLight(0xfff5f5, 0.5));
    const softbox = new THREE.RectAreaLight(0xffffff, 4.0, 5, 6);
    softbox.position.set(0.6, 4, 3);
    softbox.lookAt(0, 0, 0);
    scene.add(softbox);
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(3.5, 4.5, 4);
    scene.add(key);
    const coolFill = new THREE.DirectionalLight(0xe8f0ff, 1.1);
    coolFill.position.set(-4, 1.5, 3);
    scene.add(coolFill);
    const warmRim = new THREE.DirectionalLight(0xff2040, 1.7);
    warmRim.position.set(3.5, 0.4, -2.6);
    scene.add(warmRim);
    const underGlow = new THREE.PointLight(0xff1a2e, 0.6, 6);
    underGlow.position.set(0, -1.5, 1.2);
    scene.add(underGlow);
    const topAccent = new THREE.PointLight(0xffffff, 0.8, 4);
    topAccent.position.set(0, 2, 2);
    scene.add(topAccent);

    // ── Tube geometry (tall + thin) ──────────────────────────
    const R = 0.135;
    const bodyH = 2.35;
    const bodyTop = bodyH / 2;
    const bodyBottom = -bodyH / 2;
    const waterY = -1.12;

    const vialGroup = new THREE.Group();
    scene.add(vialGroup);

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, metalness: 0, roughness: 0.04, transmission: 0.94, thickness: 0.45, ior: 1.5,
      reflectivity: 0.92, clearcoat: 1.0, clearcoatRoughness: 0.03, iridescence: 0.12, iridescenceIOR: 1.3,
      envMapIntensity: 2.6, transparent: true, opacity: 0.14, side: THREE.DoubleSide,
      attenuationColor: new THREE.Color(0xeef4ff), attenuationDistance: 3.0,
    });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, bodyH, 96, 1, true), glassMat);
    vialGroup.add(body);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 48, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), glassMat);
    dome.position.y = bodyBottom;
    vialGroup.add(dome);
    const rimRing = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.012, R + 0.012, 0.06, 96, 1, true), glassMat);
    rimRing.position.y = bodyTop + 0.02;
    vialGroup.add(rimRing);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(R + 0.012, 0.012, 16, 64), glassMat);
    lip.rotation.x = Math.PI / 2;
    lip.position.y = bodyTop + 0.05;
    vialGroup.add(lip);

    // Ridged screw cap
    const capMat = new THREE.MeshPhysicalMaterial({
      color: 0xbf0d23, roughness: 0.45, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.25,
      sheen: 0.4, sheenColor: new THREE.Color(0xff5a63), emissive: 0x24040a, emissiveIntensity: 0.25,
    });
    const capGroup = new THREE.Group();
    const capBody = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.028, R + 0.028, 0.4, 64), capMat);
    capGroup.add(capBody);
    const capTop = new THREE.Mesh(new THREE.SphereGeometry(R + 0.028, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
    capTop.position.y = 0.2;
    capTop.scale.y = 0.45;
    capGroup.add(capTop);
    for (let i = 0; i < 7; i++) {
      const ridge = new THREE.Mesh(new THREE.TorusGeometry(R + 0.03, 0.008, 10, 48), capMat);
      ridge.rotation.x = Math.PI / 2;
      ridge.position.y = -0.16 + i * 0.052;
      capGroup.add(ridge);
    }
    capGroup.position.y = bodyTop + 0.24;
    vialGroup.add(capGroup);

    // ── Label (CYTOLAB + flower logo + barcode) ──────────────
    const lcv = document.createElement('canvas');
    lcv.width = 512;
    lcv.height = 256;
    const lctx = lcv.getContext('2d')!;
    lctx.fillStyle = '#ffffff';
    lctx.fillRect(0, 0, 512, 256);
    lctx.save();
    lctx.translate(256, 128);
    lctx.rotate(-Math.PI / 2); // reads bottom→top on the tube
    lctx.fillStyle = '#BF0D23';
    lctx.fillRect(-118, -108, 236, 6);
    lctx.fillStyle = '#15151f';
    lctx.font = 'bold 58px Inter, Arial, sans-serif';
    lctx.textAlign = 'center';
    lctx.textBaseline = 'middle';
    lctx.fillText('CYTOLAB', 0, -60);
    lctx.fillStyle = '#BF0D23';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      lctx.beginPath();
      lctx.arc(Math.cos(a) * 18, -14 + Math.sin(a) * 18, 8, 0, Math.PI * 2);
      lctx.fill();
    }
    lctx.beginPath();
    lctx.arc(0, -14, 9, 0, Math.PI * 2);
    lctx.fill();
    lctx.fillStyle = '#666';
    lctx.font = '18px Inter, Arial, sans-serif';
    lctx.fillText('SPECIMEN ID: CYT-2026-0047', 0, 26);
    lctx.fillStyle = '#15151f';
    for (let i = 0; i < 34; i++) lctx.fillRect(-110 + i * 6.4, 48, i % 5 === 0 ? 3 : 1.5, 40);
    lctx.restore();
    const labelTex = new THREE.CanvasTexture(lcv);
    labelTex.anisotropy = 8;
    labelTex.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(R + 0.004, R + 0.004, 1.4, 96, 1, true, -1.15, 2.3),
      new THREE.MeshStandardMaterial({ map: labelTex, color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide }),
    );
    label.position.y = -0.02;
    vialGroup.add(label);

    // ── Volumetric blood (lower 42%) + concave meniscus ──────
    const fillFrac = 0.42;
    const bloodH = bodyH * fillFrac;
    const bloodTopY = bodyBottom + bloodH;
    const bloodMat = new THREE.MeshPhysicalMaterial({
      color: 0x7a000e, metalness: 0.12, roughness: 0.12, transmission: 0.1, thickness: 1.1, ior: 1.38,
      attenuationColor: new THREE.Color(0x4a0006), attenuationDistance: 0.4,
      sheen: 0.5, sheenColor: new THREE.Color(0xb51a2a), sheenRoughness: 0.4,
      emissive: 0x33000a, emissiveIntensity: 0.5, transparent: true, opacity: 0.99,
    });
    const bloodColumn = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.012, R - 0.012, bloodH, 64), bloodMat);
    bloodColumn.position.y = bodyBottom + bloodH / 2;
    vialGroup.add(bloodColumn);
    const bloodDome = new THREE.Mesh(
      new THREE.SphereGeometry(R - 0.012, 64, 32, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      bloodMat,
    );
    bloodDome.position.y = bodyBottom;
    vialGroup.add(bloodDome);

    const surfMat = new THREE.ShaderMaterial({
      transparent: true, side: THREE.DoubleSide, uniforms: { uTime: { value: 0 } },
      vertexShader: `
        uniform float uTime; varying float vR; varying vec3 vN;
        void main(){
          vec3 p = position; float r = length(p.xy); vR = r;
          p.z += (0.014 - r * r * 1.4) + sin(r * 30.0 - uTime * 2.2) * 0.0016;
          vN = normalize(vec3(-p.x, -p.y, 1.4));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        varying float vR; varying vec3 vN;
        void main(){
          vec3 col = mix(vec3(0.62,0.06,0.11), vec3(0.34,0.01,0.05), smoothstep(0.0,0.123,vR));
          col += pow(1.0 - abs(vN.z), 2.0) * vec3(0.55,0.16,0.20);
          gl_FragColor = vec4(col, 0.97);
        }`,
    });
    const bloodSurface = new THREE.Mesh(new THREE.CircleGeometry(R - 0.012, 96), surfMat);
    bloodSurface.rotation.x = -Math.PI / 2;
    bloodSurface.position.y = bloodTopY;
    vialGroup.add(bloodSurface);

    interface Bubble { mesh: THREE.Mesh; speed: number; x: number }
    const bubbles: Bubble[] = [];
    const bubbleMat = new THREE.MeshPhysicalMaterial({ color: 0xff8890, roughness: 0.1, transmission: 0.6, thickness: 0.04, transparent: true, opacity: 0.5 });
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(rnd(0.005, 0.013), 10, 8), bubbleMat);
      const ang = Math.random() * Math.PI * 2, rad = rnd(0, 0.1);
      const x = Math.cos(ang) * rad;
      m.position.set(x, rnd(bodyBottom, bloodTopY), Math.sin(ang) * rad);
      vialGroup.add(m);
      bubbles.push({ mesh: m, speed: rnd(0.03, 0.09), x });
    }

    // ── Water pool: sheen + reflection + concentric rings ────
    const poolMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec2 vUv;
        void main(){
          float r = length((vUv - 0.5) * 2.0);
          if (r > 1.0) discard;
          gl_FragColor = vec4(vec3(0.97,0.92,0.94), (1.0 - r) * 0.06);
        }`,
    });
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 5.0), poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = waterY;
    scene.add(pool);
    const reflMat = new THREE.MeshBasicMaterial({ color: 0xd23a48, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false });
    const refl = new THREE.Mesh(new THREE.CircleGeometry(0.32, 32), reflMat);
    refl.rotation.x = -Math.PI / 2;
    refl.position.y = waterY + 0.002;
    scene.add(refl);

    interface Ring { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; offset: number }
    const rings: Ring[] = [];
    [0.18, 0.32, 0.5, 0.7, 0.92].forEach((rr, i) => {
      const mat = new THREE.MeshBasicMaterial({ color: 0xe63946, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.RingGeometry(rr - 0.01, rr + 0.01, 128), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = waterY + 0.004;
      scene.add(mesh);
      rings.push({ mesh, mat, offset: i * 0.2 });
    });

    // ── Orbital cells (biconcave RBC + purple-nucleus WBC) ───
    interface Cell {
      obj: THREE.Object3D; mat?: THREE.MeshPhysicalMaterial; baseOpacity: number; baseScale: number;
      a: number; b: number; incl: number; yaw0: number; precess: number;
      phase: number; speed: number; bob: number; bobSpeed: number; spin: THREE.Vector3;
    }
    const cells: Cell[] = [];
    const rbcGeo = new THREE.SphereGeometry(1, 24, 14);
    const orbitParams = (rad: number) => ({
      a: rad, b: rad * rnd(0.55, 0.9), incl: rnd(-0.5, 0.5), yaw0: Math.random() * Math.PI * 2,
      precess: rnd(-0.02, 0.02), phase: Math.random() * Math.PI * 2,
      speed: rnd(0.03, 0.1) * (Math.random() < 0.5 ? 1 : -1),
      bob: rnd(0.05, 0.25), bobSpeed: rnd(0.15, 0.5),
      spin: new THREE.Vector3(rnd(0.002, 0.006), rnd(0.002, 0.006), rnd(0.001, 0.004)),
    });

    for (let i = 0; i < 30; i++) {
      const rad = rnd(0.5, 1.75);
      const mat = new THREE.MeshPhysicalMaterial({
        color: 0xc1121f, roughness: 0.26, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.3,
        sheen: 0.5, sheenColor: new THREE.Color(0xff5a66), emissive: 0x3a040a, emissiveIntensity: 0.3,
        transmission: 0.28, thickness: 0.08, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
      });
      const disc = new THREE.Mesh(rbcGeo, mat);
      const s = rnd(0.05, 0.085);
      disc.scale.set(s, s, s * 0.32);
      disc.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      scene.add(disc);
      cells.push({ obj: disc, mat, baseOpacity: 0.9, baseScale: s, ...orbitParams(rad) });
    }

    const membraneMat = new THREE.MeshPhysicalMaterial({
      color: 0xd4b8ff, roughness: 0.0, metalness: 0, transmission: 0.7, thickness: 0.15, ior: 1.36,
      transparent: true, opacity: 0.5, sheen: 0.6, sheenColor: new THREE.Color(0xe8dcff), envMapIntensity: 2,
    });
    const nucleusMat = new THREE.MeshPhysicalMaterial({
      color: 0x6b3fa0, roughness: 0.5, metalness: 0, clearcoat: 0.2, transmission: 0.2, transparent: true, opacity: 0.85,
      emissive: 0x241046, emissiveIntensity: 0.3,
    });
    const shellMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, roughness: 0.02, metalness: 0, transmission: 0.96, thickness: 0.2, ior: 1.42,
      clearcoat: 1, transparent: true, opacity: 0.2, side: THREE.DoubleSide, envMapIntensity: 2,
    });
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group();
      const size = rnd(0.1, 0.16);
      g.add(new THREE.Mesh(new THREE.SphereGeometry(size, 24, 18), membraneMat));
      for (let k = 0; k < 4; k++) {
        const lobe = new THREE.Mesh(new THREE.SphereGeometry(size * rnd(0.44, 0.62), 14, 10), nucleusMat);
        lobe.position.set(rnd(-0.4, 0.4) * size, rnd(-0.4, 0.4) * size, rnd(-0.4, 0.4) * size);
        g.add(lobe);
      }
      if (i < 3) g.add(new THREE.Mesh(new THREE.SphereGeometry(size * 1.45, 28, 20), shellMat));
      scene.add(g);
      const rad = rnd(0.55, 1.6);
      cells.push({ obj: g, baseOpacity: 1, baseScale: 1, ...orbitParams(rad), speed: rnd(0.02, 0.05) * (Math.random() < 0.5 ? 1 : -1) });
    }

    // ── Soft pink bokeh particles ────────────────────────────
    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = 64;
    const spx = sprite.getContext('2d')!;
    const spg = spx.createRadialGradient(32, 32, 0, 32, 32, 32);
    spg.addColorStop(0, 'rgba(255,255,255,0.9)');
    spg.addColorStop(0.4, 'rgba(255,220,226,0.5)');
    spg.addColorStop(1, 'rgba(255,220,226,0)');
    spx.fillStyle = spg;
    spx.fillRect(0, 0, 64, 64);
    const spriteTex = new THREE.CanvasTexture(sprite);
    const pCount = 100;
    const pPos = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      pPos[i * 3] = rnd(-3, 3); pPos[i * 3 + 1] = rnd(-2.5, 3.5); pPos[i * 3 + 2] = rnd(-2.4, -0.6);
    }
    const bgGeo = new THREE.BufferGeometry();
    bgGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const bgParticles = new THREE.Points(bgGeo, new THREE.PointsMaterial({
      map: spriteTex, size: 0.3, transparent: true, opacity: 0.5, depthWrite: false, sizeAttenuation: true,
    }));
    scene.add(bgParticles);

    // ── Mouse parallax ───────────────────────────────────────
    let mouseX = 0, mouseY = 0, rotX = 0, rotY = 0;
    const onMouse = (e: MouseEvent) => {
      mouseX = (e.clientX / window.innerWidth) * 2 - 1;
      mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener('mousemove', onMouse, { passive: true });

    // ── Animation ────────────────────────────────────────────
    const clock = new THREE.Clock();
    let raf = 0;
    const tilt = (-8 * Math.PI) / 180;
    let sloshVel = 0, lastRotY = 0;

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      vialGroup.rotation.y += 0.0032;
      rotX += (mouseY * 0.1 - rotX) * 0.05;
      rotY += (mouseX * 0.14 - rotY) * 0.05;
      vialGroup.rotation.x = rotX;
      vialGroup.rotation.z = tilt + rotY * 0.5 + Math.sin(t * 0.4) * 0.008;
      vialGroup.position.y = Math.sin(t * 0.5) * 0.045;
      vialGroup.position.x = Math.sin(t * 0.28) * 0.012;

      const dRot = vialGroup.rotation.y - lastRotY;
      lastRotY = vialGroup.rotation.y;
      sloshVel += (dRot * 6 - sloshVel) * 0.04;
      const slosh = Math.sin(t * 0.9) * 0.008 + sloshVel;
      bloodColumn.position.x = slosh;
      bloodDome.position.x = slosh;
      bloodSurface.position.x = slosh;
      bloodSurface.rotation.z = sloshVel * 2;
      surfMat.uniforms.uTime.value = t;

      for (const bub of bubbles) {
        bub.mesh.position.y += bub.speed * 0.01;
        bub.mesh.position.x = bub.x + slosh;
        if (bub.mesh.position.y > bloodTopY - 0.008) bub.mesh.position.y = bodyBottom + 0.02;
      }

      for (const c of cells) {
        const ang = c.phase + t * c.speed;
        const yaw = c.yaw0 + t * c.precess;
        const lx = Math.cos(ang) * c.a;
        const lz = Math.sin(ang) * c.b;
        const ly = Math.sin(t * c.bobSpeed + c.phase) * c.bob;
        const cy1 = ly * Math.cos(c.incl) - lz * Math.sin(c.incl);
        const cz1 = ly * Math.sin(c.incl) + lz * Math.cos(c.incl);
        const pz = -lx * Math.sin(yaw) + cz1 * Math.cos(yaw);
        c.obj.position.set(lx * Math.cos(yaw) + cz1 * Math.sin(yaw), cy1 + 0.1, pz);
        c.obj.rotation.x += c.spin.x;
        c.obj.rotation.y += c.spin.y;
        c.obj.rotation.z += c.spin.z;
        if (c.mat) {
          const depth = Math.max(0, Math.min(1, (pz + 1.2) / 2.0));
          c.mat.opacity = c.baseOpacity * (0.35 + depth * 0.65);
          const ds = c.baseScale * (0.75 + depth * 0.4);
          c.obj.scale.set(ds, ds, c.baseScale * 0.32);
        }
      }

      poolMat.uniforms.uTime.value = t;
      reflMat.opacity = 0.14 + Math.sin(t * 1.1) * 0.04;
      for (const r of rings) {
        const phase = (t * 0.55 + r.offset) % 1.0;
        r.mesh.scale.setScalar(0.6 + phase * 1.4);
        r.mat.opacity = (1 - phase) * 0.34;
      }

      const bp = bgGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pCount; i++) {
        let y = bp.getY(i) + 0.0012;
        if (y > 3.5) y = -2.5;
        bp.setY(i, y);
      }
      bp.needsUpdate = true;

      camera.position.z = 5.0 - Math.sin(t * 0.08) * 0.15;
      camera.position.x += (mouseX * 0.1 - camera.position.x) * 0.03;
      camera.position.y += (0.12 + mouseY * 0.06 - camera.position.y) * 0.03;
      camera.lookAt(0.85, 0.1, 0);

      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      W = mount.clientWidth || W;
      H = mount.clientHeight || H;
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      renderer.setSize(W, H);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMouse);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else if (mat) mat.dispose();
      });
      labelTex.dispose();
      spriteTex.dispose();
      glowTex.dispose();
      envRT?.dispose();
      pmrem.dispose();
      renderer.dispose();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }, []);

  return <div ref={mountRef} style={{ width: '100%', height: '100%', position: 'relative' }} />;
}
