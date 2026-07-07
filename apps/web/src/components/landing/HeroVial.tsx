'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * Cinematic blood-specimen vial hero — a dedicated PBR WebGL scene. Same
 * approved layout/positions; art direction elevated to a product-film look:
 * IBL environment (Fresnel/HDR glass highlights), physical blood with slosh,
 * a wrapped pathology label, layered blood cells, glowing purple cells, a
 * refractive ripple, cinematic lighting with a slow light-sweep, and a subtle
 * volumetric background (bokeh, pink bloom, a faint DNA helix).
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
    renderer.setClearColor(0xf2f1f9, 0); // transparent, matched to the page bg
    mount.style.background = 'transparent';
    // NoToneMapping: ACES shifts the bright red cap toward orange (trips the
    // zero-orange rule once the full cap is visible); also renders the #F8F8FA
    // backdrop truer so it matches the page background exactly.
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    mount.appendChild(canvas);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(32, W / H, 0.1, 100);
    camera.position.set(0, 0.0, 6.2);
    camera.lookAt(0, 0, 0);

    // ── IBL environment (Fresnel + HDR reflections on the glass) ──
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

    // ── Cinematic radial backdrop (refraction target, no grey box) ──
    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(34, 34),
      new THREE.ShaderMaterial({
        depthWrite: false,
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `
          varying vec2 vUv;
          void main(){
            float d = length(vUv - vec2(0.52, 0.46));
            vec3 warm = vec3(0.9490, 0.9451, 0.9765);
            vec3 edge = vec3(0.9490, 0.9451, 0.9765);
            gl_FragColor = vec4(mix(warm, edge, smoothstep(0.0, 0.75, d)), 1.0);
          }`,
      }),
    );
    backdrop.position.z = -3.5;
    backdrop.renderOrder = -10;
    scene.add(backdrop);

    // Large flat scene backdrop so the whole frame matches the page bg
    const sceneBg = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshBasicMaterial({ color: 0xf2f1f9, depthWrite: false }),
    );
    sceneBg.position.z = -5;
    sceneBg.renderOrder = -20;
    scene.add(sceneBg);

    // ── Materials ────────────────────────────────────────────
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, transparent: true, opacity: 0.06, roughness: 0.02, metalness: 0.0,
      transmission: 0.98, thickness: 0.5, ior: 1.52, reflectivity: 0.98, clearcoat: 1.0,
      clearcoatRoughness: 0.0, iridescence: 0.08, iridescenceIOR: 1.3, envMapIntensity: 3.2,
      side: THREE.DoubleSide, depthWrite: false, attenuationColor: new THREE.Color(0xf0f4ff), attenuationDistance: 4,
    });
    const glassMatBack = glassMat.clone();
    glassMatBack.side = THREE.BackSide;

    const capMat = new THREE.MeshPhysicalMaterial({ color: 0xb8000e, roughness: 0.42, metalness: 0.05, clearcoat: 0.85, clearcoatRoughness: 0.28, sheen: 0.4, sheenColor: new THREE.Color(0xff5a63), envMapIntensity: 1.6 });
    const capRidgeMat = new THREE.MeshPhysicalMaterial({ color: 0x8b0008, roughness: 0.55, metalness: 0.0, envMapIntensity: 1.2 });
    // Physical blood — subsurface-ish attenuation, sheen, faint transmission
    const bloodMat = new THREE.MeshPhysicalMaterial({
      color: 0x5c0008, emissive: 0x1a0000, emissiveIntensity: 0.35, roughness: 0.14, metalness: 0.08,
      transmission: 0.22, thickness: 1.3, ior: 1.38, attenuationColor: new THREE.Color(0x35000a),
      attenuationDistance: 0.3, sheen: 0.6, sheenColor: new THREE.Color(0x8a1424), sheenRoughness: 0.4,
      transparent: true, opacity: 0.98, envMapIntensity: 0.8,
    });

    // ── VIAL (exact geometry/positions preserved) ────────────
    const vialGroup = new THREE.Group();
    scene.add(vialGroup);
    const SEG = 64;

    const outerBody = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 1.35, SEG, 1, true), glassMat);
    outerBody.position.y = 0.05; outerBody.renderOrder = 3; vialGroup.add(outerBody);
    const innerBody = new THREE.Mesh(new THREE.CylinderGeometry(0.188, 0.188, 1.35, SEG, 1, true), glassMatBack);
    innerBody.position.y = 0.05; innerBody.renderOrder = 2; vialGroup.add(innerBody);
    const bottomDome = new THREE.Mesh(new THREE.SphereGeometry(0.21, SEG, SEG, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), glassMat);
    bottomDome.position.y = -0.625; bottomDome.rotation.x = Math.PI; bottomDome.renderOrder = 3; vialGroup.add(bottomDome);
    const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.168, 0.21, 0.15, SEG), glassMat);
    shoulder.position.y = 0.825; shoulder.renderOrder = 3; vialGroup.add(shoulder);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.168, 0.168, 0.09, SEG), glassMat);
    neck.position.y = 0.945; neck.renderOrder = 3; vialGroup.add(neck);
    // top rim bead (rounded glass edge)
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.168, 0.012, 16, SEG), glassMat);
    rim.position.y = 0.99; rim.rotation.x = Math.PI / 2; rim.renderOrder = 3; vialGroup.add(rim);

    const capBody = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.185, 0.28, SEG), capMat);
    capBody.position.y = 1.13; vialGroup.add(capBody);
    const capTop = new THREE.Mesh(new THREE.CircleGeometry(0.185, SEG), capMat);
    capTop.position.y = 1.275; capTop.rotation.x = -Math.PI / 2; vialGroup.add(capTop);
    const capBevel = new THREE.Mesh(new THREE.TorusGeometry(0.178, 0.012, 16, SEG), capMat);
    capBevel.position.y = 1.268; capBevel.rotation.x = Math.PI / 2; vialGroup.add(capBevel);
    for (let i = 0; i < 8; i++) {
      const ridge = new THREE.Mesh(new THREE.TorusGeometry(0.188, 0.007, 8, SEG), capRidgeMat);
      ridge.position.y = 0.998 + i * 0.034; ridge.rotation.x = Math.PI / 2; vialGroup.add(ridge);
    }

    // ── BLOOD ────────────────────────────────────────────────
    const bloodHeight = 0.58;
    const bloodFill = new THREE.Mesh(new THREE.CylinderGeometry(0.181, 0.181, bloodHeight, SEG), bloodMat);
    bloodFill.position.y = -0.625 + bloodHeight / 2; bloodFill.renderOrder = 1; vialGroup.add(bloodFill);
    const bloodDome = new THREE.Mesh(new THREE.SphereGeometry(0.181, SEG, SEG, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), bloodMat);
    bloodDome.position.y = -0.618; bloodDome.rotation.x = Math.PI; bloodDome.renderOrder = 1; vialGroup.add(bloodDome);

    const surfMat = new THREE.ShaderMaterial({
      transparent: true, side: THREE.DoubleSide, uniforms: { uTime: { value: 0 } },
      vertexShader: `
        uniform float uTime; varying vec2 vUv; varying vec3 vN;
        void main(){
          vUv = uv; vec3 pos = position; float r = length(pos.xy);
          pos.z -= r * r * 0.35; pos.z += sin(r * 10.0 - uTime * 2.5) * 0.003;
          vN = normalize(vec3(-pos.x, -pos.y, 1.4));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }`,
      fragmentShader: `
        varying vec2 vUv; varying vec3 vN;
        void main(){
          float dist = length(vUv - 0.5) * 2.0;
          vec3 col = mix(vec3(0.5,0.02,0.05), vec3(0.28,0.0,0.03), dist);
          col += pow(1.0 - abs(vN.z), 2.0) * vec3(0.5,0.15,0.18);
          float alpha = (1.0 - smoothstep(0.8, 1.0, dist)) * 0.94;
          gl_FragColor = vec4(col, alpha);
        }`,
    });
    const bloodSurface = new THREE.Mesh(new THREE.CircleGeometry(0.181, SEG), surfMat);
    bloodSurface.position.y = -0.058; bloodSurface.rotation.x = -Math.PI / 2; bloodSurface.renderOrder = 2; vialGroup.add(bloodSurface);

    // ── LABEL (wrapped pathology label) ──────────────────────
    const lc = document.createElement('canvas');
    lc.width = 640; lc.height = 320;
    const g = lc.getContext('2d')!;
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 640, 320);
    g.save();
    g.translate(320, 160); g.rotate(-Math.PI / 2); // reads up the tube
    g.fillStyle = '#B8000E'; g.fillRect(-150, -138, 300, 7);
    g.fillStyle = '#111'; g.font = 'bold 60px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    (g as unknown as { letterSpacing: string }).letterSpacing = '6px';
    g.fillText('CYTOLAB', 6, -96);
    (g as unknown as { letterSpacing: string }).letterSpacing = '0px';
    g.fillStyle = '#B8000E';
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.beginPath(); g.arc(Math.cos(a) * 15, -150 + Math.sin(a) * 15, 7, 0, Math.PI * 2); g.fill(); }
    g.beginPath(); g.arc(0, -150, 8, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#ddd'; g.lineWidth = 1; g.beginPath(); g.moveTo(-160, -56); g.lineTo(160, -56); g.stroke();
    g.textAlign = 'left';
    g.fillStyle = '#888'; g.font = '15px Arial'; g.fillText('SPECIMEN', -158, -34);
    g.fillStyle = '#111'; g.font = 'bold 26px Arial'; g.fillText('DM26-03-014', -158, -8);
    g.fillStyle = '#888'; g.font = '13px Arial'; g.fillText('ACCESSION  A-2026-004718', -158, 18);
    g.fillStyle = '#111';
    for (let i = 0; i < 52; i++) { const bx = -158 + i * 5.4; g.fillRect(bx, 34, i % 4 === 0 ? 3 : 1.6, 46); }
    g.fillStyle = '#555'; g.font = '12px monospace'; g.fillText('2026 CYT 047 GYN', -158, 96);
    // QR
    const qx = 96, qy = 34, qm = 4.4;
    g.fillStyle = '#111'; g.fillRect(qx - 2, qy - 2, qm * 12 + 4, qm * 12 + 4);
    g.fillStyle = '#fff'; g.fillRect(qx, qy, qm * 12, qm * 12);
    g.fillStyle = '#111';
    for (let r = 0; r < 12; r++) for (let c = 0; c < 12; c++) {
      const finder = (r < 3 && c < 3) || (r < 3 && c > 8) || (r > 8 && c < 3);
      const on = finder ? (r === 0 || c === 0 || r === 2 || c === 2 || r === 11 || c === 11 || (r === 1 && c === 1)) : (r * 5 + c * 3 + r * c) % 3 === 0;
      if (on) g.fillRect(qx + c * qm, qy + r * qm, qm, qm);
    }
    g.fillStyle = '#999'; g.font = '10px Arial'; g.fillText('BIOHAZARD · HANDLE PER OSHA 1910.1030 · STORE 2–8°C', -158, 118);
    g.restore();
    const labelTex = new THREE.CanvasTexture(lc);
    labelTex.anisotropy = 8; labelTex.colorSpace = THREE.SRGBColorSpace;
    labelTex.wrapS = THREE.RepeatWrapping; labelTex.repeat.x = -1; labelTex.offset.x = 1;
    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2115, 0.2115, 0.62, SEG, 1, true, -1.25, 2.5),
      new THREE.MeshStandardMaterial({ map: labelTex, roughness: 0.72, side: THREE.FrontSide, envMapIntensity: 0.4 }),
    );
    label.position.y = 0.06; label.renderOrder = 4; vialGroup.add(label);

    // ── VIAL TRANSFORM (unchanged) ───────────────────────────
    vialGroup.scale.setScalar(1.28);
    vialGroup.rotation.z = 0.21;
    vialGroup.position.set(0.0, -0.15, 0.0);

    // ── PURPLE WHITE-BLOOD CELLS (bigger, glossy, glowing) ────
    const makeWBC = (outerR: number, nucleusR: number, op: number) => {
      const grp = new THREE.Group();
      grp.add(new THREE.Mesh(new THREE.SphereGeometry(outerR, 32, 32), new THREE.MeshPhysicalMaterial({
        color: 0xecd6f6, transparent: true, opacity: op, roughness: 0.0, transmission: 0.85, thickness: 0.2,
        ior: 1.36, clearcoat: 1, clearcoatRoughness: 0, iridescence: 0.4, iridescenceIOR: 1.3, envMapIntensity: 2.4,
        sheen: 0.6, sheenColor: new THREE.Color(0xe3ccff),
      })));
      grp.add(new THREE.Mesh(new THREE.SphereGeometry(outerR * 0.82, 24, 24), new THREE.MeshPhysicalMaterial({
        color: 0xc9a0ea, transparent: true, opacity: op * 0.45, roughness: 0.0, transmission: 0.6, side: THREE.DoubleSide,
      })));
      const nuc = new THREE.Mesh(new THREE.SphereGeometry(nucleusR, 24, 24), new THREE.MeshPhysicalMaterial({
        color: 0x6a1fa0, emissive: 0x3a0f66, emissiveIntensity: 0.9, transparent: true, opacity: 0.85, roughness: 0.25,
        transmission: 0.25, attenuationColor: new THREE.Color(0x8a3fc0), attenuationDistance: 0.4,
      }));
      nuc.position.y = nucleusR * 0.12; grp.add(nuc);
      return grp;
    };
    interface WbcRec { grp: THREE.Group; baseY: number; fs: number; fa: number; fp: number }
    const wbcData: [number, number, number, number, number, number, number, number, number][] = [
      [-1.25, 0.12, 0.3, 0.185, 0.1, 0.6, 0.42, 0.07, 0.0],
      [0.85, -0.42, -0.18, 0.12, 0.066, 0.5, 0.38, 0.05, 1.2],
      [-0.72, -0.78, -0.25, 0.1, 0.056, 0.44, 0.51, 0.06, 2.1],
      [0.55, -0.88, 0.12, 0.11, 0.06, 0.46, 0.44, 0.05, 3.4],
      [-1.55, 0.65, -0.45, 0.075, 0.042, 0.32, 0.35, 0.04, 4.8],
    ];
    const wbcs: WbcRec[] = wbcData.map(([x, y, z, oR, nR, op, fs, fa, fp]) => {
      const grp = makeWBC(oR, nR, op); grp.position.set(x, y, z); scene.add(grp);
      return { grp, baseY: y, fs, fa, fp };
    });

    // ── RED BLOOD CELLS — 35, layered fg/mid/bg ──────────────
    interface RbcRec { mesh: THREE.Mesh; mat: THREE.MeshPhysicalMaterial; base: THREE.Vector3; a: number; sp: number; ang: number; fp: number; fspd: number; rot: number; op: number }
    const rbcGeo = new THREE.SphereGeometry(1, 20, 12);
    const rbcs: RbcRec[] = [];
    const layers = [
      { n: 12, z: [0.28, 0.62], size: [0.1, 0.135], op: 0.95, sp: [0.006, 0.012] }, // foreground
      { n: 13, z: [-0.15, 0.2], size: [0.075, 0.1], op: 0.9, sp: [0.004, 0.008] }, // middle
      { n: 10, z: [-0.7, -0.25], size: [0.05, 0.075], op: 0.5, sp: [0.002, 0.005] }, // background
    ];
    for (const L of layers) {
      for (let i = 0; i < L.n; i++) {
        const mat = new THREE.MeshPhysicalMaterial({
          color: 0xc8102e, roughness: 0.22, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.28,
          sheen: 0.5, sheenColor: new THREE.Color(0xff5a66), emissive: 0x3a040a, emissiveIntensity: 0.28,
          transmission: 0.24, thickness: 0.06, transparent: true, opacity: L.op, side: THREE.DoubleSide, envMapIntensity: 1.2,
        });
        const s = rnd(L.size[0], L.size[1]);
        const mesh = new THREE.Mesh(rbcGeo, mat);
        mesh.scale.set(s, s, s * 0.24);
        mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        const base = new THREE.Vector3(rnd(-1.3, 1.3), rnd(-1.05, 1.0), rnd(L.z[0], L.z[1]));
        mesh.position.copy(base); scene.add(mesh);
        rbcs.push({
          mesh, mat, base, a: rnd(0.12, 0.34), sp: rnd(L.sp[0], L.sp[1]) * (Math.random() < 0.5 ? 1 : -1),
          ang: Math.random() * Math.PI * 2, fp: Math.random() * Math.PI * 2, fspd: rnd(0.25, 0.6),
          rot: rnd(0.002, 0.006), op: L.op,
        });
      }
    }

    // ── ICOSAHEDRON CELL (inside large WBC) ──────────────────
    const cellGroup = new THREE.Group();
    cellGroup.position.set(-1.25, 0.12, 0.3); cellGroup.scale.setScalar(0.3); scene.add(cellGroup);
    const coreIco = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 3), new THREE.MeshPhongMaterial({ color: 0xff6b8a, emissive: 0x3d0010, specular: 0xff9ab0, shininess: 80, transparent: true, opacity: 0.32, wireframe: true }));
    cellGroup.add(coreIco);
    const innerSphere = new THREE.Mesh(new THREE.SphereGeometry(0.9, 32, 32), new THREE.MeshBasicMaterial({ color: 0xd4216e, transparent: true, opacity: 0.18 }));
    cellGroup.add(innerSphere);
    interface Dot { mesh: THREE.Mesh; orig: THREE.Vector3; offset: number }
    const cellDots: Dot[] = [];
    const dotGeo = new THREE.SphereGeometry(0.025, 6, 6);
    for (let i = 0; i < 40; i++) {
      const dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: 0xff8fab, transparent: true, opacity: 0.4 + Math.random() * 0.4 }));
      const radius = 1.8 + Math.random() * 0.8, theta = Math.random() * Math.PI * 2, phi = Math.acos(Math.random() * 2 - 1);
      dot.position.set(radius * Math.sin(phi) * Math.cos(theta), radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi));
      cellGroup.add(dot); cellDots.push({ mesh: dot, orig: dot.position.clone(), offset: Math.random() * 100 });
    }

    // ── RIPPLE — shader water surface + ring overlays + glow + shimmer ──
    const rippleMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uColor1: { value: new THREE.Color(0xc8102e) }, uColor2: { value: new THREE.Color(0xf0d0d8) } },
      vertexShader: `
        uniform float uTime;
        varying vec2 vUv;
        varying float vElevation;
        void main() {
          vUv = uv;
          vec3 pos = position;
          float r = length(pos.xy * vec2(1.0, 2.2));
          float w1 = sin(r * 5.5  - uTime * 2.8) * 0.028 / (r * 1.8 + 0.4);
          float w2 = sin(r * 9.0  - uTime * 3.8) * 0.018 / (r * 2.2 + 0.6);
          float w3 = sin(r * 13.5 - uTime * 5.0) * 0.010 / (r * 2.8 + 0.8);
          float w4 = sin(r * 20.0 - uTime * 7.0) * 0.005 / (r * 3.5 + 1.0);
          pos.z = w1 + w2 + w3 + w4;
          vElevation = pos.z;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        varying vec2 vUv;
        varying float vElevation;
        void main() {
          vec2 uv2 = (vUv - 0.5) * vec2(1.0, 2.0);
          float dist = length(uv2);
          float fade = pow(1.0 - smoothstep(0.18, 0.92, dist), 1.4);
          float highlight = smoothstep(0.012, 0.028, vElevation) * 0.7;
          float shadow    = smoothstep(-0.028, -0.012, vElevation) * 0.3;
          vec3 color = mix(uColor1 * 0.85, uColor2, highlight * 0.6);
          color = mix(color, uColor1 * 0.6, shadow * 0.4);
          float centerGlow = 1.0 - smoothstep(0.0, 0.22, dist);
          color = mix(color, vec3(1.0, 0.85, 0.88), centerGlow * 0.5);
          float alpha = fade * (0.28 + highlight * 0.18 + centerGlow * 0.08);
          gl_FragColor = vec4(color, alpha);
        }
      `,
    });
    const rippleMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.9, 180, 60), rippleMat);
    rippleMesh.rotation.x = -Math.PI * 0.44;
    rippleMesh.position.set(0.0, -1.22, 0.0);
    rippleMesh.renderOrder = 0;
    scene.add(rippleMesh);

    interface RippleRing { line: THREE.Line; base: number; offset: number }
    const ringData = [
      { r: 0.18, opacity: 0.45 }, { r: 0.36, opacity: 0.37 }, { r: 0.58, opacity: 0.3 },
      { r: 0.82, opacity: 0.23 }, { r: 1.08, opacity: 0.15 }, { r: 1.38, opacity: 0.09 }, { r: 1.7, opacity: 0.05 },
    ];
    const rings: RippleRing[] = ringData.map(({ r, opacity }, i) => {
      const points: THREE.Vector3[] = [];
      for (let j = 0; j <= 180; j++) {
        const a = (j / 180) * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r * 0.42, 0));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({ color: i < 3 ? 0xc8102e : 0xd4a0b0, transparent: true, opacity });
      const line = new THREE.Line(geo, mat);
      line.rotation.x = -Math.PI * 0.46;
      line.position.set(0.0, -1.22, 0.0);
      line.renderOrder = 1;
      scene.add(line);
      return { line, base: opacity, offset: i / ringData.length };
    });

    const glowMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        varying vec2 vUv;
        void main() {
          vec2 uv2 = (vUv - 0.5) * vec2(1.0, 2.2);
          float d = length(uv2);
          float g = pow(1.0 - smoothstep(0.0, 0.5, d), 3.0);
          vec3 col = mix(vec3(1.0, 0.88, 0.90), vec3(0.75, 0.04, 0.12), d * 1.8);
          gl_FragColor = vec4(col, g * 0.30);
        }
      `,
    });
    const glowDisc = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.5), glowMat);
    glowDisc.rotation.x = -Math.PI * 0.46;
    glowDisc.position.set(0.0, -1.22, 0.02);
    glowDisc.renderOrder = 2;
    scene.add(glowDisc);

    const shimmerMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          vec2 uv = vUv - 0.5;
          float d = length(uv * vec2(1.0, 2.0));
          float fade = 1.0 - smoothstep(0.1, 0.5, d);
          float shimmer = sin(uv.x * 18.0 + uTime * 3.0) * 0.5 + 0.5;
          shimmer *= sin(uv.y * 12.0 - uTime * 2.0) * 0.5 + 0.5;
          shimmer = pow(shimmer, 6.0) * fade;
          gl_FragColor = vec4(1.0, 0.9, 0.92, shimmer * 0.10);
        }
      `,
    });
    const shimmerPlane = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.4), shimmerMat);
    shimmerPlane.rotation.x = -Math.PI * 0.46;
    shimmerPlane.position.set(0.0, -1.22, 0.04);
    shimmerPlane.renderOrder = 3;
    scene.add(shimmerPlane);

    // ── BACKGROUND: bokeh, pink bloom, faint DNA helix ───────
    const sprite = document.createElement('canvas'); sprite.width = sprite.height = 64;
    const sx = sprite.getContext('2d')!;
    const sg = sx.createRadialGradient(32, 32, 0, 32, 32, 32);
    sg.addColorStop(0, 'rgba(255,255,255,0.9)'); sg.addColorStop(0.4, 'rgba(255,214,224,0.5)'); sg.addColorStop(1, 'rgba(255,214,224,0)');
    sx.fillStyle = sg; sx.fillRect(0, 0, 64, 64);
    const spriteTex = new THREE.CanvasTexture(sprite);
    const pCount = 130; const pPos = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) { pPos[i * 3] = rnd(-3.2, 3.2); pPos[i * 3 + 1] = rnd(-3, 3.5); pPos[i * 3 + 2] = rnd(-2.6, -0.4); }
    const bgGeo = new THREE.BufferGeometry(); bgGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const bgParticles = new THREE.Points(bgGeo, new THREE.PointsMaterial({ map: spriteTex, size: 0.32, transparent: true, opacity: 0.5, depthWrite: false, sizeAttenuation: true }));
    scene.add(bgParticles);

    const bloom = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({ map: spriteTex, color: 0xff9fb5, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }));
    bloom.position.set(0.1, -0.1, -1.6); scene.add(bloom);

    // Faint DNA double helix behind the scene
    const dna = new THREE.Group();
    const dnaMat1 = new THREE.MeshBasicMaterial({ color: 0xffc2d0, transparent: true, opacity: 0.14 });
    const dnaMat2 = new THREE.MeshBasicMaterial({ color: 0xd9b8ff, transparent: true, opacity: 0.12 });
    const dnaBead = new THREE.SphereGeometry(0.03, 8, 8);
    for (let i = 0; i < 34; i++) {
      const t = i / 34 * Math.PI * 4;
      const y = (i / 34 - 0.5) * 3.6;
      const a = new THREE.Mesh(dnaBead, dnaMat1); a.position.set(Math.cos(t) * 0.32, y, Math.sin(t) * 0.32); dna.add(a);
      const b = new THREE.Mesh(dnaBead, dnaMat2); b.position.set(Math.cos(t + Math.PI) * 0.32, y, Math.sin(t + Math.PI) * 0.32); dna.add(b);
      if (i % 3 === 0) { const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.64, 5), dnaMat2); rung.position.set(0, y, 0); rung.rotation.z = Math.PI / 2; rung.rotation.y = t; dna.add(rung); }
    }
    dna.position.set(1.9, 0.1, -2.2); dna.scale.setScalar(0.9); scene.add(dna);

    // ── CINEMATIC LIGHTING ───────────────────────────────────
    scene.add(new THREE.AmbientLight(0xfff0f2, 0.5));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.6); keyLight.position.set(4, 5, 5); scene.add(keyLight);
    const warmFill = new THREE.DirectionalLight(0xffe6d2, 1.2); warmFill.position.set(-4, 2, 3); scene.add(warmFill);
    const redUnder = new THREE.PointLight(0xff1a2e, 0.7, 5); redUnder.position.set(0, -1.5, 1.2); scene.add(redUnder);
    const purpleRim = new THREE.DirectionalLight(0x9b6bff, 0.9); purpleRim.position.set(-2.5, -0.5, -3.5); scene.add(purpleRim);
    const topLight = new THREE.PointLight(0xffffff, 0.9, 4); topLight.position.set(0, 2.5, 2); scene.add(topLight);
    const cellLight = new THREE.PointLight(0xff4080, 0.5, 3); cellLight.position.set(-1.25, 0.12, 0.8); scene.add(cellLight);
    const sweep = new THREE.PointLight(0xffffff, 0.0, 6); sweep.position.set(0, 0.6, 2.4); scene.add(sweep); // light sweep across the glass

    // ── ANIMATION ────────────────────────────────────────────
    let mtx = 0, mty = 0, cox = 0, coy = 0;
    const onMouse = (e: MouseEvent) => {
      const rect = mount.getBoundingClientRect();
      mtx = ((e.clientX - rect.left) / rect.width - 0.5) * 0.18;
      mty = -((e.clientY - rect.top) / rect.height - 0.5) * 0.12;
    };
    mount.addEventListener('mousemove', onMouse);

    const clock = new THREE.Clock();
    let raf = 0;
    const LOOP = (Math.PI * 2) / 8;

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      // Vial — extremely subtle float, slow y-spin only (no bounce, no x/z sway)
      vialGroup.rotation.y += 0.0025;
      vialGroup.rotation.z = 0.21;
      vialGroup.position.y = -0.15 + Math.sin(t * 0.35) * 0.022;
      vialGroup.position.x = 0.0 + Math.cos(t * 0.22) * 0.008;

      // Blood inertia — very subtle
      const slosh = Math.sin(vialGroup.rotation.y) * 0.008;
      bloodFill.position.x = slosh; bloodDome.position.x = slosh; bloodSurface.position.x = slosh;
      surfMat.uniforms.uTime.value = t;

      // Camera parallax
      cox += (mtx - cox) * 0.04; coy += (mty - coy) * 0.04;
      camera.position.x = cox; camera.position.y = 0.0 + coy;

      // Light sweep across the glass every 8s
      sweep.position.x = Math.sin(t * LOOP) * 2.6;
      sweep.intensity = 0.6 * Math.max(0, Math.cos(t * LOOP));

      wbcs.forEach((w) => { w.grp.position.y = w.baseY + Math.sin(t * w.fs + w.fp) * w.fa; w.grp.rotation.y += 0.002; });

      for (const r of rbcs) {
        r.ang += r.sp;
        r.mesh.position.x = r.base.x + Math.cos(r.ang) * r.a;
        r.mesh.position.y = r.base.y + Math.sin(t * r.fspd + r.fp) * 0.06;
        r.mesh.rotation.z += r.rot; r.mesh.rotation.x += r.rot * 0.6;
      }

      cellGroup.rotation.y += 0.0012; cellGroup.rotation.x += 0.0007;
      const cp = 1 + Math.sin(t * 1.4) * 0.055; coreIco.scale.setScalar(cp); innerSphere.scale.setScalar(cp * 0.88);
      cellGroup.position.y = 0.12 + Math.sin(t * 0.42) * 0.07;
      cellLight.intensity = 0.4 + Math.sin(t * 1.4) * 0.2;
      cellDots.forEach((d) => { d.mesh.position.x = d.orig.x + Math.sin(t + d.offset) * 0.06; d.mesh.position.y = d.orig.y + Math.cos(t + d.offset) * 0.06; });

      rippleMat.uniforms.uTime.value = t;
      shimmerMat.uniforms.uTime.value = t;
      for (const rr of rings) {
        const p = (t * 0.52 + rr.offset) % 1.0;
        rr.line.scale.setScalar(0.55 + p * 1.6);
        (rr.line.material as THREE.LineBasicMaterial).opacity = rr.base * (1 - p);
      }

      const bp = bgGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pCount; i++) { let y = bp.getY(i) + 0.0012; if (y > 3.5) y = -3; bp.setY(i, y); }
      bp.needsUpdate = true;
      dna.rotation.y += 0.0016;

      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      W = mount.clientWidth || W; H = mount.clientHeight || H;
      camera.aspect = W / H; camera.updateProjectionMatrix(); renderer.setSize(W, H);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      mount.removeEventListener('mousemove', onMouse);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else if (mat) mat.dispose();
      });
      labelTex.dispose(); spriteTex.dispose(); envRT?.dispose(); pmrem.dispose(); renderer.dispose();
      if (mount.contains(canvas)) mount.removeChild(canvas);
    };
  }, []);

  return <div ref={mountRef} style={{ width: '100%', height: '100%', position: 'relative' }} />;
}
