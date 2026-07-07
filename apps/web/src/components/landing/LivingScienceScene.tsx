'use client'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

export default function LivingScienceScene() {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!mountRef.current) return
    const mount = mountRef.current
    const W = mount.clientWidth || 800
    const H = mount.clientHeight || 600

    // ── RENDERER ──
    const renderer = new THREE.WebGLRenderer({
      antialias: true, alpha: true,
      powerPreference: 'high-performance',
    })
    renderer.setSize(W, H)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)
    // NoToneMapping keeps saturated reds true (ACES shifts them toward orange).
    renderer.toneMapping = THREE.NoToneMapping
    mount.appendChild(renderer.domElement)

    // ── SCENE & CAMERA ──
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(65, W / H, 0.1, 100)
    camera.position.set(0.2, 0.1, 4.2)

    // ── CLOCK ──
    const clock = new THREE.Clock()
    let rafId: number

    // ── MOUSE ──
    let mouseX = 0, mouseY = 0
    let targetX = 0, targetY = 0
    const onMouse = (e: MouseEvent) => {
      const r = mount.getBoundingClientRect()
      mouseX = ((e.clientX - r.left) / r.width - 0.5) * 0.6
      mouseY = -((e.clientY - r.top) / r.height - 0.5) * 0.4
    }
    mount.addEventListener('mousemove', onMouse)

    // ══════════════════════════════════════════
    // CELL FACTORY — creates one organic cell
    // ══════════════════════════════════════════
    function makeCell(
      radius: number,
      pos: [number, number, number],
      color: number,
      emissive: number,
      opacity: number,
      nucleusColor: number
    ) {
      const g = new THREE.Group()
      g.position.set(...pos)

      // Outer membrane — low-poly icosphere for organic look
      const outerGeo = new THREE.IcosahedronGeometry(radius, 2)
      const posAttr = outerGeo.attributes.position
      for (let i = 0; i < posAttr.count; i++) {
        posAttr.setXYZ(
          i,
          posAttr.getX(i) * (1 + (Math.random() - 0.5) * 0.12),
          posAttr.getY(i) * (1 + (Math.random() - 0.5) * 0.12),
          posAttr.getZ(i) * (1 + (Math.random() - 0.5) * 0.12),
        )
      }
      outerGeo.computeVertexNormals()

      // Membrane — dark purple-brown, matte
      const outerMat = new THREE.MeshPhysicalMaterial({
        color,
        emissive,
        emissiveIntensity: 0.15,
        transparent: true,
        opacity,
        roughness: 0.6,
        metalness: 0.0,
        clearcoat: 0.4,
        clearcoatRoughness: 0.5,
        side: THREE.DoubleSide,
      })
      g.add(new THREE.Mesh(outerGeo, outerMat))

      // Inner glow sphere — warm orange-red glow
      const innerMat = new THREE.MeshPhysicalMaterial({
        color: nucleusColor,
        emissive: 0xFF6633,
        emissiveIntensity: 1.8,
        transparent: true,
        opacity: 0.65,
        roughness: 0.0,
      })
      g.add(new THREE.Mesh(
        new THREE.SphereGeometry(radius * 0.55, 32, 32),
        innerMat
      ))

      // Nucleus core — extremely bright amber
      const nucMat = new THREE.MeshBasicMaterial({
        color: 0xFF8844,
      })
      g.add(new THREE.Mesh(
        new THREE.SphereGeometry(radius * 0.28, 16, 16),
        nucMat
      ))

      // Honeycomb / faceted texture layer
      g.add(new THREE.Mesh(
        new THREE.IcosahedronGeometry(radius * 0.98, 1),
        new THREE.MeshBasicMaterial({ color: 0xFF4422, wireframe: true, transparent: true, opacity: 0.08 })
      ))

      // Wireframe overlay
      const wireMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.12,
        wireframe: true,
      })
      g.add(new THREE.Mesh(
        new THREE.IcosahedronGeometry(radius * 1.02, 2),
        wireMat
      ))

      return g
    }

    // ══════════════════════════════════════════
    // BUILD ORGANISM — main cell + satellites
    // ══════════════════════════════════════════

    const organism = new THREE.Group()
    scene.add(organism)
    organism.scale.setScalar(1.55)

    // Main large cell — center
    const mainCell = makeCell(
      1.1,
      [0.3, 0.2, 0],
      0x3D1520,  // very dark purple-brown membrane
      0x6B2030,  // deep wine emissive
      0.82,
      0xFF6633   // warm nucleus glow
    )
    organism.add(mainCell)

    // Satellite cells — dark purple membranes, warm inner glows
    const satellites = [
      { r: 0.55, pos: [-2.0, 0.9, 0.4] as [number,number,number],  c: 0x2D1535, e: 0x5B2060, o: 0.70, n: 0xCC44AA },
      { r: 0.42, pos: [-1.2, -1.4, 0.6] as [number,number,number], c: 0x351520, e: 0x602040, o: 0.60, n: 0xFF4422 },
      { r: 0.35, pos: [1.8, -1.0, 0.3] as [number,number,number],  c: 0x2A1530, e: 0x4B2055, o: 0.55, n: 0xAA44CC },
      { r: 0.28, pos: [2.2, 0.7, -0.4] as [number,number,number],  c: 0x351825, e: 0x602845, o: 0.50, n: 0xFF5533 },
      { r: 0.22, pos: [-0.4, 1.8, 0.5] as [number,number,number],  c: 0x2D1530, e: 0x502055, o: 0.45, n: 0xCC3399 },
      { r: 0.18, pos: [0.9, 1.6, -0.3] as [number,number,number],  c: 0x351520, e: 0x602035, o: 0.42, n: 0xFF4422 },
      { r: 0.45, pos: [-2.4, -0.4, -0.5] as [number,number,number],c: 0x2A1535, e: 0x4B2060, o: 0.48, n: 0xBB44BB },
    ]
    const satCells = satellites.map(s => {
      const cell = makeCell(s.r, s.pos, s.c, s.e, s.o, s.n)
      organism.add(cell)
      return cell
    })

    // ── TENDRILS between cells ──
    function makeTendril(
      from: THREE.Vector3,
      to: THREE.Vector3,
      color: number,
      opacity: number = 0.4
    ) {
      const mid1 = new THREE.Vector3().lerpVectors(from, to, 0.33)
      const mid2 = new THREE.Vector3().lerpVectors(from, to, 0.66)
      mid1.add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 0.3,
      ))
      mid2.add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.2,
      ))
      const curve = new THREE.CatmullRomCurve3([from, mid1, mid2, to])
      const points = curve.getPoints(60)
      const geo = new THREE.BufferGeometry().setFromPoints(points)

      // Main tendril line
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity })
      const line = new THREE.Line(geo, mat)

      // Glow tendril (thicker, more transparent)
      const glowMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: opacity * 0.3, linewidth: 2 })
      const glowLine = new THREE.Line(geo.clone(), glowMat)

      const group = new THREE.Group()
      group.add(line)
      group.add(glowLine)
      return group
    }

    const mainPos = new THREE.Vector3(0.3, 0.2, 0)
    organism.add(makeTendril(mainPos, new THREE.Vector3(...satellites[0].pos), 0xFF6633, 0.5))
    organism.add(makeTendril(mainPos, new THREE.Vector3(...satellites[1].pos), 0xFF4422, 0.45))
    organism.add(makeTendril(mainPos, new THREE.Vector3(...satellites[2].pos), 0xCC44AA, 0.42))
    organism.add(makeTendril(mainPos, new THREE.Vector3(...satellites[3].pos), 0xFF5533, 0.38))
    organism.add(makeTendril(mainPos, new THREE.Vector3(...satellites[4].pos), 0xCC3399, 0.35))
    organism.add(makeTendril(mainPos, new THREE.Vector3(...satellites[5].pos), 0xFF4422, 0.32))
    organism.add(makeTendril(mainPos, new THREE.Vector3(...satellites[6].pos), 0xBB44BB, 0.40))
    // Inter-satellite connections
    organism.add(makeTendril(
      new THREE.Vector3(...satellites[0].pos),
      new THREE.Vector3(...satellites[4].pos), 0xAA3399, 0.28))
    organism.add(makeTendril(
      new THREE.Vector3(...satellites[2].pos),
      new THREE.Vector3(...satellites[3].pos), 0xFF4422, 0.25))

    // ── PARTICLE FIELD ── (warm amber, denser)
    const particleCount = 500
    const pPositions = new Float32Array(particleCount * 3)
    const pData: { vy: number; phase: number }[] = []
    for (let i = 0; i < particleCount; i++) {
      pPositions[i * 3]     = (Math.random() - 0.5) * 8
      pPositions[i * 3 + 1] = (Math.random() - 0.5) * 6
      pPositions[i * 3 + 2] = (Math.random() - 0.5) * 4
      pData.push({ vy: 0.0003 + Math.random() * 0.0008, phase: Math.random() * Math.PI * 2 })
    }
    const pGeo = new THREE.BufferGeometry()
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3))
    const pMat = new THREE.PointsMaterial({
      color: 0xFF8833,     // warm amber
      size: 0.018,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })
    const particles = new THREE.Points(pGeo, pMat)
    scene.add(particles)

    // Second particle layer — smaller purple particles
    const pCount2 = 200
    const pPos2 = new Float32Array(pCount2 * 3)
    for (let i = 0; i < pCount2; i++) {
      pPos2[i * 3]     = (Math.random() - 0.5) * 6
      pPos2[i * 3 + 1] = (Math.random() - 0.5) * 5
      pPos2[i * 3 + 2] = (Math.random() - 0.5) * 3
    }
    const pGeo2 = new THREE.BufferGeometry()
    pGeo2.setAttribute('position', new THREE.BufferAttribute(pPos2, 3))
    const pMat2 = new THREE.PointsMaterial({
      color: 0xAA44CC,
      size: 0.012,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
    })
    scene.add(new THREE.Points(pGeo2, pMat2))

    // ── ORBITAL RING PARTICLES around main cell ──
    const orbitCount = 80
    const orbitData: { angle: number; speed: number; radius: number; y: number }[] = []
    const orbitGeo = new THREE.BufferGeometry()
    const orbitPos = new Float32Array(orbitCount * 3)
    for (let i = 0; i < orbitCount; i++) {
      const angle = (i / orbitCount) * Math.PI * 2
      const r = 1.4 + Math.random() * 0.4
      orbitData.push({
        angle,
        speed: 0.003 + Math.random() * 0.005,
        radius: r,
        y: (Math.random() - 0.5) * 0.8,
      })
      orbitPos[i * 3]     = Math.cos(angle) * r
      orbitPos[i * 3 + 1] = orbitData[i].y
      orbitPos[i * 3 + 2] = Math.sin(angle) * r
    }
    orbitGeo.setAttribute('position', new THREE.BufferAttribute(orbitPos, 3))
    const orbitMat = new THREE.PointsMaterial({
      color: 0xFF8833,
      size: 0.04,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    })
    const orbitPoints = new THREE.Points(orbitGeo, orbitMat)
    orbitPoints.position.set(0.3, 0.2, 0)
    organism.add(orbitPoints)

    // ── LIGHTING ──
    // Very dim ambient — almost nothing
    scene.add(new THREE.AmbientLight(0x0d0508, 0.8))

    // WARM AMBER KEY LIGHT — the "golden biology" look
    const keyLight = new THREE.PointLight(0xFF8833, 6.0, 10)
    keyLight.position.set(2.0, 1.5, 3.5)
    scene.add(keyLight)

    // ORANGE RIM LIGHT — from below-right
    const rimLight = new THREE.PointLight(0xFF5522, 3.5, 8)
    rimLight.position.set(2.5, -1.5, 1.5)
    scene.add(rimLight)

    // PURPLE FILL — from left
    const purpleLight = new THREE.PointLight(0x8822AA, 4.0, 9)
    purpleLight.position.set(-2.5, 1.0, 1.5)
    scene.add(purpleLight)

    // COOL BLUE BACK — rim from behind
    const backLight = new THREE.PointLight(0x224488, 2.0, 7)
    backLight.position.set(-1.0, 0.0, -3.0)
    scene.add(backLight)

    // NUCLEUS GLOW — point light at center of main cell
    const nucleusLight = new THREE.PointLight(0xFF6633, 5.0, 4)
    nucleusLight.position.set(0.3, 0.2, 0.5)
    scene.add(nucleusLight)

    // ── ANIMATE ──
    function animate() {
      rafId = requestAnimationFrame(animate)
      const t = clock.getElapsedTime()

      // Mouse tracking
      targetX += (mouseX - targetX) * 0.04
      targetY += (mouseY - targetY) * 0.04

      // Organism slow rotation — not uniform, slightly wobbly
      organism.rotation.y = targetX * 0.5 + t * 0.055
      organism.rotation.x = targetY * 0.3 + Math.sin(t * 0.15) * 0.05
      organism.rotation.z = Math.sin(t * 0.12) * 0.03

      // Main cell irregular breathing (more organic than a single sine)
      const breathe = Math.sin(t * 0.7) * 0.5 + Math.sin(t * 1.3) * 0.25 + Math.sin(t * 2.1) * 0.1
      mainCell.scale.setScalar(1.0 + breathe * 0.04)

      // Satellite cells — own breathing rhythms + drift
      satCells.forEach((cell, i) => {
        const phase = i * 0.8
        const satBreathe = Math.sin(t * 0.5 + phase) * 0.4 + Math.sin(t * 1.1 + phase) * 0.2
        cell.scale.setScalar(1.0 + satBreathe * 0.05)
        cell.rotation.y += 0.003 + i * 0.0005
        cell.rotation.z += 0.001 + i * 0.0003
        cell.position.y = satellites[i].pos[1] + Math.sin(t * 0.4 + phase) * 0.12
      })

      // Orbit particles
      const oPos = orbitGeo.attributes.position.array as Float32Array
      for (let i = 0; i < orbitCount; i++) {
        orbitData[i].angle += orbitData[i].speed
        oPos[i * 3]     = Math.cos(orbitData[i].angle) * orbitData[i].radius
        oPos[i * 3 + 1] = orbitData[i].y + Math.sin(t * 0.3 + i) * 0.05
        oPos[i * 3 + 2] = Math.sin(orbitData[i].angle) * orbitData[i].radius
      }
      orbitGeo.attributes.position.needsUpdate = true

      // Background particles drift
      const bPos = pGeo.attributes.position.array as Float32Array
      for (let i = 0; i < particleCount; i++) {
        bPos[i * 3 + 1] += pData[i].vy
        if (bPos[i * 3 + 1] > 3) bPos[i * 3 + 1] = -3
        bPos[i * 3]     += Math.sin(t * 0.2 + pData[i].phase) * 0.0005
      }
      pGeo.attributes.position.needsUpdate = true

      // Lights breathe
      keyLight.intensity = 5.5 + Math.sin(t * 0.8) * 0.8
      purpleLight.intensity = 3.5 + Math.sin(t * 0.6 + 1.0) * 0.8

      // Nucleus light — heartbeat rhythm (double-pulse), follows main cell
      const heartbeat = Math.sin(t * 3.0) * Math.sin(t * 3.0)
      nucleusLight.intensity = 3.0 + heartbeat * 3.5
      nucleusLight.position.x = 0.3 + Math.sin(t * 0.5) * 0.1
      nucleusLight.position.y = 0.2 + Math.cos(t * 0.5) * 0.1

      // Camera slow drift for cinematic feel
      camera.position.x = 0.2 + Math.sin(t * 0.08) * 0.15
      camera.position.y = 0.1 + Math.cos(t * 0.06) * 0.10
      camera.lookAt(0.3, 0.2, 0)

      renderer.render(scene, camera)
    }
    animate()

    // ── RESIZE ──
    const onResize = () => {
      const w = mount.clientWidth
      const h = mount.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', onResize)

    // ── CLEANUP ──
    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', onResize)
      mount.removeEventListener('mousemove', onMouse)
      renderer.dispose()
      scene.traverse(obj => {
        const mesh = obj as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
        if (mesh.material) {
          if (Array.isArray(mesh.material)) mesh.material.forEach(m => m.dispose())
          else mesh.material.dispose()
        }
      })
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
    }
  }, [])

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
}
