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
    // Atmospheric haze — ties every element into ONE volume of air. Far cells,
    // dust and the DNA helix fade into the page bg; the near vial stays crisp.
    // This is what turns "separate floating assets" into a single scene.
    scene.fog = new THREE.Fog(0xf2f1f9, 6.6, 12.5);

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
      color: 0xffffff, transparent: true, opacity: 0.13, roughness: 0.025, metalness: 0.0,
      transmission: 0.98, thickness: 0.6, ior: 1.52, reflectivity: 0.98, specularIntensity: 1.0,
      specularColor: new THREE.Color(0xffffff), clearcoat: 1.0,
      clearcoatRoughness: 0.045, iridescence: 0.15, iridescenceIOR: 1.3, envMapIntensity: 3.7,
      side: THREE.DoubleSide, depthWrite: false, attenuationColor: new THREE.Color(0xeef2ff), attenuationDistance: 3.4,
    });
    const glassMatBack = glassMat.clone();
    glassMatBack.side = THREE.BackSide;

    const capMat = new THREE.MeshPhysicalMaterial({ color: 0xb8000e, roughness: 0.42, metalness: 0.05, clearcoat: 0.85, clearcoatRoughness: 0.28, sheen: 0.4, sheenColor: new THREE.Color(0xff5a63), envMapIntensity: 1.6 });
    const capRidgeMat = new THREE.MeshPhysicalMaterial({ color: 0x8b0008, roughness: 0.55, metalness: 0.0, envMapIntensity: 1.2 });
    // Physical blood — subsurface-ish attenuation, sheen, faint transmission
    const bloodMat = new THREE.MeshPhysicalMaterial({
      color: 0x66000b, emissive: 0x220000, emissiveIntensity: 0.45, roughness: 0.1, metalness: 0.1,
      transmission: 0.24, thickness: 1.4, ior: 1.38, clearcoat: 0.5, clearcoatRoughness: 0.22,
      attenuationColor: new THREE.Color(0x30000a), attenuationDistance: 0.28,
      sheen: 0.65, sheenColor: new THREE.Color(0x9a1626), sheenRoughness: 0.38,
      transparent: true, opacity: 0.99, envMapIntensity: 1.0,
    });

    // ── SOFT CONTACT SHADOW (radial gradient blob under the vial) ──
    const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = 256; shadowCanvas.height = 256;
    const sctx = shadowCanvas.getContext('2d')!;
    const sgrad = sctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    sgrad.addColorStop(0, 'rgba(40,20,55,0.34)'); sgrad.addColorStop(0.45, 'rgba(40,20,55,0.16)'); sgrad.addColorStop(1, 'rgba(40,20,55,0)');
    sctx.fillStyle = sgrad; sctx.fillRect(0, 0, 256, 256);
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    const contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 1.5),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.9, depthWrite: false })
    );
    contactShadow.rotation.x = -Math.PI * 0.5;
    contactShadow.position.set(-0.2, -1.32, 0.0);
    contactShadow.renderOrder = -1;
    scene.add(contactShadow);

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
    const bloodHeight = 0.405; // ~30% fill
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
          // meniscus — bright concave ring where the blood clings to the glass
          float meniscus = smoothstep(0.82, 0.96, dist) * (1.0 - smoothstep(0.96, 1.0, dist));
          col += meniscus * vec3(0.62, 0.22, 0.26);
          float alpha = (1.0 - smoothstep(0.8, 1.0, dist)) * 0.94;
          alpha = min(1.0, alpha + meniscus * 0.4);
          gl_FragColor = vec4(col, alpha);
        }`,
    });
    const bloodSurface = new THREE.Mesh(new THREE.CircleGeometry(0.181, SEG), surfMat);
    bloodSurface.position.y = -0.22; bloodSurface.rotation.x = -Math.PI / 2; bloodSurface.renderOrder = 2; vialGroup.add(bloodSurface);

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
    labelTex.wrapS = THREE.RepeatWrapping; labelTex.repeat.x = 1; labelTex.offset.x = 0;
    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2115, 0.2115, 0.62, SEG, 1, true, -1.25, 2.5),
      new THREE.MeshStandardMaterial({ map: labelTex, roughness: 0.72, side: THREE.FrontSide, envMapIntensity: 0.4 }),
    );
    label.position.y = 0.06; label.renderOrder = 4; vialGroup.add(label);

    // ── VIAL TRANSFORM (unchanged) ───────────────────────────
    vialGroup.scale.setScalar(1.43);
    vialGroup.rotation.z = 0.34; // ~19.5° tilt
    vialGroup.position.set(-0.2, -0.15, 0.0); // shifted left toward the headline

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
    // 20 RBCs on curved elliptical orbits AROUND the vial centre — suspended flow
    interface RbcRec {
      mesh: THREE.Mesh; mat: THREE.MeshPhysicalMaterial; baseScale: number; baseOp: number;
      a: number; b: number; incl: number; yaw0: number; precess: number; phase: number; speed: number; spin: THREE.Vector3;
    }
    const rbcGeo = new THREE.SphereGeometry(1, 20, 12);
    const rbcs: RbcRec[] = [];
    for (let i = 0; i < 20; i++) {
      const front = Math.random() < 0.5;
      const baseOp = front ? 0.95 : 0.5;
      const mat = new THREE.MeshPhysicalMaterial({
        color: 0xc8102e, roughness: 0.22, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.28,
        sheen: 0.5, sheenColor: new THREE.Color(0xff5a66), emissive: 0x3a040a, emissiveIntensity: 0.28,
        transmission: 0.24, thickness: 0.06, transparent: true, opacity: baseOp, side: THREE.DoubleSide, envMapIntensity: 1.2,
      });
      const s = rnd(0.06, 0.125);
      const mesh = new THREE.Mesh(rbcGeo, mat);
      mesh.scale.set(s, s, s * 0.24);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      scene.add(mesh);
      const rad = rnd(0.55, 1.4);
      rbcs.push({
        mesh, mat, baseScale: s, baseOp,
        a: rad, b: rad * rnd(0.6, 0.95), incl: rnd(-0.55, 0.55), yaw0: Math.random() * Math.PI * 2,
        precess: rnd(-0.015, 0.015), phase: Math.random() * Math.PI * 2,
        speed: rnd(0.05, 0.14) * (Math.random() < 0.5 ? 1 : -1),
        spin: new THREE.Vector3(rnd(0.002, 0.006), rnd(0.002, 0.006), rnd(0.001, 0.004)),
      });
    }

    // ── ICOSAHEDRON CELL (inside large WBC) ──────────────────
    const cellGroup = new THREE.Group();
    cellGroup.position.set(-1.25, 0.12, 0.3); cellGroup.scale.setScalar(0.3); scene.add(cellGroup);
    // Translucent glass membrane
    const membrane = new THREE.Mesh(new THREE.SphereGeometry(1.25, 48, 48), new THREE.MeshPhysicalMaterial({
      color: 0xf1d8ff, transparent: true, opacity: 0.26, roughness: 0.0, transmission: 0.9, thickness: 0.5,
      ior: 1.36, clearcoat: 1, clearcoatRoughness: 0, iridescence: 0.42, iridescenceIOR: 1.3,
      envMapIntensity: 2.3, sheen: 0.7, sheenColor: new THREE.Color(0xe0c0ff), side: THREE.DoubleSide,
    }));
    cellGroup.add(membrane);
    // Soft volumetric glow shell (additive back-side)
    const cellGlow = new THREE.Mesh(new THREE.SphereGeometry(1.5, 32, 32), new THREE.MeshBasicMaterial({
      color: 0xcf8fe0, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide, fog: false,
    }));
    cellGroup.add(cellGlow);
    // Soft lobed purple nucleus with internal glow
    const nucleus = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.5 * (0.7 + Math.random() * 0.5), 24, 24), new THREE.MeshPhysicalMaterial({
        color: 0x8a3fc0, emissive: 0x3c1068, emissiveIntensity: 0.85, roughness: 0.35, transmission: 0.28,
        transparent: true, opacity: 0.9, attenuationColor: new THREE.Color(0x9a4fd0), attenuationDistance: 0.5,
      }));
      lobe.position.set((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5);
      nucleus.add(lobe);
    }
    cellGroup.add(nucleus);
    // Internal particles suspended inside the membrane
    interface Dot { mesh: THREE.Mesh; orig: THREE.Vector3; offset: number }
    const cellDots: Dot[] = [];
    const dotGeo = new THREE.SphereGeometry(0.028, 6, 6);
    const dotCols = [0xffffff, 0xffc0d8, 0xd9b0ff];
    for (let i = 0; i < 26; i++) {
      const dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: dotCols[i % 3], transparent: true, opacity: 0.4 + Math.random() * 0.4 }));
      const radius = 0.4 + Math.random() * 0.72, theta = Math.random() * Math.PI * 2, phi = Math.acos(Math.random() * 2 - 1);
      dot.position.set(radius * Math.sin(phi) * Math.cos(theta), radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi));
      cellGroup.add(dot); cellDots.push({ mesh: dot, orig: dot.position.clone(), offset: Math.random() * 100 });
    }

    // ── RIPPLE — shader water surface + ring overlays + glow + shimmer ──
    const rippleMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uColor1: { value: new THREE.Color(0xff9ab5) }, uColor2: { value: new THREE.Color(0xffffff) } },
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
    rippleMesh.position.set(-0.2, -1.22, 0.0);
    rippleMesh.renderOrder = 0;
    scene.add(rippleMesh);

    // ── LUMINOUS ENERGY RINGS (soft blurred additive glow, not crisp lines) ──
    // A radial "soft donut" gradient — bright feathered band, transparent core+edge.
    const ringCanvas = document.createElement('canvas'); ringCanvas.width = ringCanvas.height = 128;
    const rgc = ringCanvas.getContext('2d')!;
    const rg = rgc.createRadialGradient(64, 64, 0, 64, 64, 64);
    rg.addColorStop(0.0, 'rgba(255,255,255,0)');
    rg.addColorStop(0.5, 'rgba(255,196,214,0)');
    rg.addColorStop(0.74, 'rgba(255,176,200,0.55)');
    rg.addColorStop(0.88, 'rgba(255,255,255,0.85)');
    rg.addColorStop(0.96, 'rgba(255,208,222,0.35)');
    rg.addColorStop(1.0, 'rgba(255,255,255,0)');
    rgc.fillStyle = rg; rgc.fillRect(0, 0, 128, 128);
    const ringTex = new THREE.CanvasTexture(ringCanvas);
    interface EnergyRing { mesh: THREE.Mesh; offset: number }
    const rings: EnergyRing[] = [];
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
      );
      mesh.rotation.x = -Math.PI * 0.46;
      mesh.position.set(-0.2, -1.22, 0.01);
      mesh.renderOrder = 1;
      scene.add(mesh);
      rings.push({ mesh, offset: i / 4 });
    }

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
    glowDisc.position.set(-0.2, -1.22, 0.02);
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
    shimmerPlane.position.set(-0.2, -1.22, 0.04);
    shimmerPlane.renderOrder = 3;
    scene.add(shimmerPlane);

    // ── BACKGROUND: bokeh, pink bloom, faint DNA helix ───────
    const sprite = document.createElement('canvas'); sprite.width = sprite.height = 64;
    const sx = sprite.getContext('2d')!;
    const sg = sx.createRadialGradient(32, 32, 0, 32, 32, 32);
    sg.addColorStop(0, 'rgba(255,255,255,0.9)'); sg.addColorStop(0.4, 'rgba(255,214,224,0.5)'); sg.addColorStop(1, 'rgba(255,214,224,0)');
    sx.fillStyle = sg; sx.fillRect(0, 0, 64, 64);
    const spriteTex = new THREE.CanvasTexture(sprite);
    const pCount = 360; const pPos = new Float32Array(pCount * 3); const pCol = new Float32Array(pCount * 3);
    const dustCols = [new THREE.Color(0xffffff), new THREE.Color(0xffc0d8), new THREE.Color(0xd6b0ff)];
    for (let i = 0; i < pCount; i++) {
      pPos[i * 3] = rnd(-3.4, 3.4); pPos[i * 3 + 1] = rnd(-3, 3.5); pPos[i * 3 + 2] = rnd(-2.8, 0.7);
      const c = dustCols[i % 3]; pCol[i * 3] = c.r; pCol[i * 3 + 1] = c.g; pCol[i * 3 + 2] = c.b;
    }
    const bgGeo = new THREE.BufferGeometry();
    bgGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    bgGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
    const bgParticles = new THREE.Points(bgGeo, new THREE.PointsMaterial({ map: spriteTex, size: 0.16, transparent: true, opacity: 0.42, depthWrite: false, sizeAttenuation: true, vertexColors: true }));
    scene.add(bgParticles);

    const bloom = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({ map: spriteTex, color: 0xff9fb5, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
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
    const purpleRim = new THREE.DirectionalLight(0x9b6bff, 1.15); purpleRim.position.set(-2.5, -0.5, -3.5); scene.add(purpleRim);
    const glassRim = new THREE.DirectionalLight(0xffffff, 0.9); glassRim.position.set(2.5, 0.5, -3.0); scene.add(glassRim); // back rim to define glass edges
    const topLight = new THREE.PointLight(0xffffff, 0.9, 4); topLight.position.set(0, 2.5, 2); scene.add(topLight);
    const pinkAtmos = new THREE.PointLight(0xffb0c8, 0.35, 8); pinkAtmos.position.set(-1.2, 0.4, 1.6); scene.add(pinkAtmos); // soft pink atmosphere
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

      // Vial — suspended in fluid: weightless ~11s float, no spin. Vertical
      // float dominant; rotation kept under 1° so it never reads as "spinning".
      const L11 = (Math.PI * 2) / 11;
      vialGroup.rotation.y = Math.sin(t * L11) * 0.014;        // ~0.8°
      vialGroup.rotation.x = Math.sin(t * L11 * 0.5) * 0.008;  // ~0.45°
      vialGroup.rotation.z = 0.34 + Math.sin(t * L11 * 0.7) * 0.010;
      vialGroup.position.y = -0.15 + Math.sin(t * L11) * 0.05; // gentle vertical rise/fall
      vialGroup.position.x = -0.2 + Math.cos(t * L11 * 0.6) * 0.010;

      // Contact shadow tracks the float — grows softer/larger as the vial lifts.
      const lift = vialGroup.position.y + 0.15; // deviation from rest
      contactShadow.position.x = vialGroup.position.x;
      const csScale = 1 + lift * 1.1;
      contactShadow.scale.set(csScale, csScale, 1);
      (contactShadow.material as THREE.MeshBasicMaterial).opacity = 0.9 - lift * 2.0;

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

      const ocx = -0.2, ocy = 0.0; // orbit the vial centre
      for (const r of rbcs) {
        const ang = r.phase + t * r.speed;
        const yaw = r.yaw0 + t * r.precess;
        const lx = Math.cos(ang) * r.a;
        const lz = Math.sin(ang) * r.b;
        const ly = Math.sin(t * 0.4 + r.phase) * 0.12;
        const cy1 = ly * Math.cos(r.incl) - lz * Math.sin(r.incl);
        const cz1 = ly * Math.sin(r.incl) + lz * Math.cos(r.incl);
        const px = lx * Math.cos(yaw) + cz1 * Math.sin(yaw);
        const pz = -lx * Math.sin(yaw) + cz1 * Math.cos(yaw);
        r.mesh.position.set(ocx + px, ocy + cy1, pz);
        r.mesh.rotation.x += r.spin.x; r.mesh.rotation.y += r.spin.y; r.mesh.rotation.z += r.spin.z;
        // depth: nearer (higher z) = sharper/bigger, farther = fainter/smaller
        const depth = Math.max(0, Math.min(1, (pz + 1.0) / 1.8));
        r.mat.opacity = r.baseOp * (0.5 + depth * 0.5);
        const ds = r.baseScale * (0.82 + depth * 0.28);
        r.mesh.scale.set(ds, ds, r.baseScale * 0.24);
      }

      cellGroup.rotation.y += 0.0008; cellGroup.rotation.x += 0.0005;
      const cp = 1 + Math.sin(t * 1.0) * 0.04; membrane.scale.setScalar(cp); cellGlow.scale.setScalar(cp * 1.02); nucleus.scale.setScalar(0.92 + Math.sin(t * 0.8) * 0.05);
      cellGroup.position.y = 0.12 + Math.sin(t * 0.42) * 0.07;
      cellLight.intensity = 0.4 + Math.sin(t * 1.4) * 0.2;
      cellDots.forEach((d) => { d.mesh.position.x = d.orig.x + Math.sin(t + d.offset) * 0.06; d.mesh.position.y = d.orig.y + Math.cos(t + d.offset) * 0.06; });

      rippleMat.uniforms.uTime.value = t;
      shimmerMat.uniforms.uTime.value = t;
      rippleMesh.scale.setScalar(1 + Math.sin(t * 0.5) * 0.05); // slow holographic pulse
      for (const rr of rings) {
        const p = (t * 0.2 + rr.offset) % 1.0;
        const s = 0.5 + p * 3.1; // expand outward
        rr.mesh.scale.set(s, s * 0.42, 1); // squash into a ground ellipse
        (rr.mesh.material as THREE.MeshBasicMaterial).opacity = Math.sin(p * Math.PI) * 0.5; // bloom in, fade out
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
      labelTex.dispose(); spriteTex.dispose(); ringTex.dispose(); shadowTex.dispose(); envRT?.dispose(); pmrem.dispose(); renderer.dispose();
      if (mount.contains(canvas)) mount.removeChild(canvas);
    };
  }, []);

  return <div ref={mountRef} style={{ width: '100%', height: '100%', position: 'relative' }} />;
}
