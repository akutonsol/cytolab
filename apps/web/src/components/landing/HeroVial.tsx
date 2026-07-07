'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';

/**
 * Hero product render: a large, dominant blood-specimen tube on soft white with
 * a red radial glow behind it. Real glass (transmission) showing the crimson
 * blood inside, a smooth red screw cap, a white CYTOLAB label, an orbital field
 * of biconcave RBCs, individually-scattered purple-nucleus WBCs, a glossy water
 * ripple beneath, soft pink bokeh, and interactive mouse parallax.
 *
 * Direct-render on a TRANSPARENT canvas (no post-FX — they wash the white scene).
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
    // NoToneMapping: ACES Filmic shifts bright saturated reds toward orange
    // (trips the zero-orange rule on the red cap + glossy cells). Keep reds true.
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    mount.appendChild(canvas);

    const scene = new THREE.Scene();
    // FIX 1 — telephoto framing so the full tube is large + dominant
    const camera = new THREE.PerspectiveCamera(22, W / H, 0.1, 100);
    camera.position.set(0, 0.05, 7.3);
    camera.lookAt(0.5, 0.05, 0);

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
      new THREE.PlaneGeometry(3.6, 4.6),
      new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    glow.position.set(0.15, 0.05, -1.8);
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
    // POLISH 7 — very faint purple ambient fill
    const purpleAmbient = new THREE.PointLight(0x8b5cf6, 0.22, 9);
    purpleAmbient.position.set(-1.8, 0.2, 1.2);
    scene.add(purpleAmbient);

    // ── Tube geometry ────────────────────────────────────────
    const R = 0.185; // glass inner radius (FIX 2)
    const bodyH = 1.1;
    const bodyTop = bodyH / 2; // +0.55
    const bodyBottom = -bodyH / 2; // -0.55
    const rippleY = -0.95; // pool sits below the hovering tube (FIX 5/6)

    const vialGroup = new THREE.Group();
    vialGroup.scale.setScalar(1.25); // POLISH 1 — make the vial the hero (~25% larger)
    scene.add(vialGroup);

    // FIX 2 — clear glass that reveals the blood inside
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xffffff),
      transparent: true,
      // spec asked for 0.04, but transmission glass at 0.04 is invisible over a
      // white bg (cap looks detached). 0.11 keeps the blood visible while the
      // glass cylinder reads as a cohesive tube.
      opacity: 0.11,
      roughness: 0.0,
      metalness: 0.0,
      transmission: 0.9,
      thickness: 0.55,
      ior: 1.52,
      reflectivity: 0.98,
      specularIntensity: 1.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
      envMapIntensity: 3.5,
    });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, bodyH, 96, 1, true), glassMat);
    body.renderOrder = 1;
    vialGroup.add(body);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 48, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), glassMat);
    dome.position.y = bodyBottom;
    dome.renderOrder = 1;
    vialGroup.add(dome);
    // shoulder taper → neck (cap seats on the neck)
    const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.15, R, 0.14, 96), glassMat);
    shoulder.position.y = bodyTop + 0.07;
    shoulder.renderOrder = 1;
    vialGroup.add(shoulder);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 96, 1, true), glassMat);
    neck.position.y = bodyTop + 0.19;
    neck.renderOrder = 1;
    vialGroup.add(neck);
    const neckTopY = bodyTop + 0.24;

    // FIX 3 — smooth red screw cap (no ridges), flush on the neck
    const capMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xb8000e),
      roughness: 0.4,
      metalness: 0.05,
      clearcoat: 0.8,
      clearcoatRoughness: 0.15,
      envMapIntensity: 2.0,
    });
    const capGroup = new THREE.Group();
    const capBody = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.2, 64, 1), capMat);
    capBody.position.y = 0.1;
    capGroup.add(capBody);
    const capDome = new THREE.Mesh(new THREE.SphereGeometry(0.16, 64, 32, 0, Math.PI * 2, 0, Math.PI * 0.5), capMat);
    capDome.position.y = 0.2;
    capGroup.add(capDome);
    capGroup.position.y = neckTopY; // cap bottom flush at neck top
    vialGroup.add(capGroup);
    const capTopY = neckTopY + 0.28;

    // ── Label (CYTOLAB + flower logo + barcode) ──────────────
    const lcv = document.createElement('canvas');
    lcv.width = 512;
    lcv.height = 256;
    const lctx = lcv.getContext('2d')!;
    lctx.fillStyle = '#ffffff';
    lctx.fillRect(0, 0, 512, 256);
    lctx.save();
    lctx.translate(256, 128);
    lctx.rotate(-Math.PI / 2);
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
    for (let i = 0; i < 26; i++) lctx.fillRect(-110 + i * 5, 48, i % 5 === 0 ? 3 : 1.5, 38);
    // accession + human-readable barcode number
    lctx.fillStyle = '#333';
    lctx.font = '13px monospace';
    lctx.textAlign = 'left';
    lctx.fillText('ACC 2026-CYT-047-GYN', -110, 100);
    // QR code (deterministic module grid)
    const qx = 40, qy = 30, qs = 4;
    lctx.fillStyle = '#15151f';
    lctx.fillRect(qx - 2, qy - 2, qs * 9 + 4, qs * 9 + 4);
    lctx.fillStyle = '#ffffff';
    lctx.fillRect(qx, qy, qs * 9, qs * 9);
    lctx.fillStyle = '#15151f';
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const edge = r < 3 && c < 3, edge2 = r < 3 && c > 5, edge3 = r > 5 && c < 3;
      const on = edge || edge2 || edge3 ? (r === 0 || c === 0 || r === 2 || c === 2 || r === 8 || c === 8) : (r * 7 + c * 3) % 3 === 0;
      if (on) lctx.fillRect(qx + c * qs, qy + r * qs, qs, qs);
    }
    // tiny laboratory text
    lctx.fillStyle = '#8a8a92';
    lctx.font = '9px Inter, Arial, sans-serif';
    lctx.textAlign = 'center';
    lctx.fillText('EDTA · K2 · 4mL · STORE 2–8°C · CLIA #26D1234567', 0, -96);
    lctx.restore();
    const labelTex = new THREE.CanvasTexture(lcv);
    labelTex.anisotropy = 8;
    labelTex.colorSpace = THREE.SRGBColorSpace;
    // Cylinder UV winds the texture mirrored around the arc — flip U so the
    // CYTOLAB text reads correctly on the front face.
    labelTex.wrapS = THREE.RepeatWrapping;
    labelTex.repeat.x = -1;
    labelTex.offset.x = 1;
    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(R + 0.004, R + 0.004, 0.72, 96, 1, true, -1.15, 2.3),
      new THREE.MeshStandardMaterial({ map: labelTex, color: 0xffffff, roughness: 0.85, side: THREE.FrontSide }),
    );
    label.position.y = 0.0;
    label.renderOrder = 2; // FIX 2 — label on top (front-facing arc only, no mirrored back)
    vialGroup.add(label);

    // ── Volumetric blood (behind the glass, renderOrder 0) ───
    const fillFrac = 0.42;
    const bloodH = bodyH * fillFrac;
    const bloodTopY = bodyBottom + bloodH;
    const bloodR = 0.172; // FIX 2 — just inside the glass
    const bloodMat = new THREE.MeshPhysicalMaterial({
      color: 0x7a000e, metalness: 0.12, roughness: 0.12, transmission: 0.1, thickness: 1.1, ior: 1.38,
      attenuationColor: new THREE.Color(0x4a0006), attenuationDistance: 0.4,
      sheen: 0.5, sheenColor: new THREE.Color(0xb51a2a), sheenRoughness: 0.4,
      emissive: 0x33000a, emissiveIntensity: 0.5, transparent: true, opacity: 0.99,
    });
    const bloodColumn = new THREE.Mesh(new THREE.CylinderGeometry(bloodR, bloodR, bloodH, 64), bloodMat);
    bloodColumn.position.y = bodyBottom + bloodH / 2;
    bloodColumn.renderOrder = 0;
    vialGroup.add(bloodColumn);
    const bloodDome = new THREE.Mesh(
      new THREE.SphereGeometry(bloodR, 64, 32, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      bloodMat,
    );
    bloodDome.position.y = bodyBottom;
    bloodDome.renderOrder = 0;
    vialGroup.add(bloodDome);

    const surfMat = new THREE.ShaderMaterial({
      transparent: true, side: THREE.DoubleSide, uniforms: { uTime: { value: 0 } },
      vertexShader: `
        uniform float uTime; varying float vR; varying vec3 vN;
        void main(){
          vec3 p = position; float r = length(p.xy); vR = r;
          p.z += (0.018 - r * r * 1.1) + sin(r * 26.0 - uTime * 2.2) * 0.002;
          vN = normalize(vec3(-p.x, -p.y, 1.4));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        varying float vR; varying vec3 vN;
        void main(){
          vec3 col = mix(vec3(0.62,0.06,0.11), vec3(0.34,0.01,0.05), smoothstep(0.0,0.172,vR));
          col += pow(1.0 - abs(vN.z), 2.0) * vec3(0.55,0.16,0.20);
          gl_FragColor = vec4(col, 0.97);
        }`,
    });
    const bloodSurface = new THREE.Mesh(new THREE.CircleGeometry(bloodR, 96), surfMat);
    bloodSurface.rotation.x = -Math.PI / 2;
    bloodSurface.position.y = bloodTopY;
    bloodSurface.renderOrder = 0;
    vialGroup.add(bloodSurface);

    interface Bubble { mesh: THREE.Mesh; speed: number; x: number }
    const bubbles: Bubble[] = [];
    const bubbleMat = new THREE.MeshPhysicalMaterial({ color: 0xff8890, roughness: 0.1, transmission: 0.6, thickness: 0.04, transparent: true, opacity: 0.5 });
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(rnd(0.006, 0.016), 10, 8), bubbleMat);
      const ang = Math.random() * Math.PI * 2, rad = rnd(0, 0.13);
      const x = Math.cos(ang) * rad;
      m.position.set(x, rnd(bodyBottom, bloodTopY), Math.sin(ang) * rad);
      vialGroup.add(m);
      bubbles.push({ mesh: m, speed: rnd(0.03, 0.09), x });
    }

    // ── FIX 5 — glossy water ripple + glow disc ──────────────
    const rippleMat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xe63946) } },
      vertexShader: `
        uniform float uTime;
        varying vec2 vUv;
        varying float vWave;
        void main() {
          vUv = uv;
          vec3 pos = position;
          float r = length(pos.xy);
          float wave1 = sin(r * 6.0 - uTime * 2.5) * 0.018 / (r * 2.0 + 0.5);
          float wave2 = sin(r * 10.0 - uTime * 3.5) * 0.010 / (r * 2.0 + 0.8);
          float wave3 = sin(r * 14.0 - uTime * 4.0) * 0.006 / (r * 2.0 + 1.0);
          pos.z = wave1 + wave2 + wave3;
          vWave = pos.z * 8.0 + 0.5;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying vec2 vUv;
        varying float vWave;
        void main() {
          float dist = length(vUv - 0.5) * 2.0;
          float fade = 1.0 - smoothstep(0.3, 1.0, dist);
          float highlight = smoothstep(0.3, 0.8, vWave) * 0.4;
          vec3 color = mix(vec3(0.95, 0.92, 0.96), uColor, 0.12 + highlight * 0.1);
          float alpha = fade * (0.35 + highlight * 0.3);
          gl_FragColor = vec4(color, alpha);
        }
      `,
    });
    const rippleMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 3.5, 128, 128), rippleMat);
    rippleMesh.rotation.x = -Math.PI * 0.48;
    rippleMesh.position.set(0.1, rippleY, 0);
    scene.add(rippleMesh);

    const glowDiscMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(0xe63946) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 uColor; varying vec2 vUv;
        void main(){
          float d = length(vUv - 0.5) * 2.0;
          gl_FragColor = vec4(uColor, (1.0 - smoothstep(0.0, 1.0, d)) * 0.25);
        }`,
    });
    const glowDisc = new THREE.Mesh(new THREE.CircleGeometry(0.5, 64), glowDiscMat);
    glowDisc.rotation.x = -Math.PI / 2;
    glowDisc.position.set(0.1, rippleY - 0.01, 0);
    scene.add(glowDisc);

    // POLISH 6 — concentric "liquid energy" rings expanding forever
    interface RRing { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; offset: number }
    const rRings: RRing[] = [];
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xe63946, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.24, 0.26, 128), mat);
      mesh.rotation.x = -Math.PI * 0.48;
      mesh.position.set(0.1, rippleY + 0.006, 0);
      scene.add(mesh);
      rRings.push({ mesh, mat, offset: i / 4 });
    }

    // ── Orbital biconcave RBCs (scene root) ──────────────────
    interface Cell {
      mesh: THREE.Mesh; mat: THREE.MeshPhysicalMaterial; baseOpacity: number; baseScale: number;
      a: number; b: number; incl: number; yaw0: number; precess: number;
      phase: number; speed: number; bob: number; bobSpeed: number; spin: THREE.Vector3;
    }
    const cells: Cell[] = [];
    const rbcGeo = new THREE.SphereGeometry(1, 24, 14);
    for (let i = 0; i < 30; i++) {
      const rad = rnd(0.55, 1.9);
      const mat = new THREE.MeshPhysicalMaterial({
        color: 0xc1121f, roughness: 0.26, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.3,
        sheen: 0.5, sheenColor: new THREE.Color(0xff5a66), emissive: 0x3a040a, emissiveIntensity: 0.3,
        transmission: 0.3, thickness: 0.08, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
      });
      const disc = new THREE.Mesh(rbcGeo, mat);
      const s = rnd(0.055, 0.09);
      disc.scale.set(s, s, s * 0.32);
      disc.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      scene.add(disc);
      cells.push({
        mesh: disc, mat, baseOpacity: 0.9, baseScale: s,
        a: rad, b: rad * rnd(0.55, 0.9), incl: rnd(-0.5, 0.5), yaw0: Math.random() * Math.PI * 2,
        precess: rnd(-0.02, 0.02), phase: Math.random() * Math.PI * 2,
        speed: rnd(0.03, 0.1) * (Math.random() < 0.5 ? 1 : -1),
        bob: rnd(0.05, 0.25), bobSpeed: rnd(0.15, 0.5),
        spin: new THREE.Vector3(rnd(0.002, 0.006), rnd(0.002, 0.006), rnd(0.001, 0.004)),
      });
    }

    // ── FIX 4 — individually-scattered purple-nucleus WBCs ───
    interface Wbc { group: THREE.Group; bx: number; by: number; bz: number; floatSpeed: number; phase: number; amp: number; spin: number }
    const wbcs: Wbc[] = [];
    const wbcPositions: [number, number, number, number][] = [
      [-1.2, 0.1, 0.3, 1.15],
      [-0.7, -0.6, -0.4, 0.85],
      [0.9, 0.5, 0.2, 1.0],
      [-1.5, 0.7, -0.2, 0.75],
      [0.5, -0.9, 0.1, 0.95],
    ];
    for (const [bx, by, bz, sc] of wbcPositions) {
      const g = new THREE.Group();
      const outer = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 32, 32),
        new THREE.MeshPhysicalMaterial({
          color: 0xe8d5ff, transparent: true, opacity: 0.4, transmission: 0.85, thickness: 0.25,
          roughness: 0.0, ior: 1.36, clearcoat: 1, clearcoatRoughness: 0, iridescence: 0.35,
          iridescenceIOR: 1.3, envMapIntensity: 2.6, sheen: 0.5, sheenColor: new THREE.Color(0xd9c2ff),
        }),
      );
      g.add(outer);
      const nucleus = new THREE.Mesh(
        new THREE.SphereGeometry(0.052, 16, 16),
        new THREE.MeshPhysicalMaterial({
          color: 0x6b21a8, transparent: true, opacity: 0.8, transmission: 0.45, thickness: 0.3, roughness: 0.25,
          attenuationColor: new THREE.Color(0x7c2fb8), attenuationDistance: 0.4,
          emissive: 0x3a0f60, emissiveIntensity: 0.55, // soft internal glow / subsurface feel
        }),
      );
      nucleus.position.y = 0.01;
      g.add(nucleus);
      g.scale.setScalar(sc);
      g.position.set(bx, by, bz);
      scene.add(g);
      wbcs.push({ group: g, bx, by, bz, floatSpeed: rnd(0.25, 0.6), phase: Math.random() * Math.PI * 2, amp: rnd(0.06, 0.14), spin: rnd(0.002, 0.005) });
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
      map: spriteTex, size: 0.34, transparent: true, opacity: 0.5, depthWrite: false, sizeAttenuation: true,
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
    const tilt = 0.18; // FIX 6
    let sloshVel = 0, lastRotY = 0;

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      // POLISH 8 — gentle ±2° sway on an 8s loop (keeps the label facing front)
      const loop = (Math.PI * 2) / 8;
      vialGroup.rotation.y = Math.sin(t * loop) * 0.035;
      rotX += (mouseY * 0.08 - rotX) * 0.05;
      rotY += (mouseX * 0.12 - rotY) * 0.05;
      vialGroup.rotation.x = rotX;
      vialGroup.rotation.z = tilt + rotY * 0.5 + Math.sin(t * 0.4) * 0.008;
      vialGroup.position.y = Math.sin(t * loop) * 0.03; // float ~8px, 8s loop
      vialGroup.position.x = 0.1 + Math.sin(t * 0.28) * 0.012; // FIX 6 slight right offset

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
        if (bub.mesh.position.y > bloodTopY - 0.01) bub.mesh.position.y = bodyBottom + 0.02;
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
        c.mesh.position.set(lx * Math.cos(yaw) + cz1 * Math.sin(yaw), cy1 + 0.1, pz);
        c.mesh.rotation.x += c.spin.x;
        c.mesh.rotation.y += c.spin.y;
        c.mesh.rotation.z += c.spin.z;
        const depth = Math.max(0, Math.min(1, (pz + 1.2) / 2.0));
        c.mat.opacity = c.baseOpacity * (0.35 + depth * 0.65);
        const ds = c.baseScale * (0.75 + depth * 0.4);
        c.mesh.scale.set(ds, ds, c.baseScale * 0.32);
      }

      // FIX 4 — WBCs float independently in place (no clustering)
      for (const w of wbcs) {
        w.group.position.y = w.by + Math.sin(t * w.floatSpeed + w.phase) * w.amp;
        w.group.position.x = w.bx + Math.cos(t * w.floatSpeed * 0.7 + w.phase) * w.amp * 0.4;
        w.group.rotation.y += w.spin;
      }

      rippleMat.uniforms.uTime.value = t;
      for (const rr of rRings) {
        const phase = (t * 0.28 + rr.offset) % 1.0;
        rr.mesh.scale.setScalar(1 + phase * 4.2);   // expand outward
        rr.mat.opacity = (1 - phase) * phase * 1.4 * 0.5; // fade in then out
      }

      const bp = bgGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pCount; i++) {
        let y = bp.getY(i) + 0.0012;
        if (y > 3.5) y = -2.5;
        bp.setY(i, y);
      }
      bp.needsUpdate = true;

      camera.position.z = 7.3 - Math.sin(t * 0.08) * 0.15;
      camera.position.x += (mouseX * 0.12 - camera.position.x) * 0.03;
      camera.position.y += (0.05 + mouseY * 0.05 - camera.position.y) * 0.03;
      camera.lookAt(0.5, 0.05, 0);

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
