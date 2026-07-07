'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';

/**
 * Cinematic, physically-based hero: a magnetically-levitating blood-specimen
 * vial photographed on white — RectAreaLight softbox + warm rim, real glass
 * (transmission + Fresnel + reflections), volumetric crimson blood with an
 * animated meniscus and rising bubbles, an orbital field of blood cells
 * spiralling under an EM-field illusion, a levitation light-beam with
 * illuminated dust, and a soft liquid-energy ripple beneath.
 *
 * Rendered directly on a TRANSPARENT canvas over the section's white-radial CSS
 * background. Post-processing bloom/DOF are intentionally avoided: over a bright
 * white background they bloom the background into haze and soften the subject.
 * Glow is faked with emissive materials + additive planes; depth is faked with
 * per-cell opacity — which keeps the vial crisp and the render clean.
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
    renderer.toneMappingExposure = 1.1;
    const canvas = renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    mount.appendChild(canvas);

    const scene = new THREE.Scene();

    // 85mm ≈ 38° FOV, eye level, focused on the tube
    const camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 100);
    camera.position.set(0, 0.05, 4.5);
    camera.lookAt(0, 0.05, 0);

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

    // ── Softbox lighting rig ─────────────────────────────────
    RectAreaLightUniformsLib.init();
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const softbox = new THREE.RectAreaLight(0xffffff, 4.0, 5, 4);
    softbox.position.set(0.5, 4, 2.6);
    softbox.lookAt(0, 0, 0);
    scene.add(softbox);
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(3, 4, 4);
    scene.add(key);
    const coolFill = new THREE.DirectionalLight(0xdcebff, 1.0);
    coolFill.position.set(-4, 1.5, 3);
    scene.add(coolFill);
    const warmRim = new THREE.DirectionalLight(0xff3546, 1.8);
    warmRim.position.set(3.5, 0.3, -2.6);
    scene.add(warmRim);
    const bounce = new THREE.PointLight(0xff2436, 0.6, 5);
    bounce.position.set(0, -1.4, 1.2);
    scene.add(bounce);

    // ── Vial ─────────────────────────────────────────────────
    const vialGroup = new THREE.Group();
    scene.add(vialGroup);

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, metalness: 0, roughness: 0.05, transmission: 0.9, thickness: 0.5, ior: 1.5,
      reflectivity: 0.9, clearcoat: 1.0, clearcoatRoughness: 0.04, iridescence: 0.12, iridescenceIOR: 1.3,
      envMapIntensity: 2.6, transparent: true, opacity: 0.16, side: THREE.DoubleSide,
      attenuationColor: new THREE.Color(0xeef4ff), attenuationDistance: 3.0,
    });
    const R = 0.2;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 1.15, 96, 1, true), glassMat);
    vialGroup.add(body);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 48, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), glassMat);
    dome.position.y = -0.575;
    vialGroup.add(dome);
    const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.15, R, 0.14, 96, 1, true), glassMat);
    shoulder.position.y = 0.645;
    vialGroup.add(shoulder);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.09, 96, 1, true), glassMat);
    neck.position.y = 0.76;
    vialGroup.add(neck);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.013, 16, 64), glassMat);
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 0.805;
    vialGroup.add(lip);

    const capMat = new THREE.MeshPhysicalMaterial({
      color: 0xc1121f, roughness: 0.62, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.5,
      sheen: 0.4, sheenColor: new THREE.Color(0xff6b74), emissive: 0x2a0407, emissiveIntensity: 0.3,
    });
    const capGroup = new THREE.Group();
    const capBody = new THREE.Mesh(new THREE.CylinderGeometry(0.168, 0.168, 0.15, 64), capMat);
    capGroup.add(capBody);
    const capTop = new THREE.Mesh(new THREE.SphereGeometry(0.168, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
    capTop.position.y = 0.075;
    capTop.scale.y = 0.5;
    capGroup.add(capTop);
    capGroup.position.y = 0.9;
    vialGroup.add(capGroup);

    // ── Label ────────────────────────────────────────────────
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 300;
    labelCanvas.height = 400;
    const lctx = labelCanvas.getContext('2d')!;
    lctx.fillStyle = '#ffffff';
    lctx.fillRect(0, 0, 300, 400);
    lctx.fillStyle = '#1a1a2e';
    lctx.font = 'bold 40px Inter, Arial, sans-serif';
    lctx.textAlign = 'center';
    lctx.fillText('CYTOLAB', 150, 62);
    lctx.fillStyle = '#C1121F';
    lctx.fillRect(140, 84, 20, 48);
    lctx.fillRect(126, 98, 48, 20);
    lctx.fillStyle = '#1a1a2e';
    lctx.font = '17px Inter, Arial, sans-serif';
    lctx.textAlign = 'left';
    lctx.fillText('SPECIMEN ID: DM26-07-908', 26, 178);
    for (let i = 0; i < 34; i++) lctx.fillRect(26 + i * 7, 196, 1 + (i % 3), 52);
    lctx.font = '15px Inter, Arial, sans-serif';
    lctx.textAlign = 'center';
    lctx.fillStyle = '#6b7280';
    lctx.fillText('CYTOLOGY · PATHOLOGY', 150, 340);
    const labelTex = new THREE.CanvasTexture(labelCanvas);
    labelTex.anisotropy = 8;
    labelTex.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(R + 0.003, R + 0.003, 0.42, 96, 1, true, -0.9, 1.8),
      new THREE.MeshStandardMaterial({ map: labelTex, color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide }),
    );
    label.position.y = 0.02;
    vialGroup.add(label);

    // ── Volumetric blood ─────────────────────────────────────
    const fillFrac = 0.42;
    const bodyBottom = -0.575;
    const bloodH = 1.15 * fillFrac;
    const bloodTopY = bodyBottom + bloodH;
    const bloodMat = new THREE.MeshPhysicalMaterial({
      color: 0x8b0010, metalness: 0.1, roughness: 0.14, transmission: 0.12, thickness: 1.1, ior: 1.36,
      attenuationColor: new THREE.Color(0x4a0006), attenuationDistance: 0.4,
      sheen: 0.5, sheenColor: new THREE.Color(0xb51a2a), sheenRoughness: 0.4,
      emissive: 0x33000a, emissiveIntensity: 0.5, transparent: true, opacity: 0.99,
    });
    const bloodColumn = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.185, bloodH, 64), bloodMat);
    bloodColumn.position.y = bodyBottom + bloodH / 2;
    vialGroup.add(bloodColumn);
    const bloodDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.185, 64, 32, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
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
          float meniscus = pow(r / 0.185, 3.0) * 0.02;
          float wave = sin(r * 22.0 - uTime * 1.6) * 0.0025;
          p.z += meniscus + wave;
          vN = normalize(vec3(-p.x, -p.y, 1.4));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        varying float vR; varying vec3 vN;
        void main(){
          vec3 deep = vec3(0.36,0.01,0.05); vec3 edge = vec3(0.62,0.06,0.11);
          vec3 col = mix(edge, deep, smoothstep(0.0, 0.185, vR));
          col += pow(1.0 - abs(vN.z), 2.0) * vec3(0.55,0.16,0.20);
          gl_FragColor = vec4(col, 0.97);
        }`,
    });
    const bloodSurface = new THREE.Mesh(new THREE.CircleGeometry(0.185, 96), surfMat);
    bloodSurface.rotation.x = -Math.PI / 2;
    bloodSurface.position.y = bloodTopY;
    vialGroup.add(bloodSurface);

    interface Bubble { mesh: THREE.Mesh; speed: number; x: number; z: number }
    const bubbles: Bubble[] = [];
    const bubbleMat = new THREE.MeshPhysicalMaterial({ color: 0xff8890, roughness: 0.1, transmission: 0.6, thickness: 0.05, transparent: true, opacity: 0.5 });
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(rnd(0.006, 0.016), 10, 8), bubbleMat);
      const ang = Math.random() * Math.PI * 2;
      const rad = rnd(0, 0.15);
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      m.position.set(x, rnd(bodyBottom, bloodTopY), z);
      vialGroup.add(m);
      bubbles.push({ mesh: m, speed: rnd(0.03, 0.09), x, z });
    }

    // ── Orbital blood-cell field ─────────────────────────────
    interface Cell {
      mesh: THREE.Mesh; a: number; b: number; incl: number; yaw0: number; precess: number;
      phase: number; speed: number; bob: number; bobSpeed: number; spin: THREE.Vector3;
    }
    const cells: Cell[] = [];
    const rbcGeo = new THREE.SphereGeometry(1, 20, 12);
    const wbcGeo = new THREE.SphereGeometry(1, 24, 16);
    function addCell(kind: 'rbc' | 'wbc') {
      const rad = rnd(0.5, 1.9);
      let mesh: THREE.Mesh;
      if (kind === 'rbc') {
        const mat = new THREE.MeshPhysicalMaterial({
          color: 0xc1121f, roughness: 0.28, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.3,
          sheen: 0.5, sheenColor: new THREE.Color(0xff5a66), emissive: 0x3a040a, emissiveIntensity: 0.35,
          transparent: true, opacity: rad > 1.4 ? 0.55 : 0.95, side: THREE.DoubleSide,
        });
        mesh = new THREE.Mesh(rbcGeo, mat);
        const s = rnd(0.045, 0.075);
        mesh.scale.set(s, s, s * 0.34);
      } else {
        const mat = new THREE.MeshPhysicalMaterial({
          color: 0xf3ecff, roughness: 0.5, metalness: 0, transmission: 0.5, thickness: 0.3, ior: 1.35,
          transparent: true, opacity: 0.5, sheen: 0.6, sheenColor: new THREE.Color(0xe8dcff),
        });
        mesh = new THREE.Mesh(wbcGeo, mat);
        mesh.scale.setScalar(rnd(0.1, 0.14));
      }
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      scene.add(mesh);
      cells.push({
        mesh, a: rad, b: rad * rnd(0.55, 0.9), incl: rnd(-0.55, 0.55), yaw0: Math.random() * Math.PI * 2,
        precess: rnd(-0.02, 0.02), phase: Math.random() * Math.PI * 2,
        speed: rnd(0.03, 0.11) * (Math.random() < 0.5 ? 1 : -1),
        bob: rnd(0.05, 0.22), bobSpeed: rnd(0.15, 0.5),
        spin: new THREE.Vector3(rnd(0.002, 0.006), rnd(0.002, 0.006), rnd(0.001, 0.004)),
      });
    }
    for (let i = 0; i < 40; i++) addCell('rbc');
    for (let i = 0; i < 6; i++) addCell('wbc');

    // ── Levitation beam + illuminated dust ───────────────────
    const beamMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xffd2d8) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
        void main(){
          float edge = smoothstep(0.5, 0.0, abs(vUv.x - 0.5));
          float vert = smoothstep(0.0, 1.0, vUv.y);
          float pulse = 0.8 + 0.2 * sin(uTime * 1.3);
          gl_FragColor = vec4(uColor, edge * vert * 0.14 * pulse);
        }`,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.55, 1.8, 48, 1, true), beamMat);
    beam.position.y = -1.55;
    vialGroup.add(beam);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffd0d6, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.14, 32), coreMat);
    core.rotation.x = -Math.PI / 2;
    core.position.y = -0.66;
    vialGroup.add(core);

    const dustCount = 70;
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      const ang = Math.random() * Math.PI * 2, rad = rnd(0, 0.4);
      dustPos[i * 3] = Math.cos(ang) * rad;
      dustPos[i * 3 + 1] = rnd(-2.4, -0.6);
      dustPos[i * 3 + 2] = Math.sin(ang) * rad;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xffe4e8, size: 0.02, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    vialGroup.add(dust);

    // ── Liquid-energy ripple ─────────────────────────────────
    const rippleMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xe63946) }, uBreath: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform float uTime; uniform vec3 uColor; uniform float uBreath; varying vec2 vUv;
        void main(){
          vec2 c = (vUv - 0.5) * 2.0; float r = length(c);
          if (r > 1.0) discard;
          float rings = smoothstep(0.45, 1.0, sin(r * 20.0 * uBreath - uTime * 2.0));
          float inner = smoothstep(0.06, 0.30, r);
          float outer = smoothstep(1.0, 0.35, r);
          gl_FragColor = vec4(uColor, rings * inner * outer * 0.24);
        }`,
    });
    const ripple = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), rippleMat);
    ripple.rotation.x = -Math.PI / 2;
    ripple.position.y = -0.9;
    vialGroup.add(ripple);

    // ── Background depth particles ───────────────────────────
    const pCount = 130;
    const pPos = new Float32Array(pCount * 3);
    const pCol = new Float32Array(pCount * 3);
    const pink = new THREE.Color(0xffd7dd), white = new THREE.Color(0xffffff);
    for (let i = 0; i < pCount; i++) {
      pPos[i * 3] = rnd(-3, 3); pPos[i * 3 + 1] = rnd(-3.5, 3.5); pPos[i * 3 + 2] = rnd(-2.5, -0.5);
      const c = Math.random() < 0.5 ? pink : white;
      pCol[i * 3] = c.r; pCol[i * 3 + 1] = c.g; pCol[i * 3 + 2] = c.b;
    }
    const bgGeo = new THREE.BufferGeometry();
    bgGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    bgGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
    const bgParticles = new THREE.Points(bgGeo, new THREE.PointsMaterial({ size: 0.02, transparent: true, opacity: 0.45, vertexColors: true, depthWrite: false }));
    scene.add(bgParticles);

    // ── Animation ────────────────────────────────────────────
    const clock = new THREE.Clock();
    let raf = 0;
    const tilt = (18 * Math.PI) / 180;
    let sloshVel = 0, lastRotY = 0;

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      vialGroup.rotation.y += 0.0035;
      vialGroup.rotation.z = tilt + Math.sin(t * 0.4) * 0.01;
      vialGroup.position.y = Math.sin(t * 0.5) * 0.05;
      vialGroup.position.x = Math.sin(t * 0.28) * 0.015;

      const dRot = vialGroup.rotation.y - lastRotY;
      lastRotY = vialGroup.rotation.y;
      sloshVel += (dRot * 6 - sloshVel) * 0.04;
      const slosh = Math.sin(t * 0.9) * 0.01 + sloshVel;
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
        c.mesh.position.set(lx * Math.cos(yaw) + cz1 * Math.sin(yaw), cy1, -lx * Math.sin(yaw) + cz1 * Math.cos(yaw));
        c.mesh.rotation.x += c.spin.x;
        c.mesh.rotation.y += c.spin.y;
        c.mesh.rotation.z += c.spin.z;
      }

      beamMat.uniforms.uTime.value = t;
      coreMat.opacity = 0.38 + Math.sin(t * 1.3) * 0.12;
      const dp = dustGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < dustCount; i++) {
        let y = dp.getY(i) + 0.004;
        if (y > -0.55) y = -2.4;
        dp.setY(i, y);
      }
      dp.needsUpdate = true;
      rippleMat.uniforms.uTime.value = t;
      rippleMat.uniforms.uBreath.value = 1 + Math.sin(t * 0.6) * 0.08 + sloshVel * 3;

      const bp = bgGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pCount; i++) {
        let y = bp.getY(i) + 0.0015;
        if (y > 3.5) y = -3.5;
        bp.setY(i, y);
      }
      bp.needsUpdate = true;

      camera.position.z = 4.5 - Math.sin(t * 0.1) * 0.12;
      camera.position.x = Math.sin(t * 0.07) * 0.04;
      camera.lookAt(0, 0.05, 0);

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
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else if (mat) mat.dispose();
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
