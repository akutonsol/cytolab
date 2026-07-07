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
    const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 100)
    camera.position.set(0, 0, 5.5)

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

      const outerMat = new THREE.MeshPhysicalMaterial({
        color,
        emissive,
        emissiveIntensity: 0.25,
        transparent: true,
        opacity,
        roughness: 0.3,
        metalness: 0.0,
        clearcoat: 0.8,
        clearcoatRoughness: 0.2,
        side: THREE.DoubleSide,
      })
      g.add(new THREE.Mesh(outerGeo, outerMat))

      // Inner glow sphere
      const innerMat = new THREE.MeshPhysicalMaterial({
        color: nucleusColor,
        emissive: nucleusColor,
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: opacity * 0.6,
        roughness: 0.0,
      })
      g.add(new THREE.Mesh(
        new THREE.SphereGeometry(radius * 0.55, 32, 32),
        innerMat
      ))

      // Nucleus core
      const nucMat = new THREE.MeshBasicMaterial({
        color: nucleusColor,
        transparent: true,
        opacity: 0.9,
      })
      g.add(new THREE.Mesh(
        new THREE.SphereGeometry(radius * 0.28, 16, 16),
        nucMat
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

    // Main large cell — center
    const mainCell = makeCell(
      1.1,
      [0.3, 0.2, 0],
      0x8B2252,  // deep rose
      0xC1121F,  // red emissive
      0.72,
      0xFF4444   // bright red nucleus
    )
    organism.add(mainCell)

    // Satellite cells
    const satellites = [
      { r: 0.55, pos: [-1.4, 0.6, 0.3] as [number,number,number],  c: 0x6B1A6B, e: 0x8B2D8B, o: 0.65, n: 0xC44DCC },
      { r: 0.42, pos: [-0.8, -0.9, 0.5] as [number,number,number], c: 0x5B1A5B, e: 0x7B2D8B, o: 0.55, n: 0xA844BB },
      { r: 0.35, pos: [1.2, -0.7, 0.2] as [number,number,number],  c: 0x7B2020, e: 0xAA3030, o: 0.50, n: 0xFF5555 },
      { r: 0.28, pos: [1.5, 0.5, -0.3] as [number,number,number],  c: 0x5B1A4B, e: 0x8B2D7B, o: 0.45, n: 0xBB44AA },
      { r: 0.22, pos: [-0.3, 1.3, 0.4] as [number,number,number],  c: 0x6B1A3B, e: 0x9B2D5B, o: 0.40, n: 0xDD4488 },
      { r: 0.18, pos: [0.6, 1.1, -0.2] as [number,number,number],  c: 0x7B2040, e: 0xAA3060, o: 0.38, n: 0xFF4466 },
      { r: 0.45, pos: [-1.8, -0.2, -0.4] as [number,number,number],c: 0x4B1A5B, e: 0x6B2D8B, o: 0.42, n: 0x9944CC },
    ]
    const satCells = satellites.map(s => {
      const cell = makeCell(s.r, s.pos, s.c, s.e, s.o, s.n)
      organism.add(cell)
      return cell
    })

    // ── TENDRILS between cells ──
    function makeTendril(from: THREE.Vector3, to: THREE.Vector3, color: number) {
      const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5)
      mid.add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.8,
        (Math.random() - 0.5) * 0.8,
        (Math.random() - 0.5) * 0.4,
      ))
      const curve = new THREE.QuadraticBezierCurve3(from, mid, to)
      const points = curve.getPoints(40)
      const geo = new THREE.BufferGeometry().setFromPoints(points)
      const mat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.25,
      })
      return new THREE.Line(geo, mat)
    }

    const mainPos = new THREE.Vector3(0.3, 0.2, 0)
    satellites.forEach(s => {
      const tendril = makeTendril(
        mainPos,
        new THREE.Vector3(...s.pos),
        0xC1121F
      )
      scene.add(tendril)
    })

    // Connect some satellites to each other
    scene.add(makeTendril(
      new THREE.Vector3(...satellites[0].pos),
      new THREE.Vector3(...satellites[1].pos),
      0x8B2D8B
    ))
    scene.add(makeTendril(
      new THREE.Vector3(...satellites[2].pos),
      new THREE.Vector3(...satellites[3].pos),
      0xAA3030
    ))
    scene.add(makeTendril(
      new THREE.Vector3(...satellites[4].pos),
      new THREE.Vector3(...satellites[5].pos),
      0x9B2D5B
    ))

    // ── PARTICLE FIELD ──
    const particleCount = 300
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
      color: 0xff4d66, // brand pink-red (was orange 0xff6644 — zero-orange rule)
      size: 0.025,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
    })
    const particles = new THREE.Points(pGeo, pMat)
    scene.add(particles)

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
      color: 0xff4444,
      size: 0.035,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
    })
    const orbitPoints = new THREE.Points(orbitGeo, orbitMat)
    orbitPoints.position.set(0.3, 0.2, 0)
    scene.add(orbitPoints)

    // ── LIGHTING ──
    scene.add(new THREE.AmbientLight(0x110008, 1.0))

    const keyLight = new THREE.PointLight(0xff2020, 4.0, 8)
    keyLight.position.set(1, 1, 3)
    scene.add(keyLight)

    const purpleLight = new THREE.PointLight(0x8B2D8B, 3.0, 7)
    purpleLight.position.set(-2, 1, 2)
    scene.add(purpleLight)

    const fillLight = new THREE.PointLight(0xCC3333, 1.5, 6)
    fillLight.position.set(0, -2, 1)
    scene.add(fillLight)

    const rimLight = new THREE.PointLight(0xE63946, 1.0, 5) // brand red (was orange 0xFF6644)
    rimLight.position.set(3, 0, -1)
    scene.add(rimLight)

    // ── ANIMATE ──
    function animate() {
      rafId = requestAnimationFrame(animate)
      const t = clock.getElapsedTime()

      // Mouse tracking
      targetX += (mouseX - targetX) * 0.04
      targetY += (mouseY - targetY) * 0.04
      organism.rotation.y = targetX * 0.5 + t * 0.06
      organism.rotation.x = targetY * 0.3

      // Main cell pulse
      const pulse = 1 + Math.sin(t * 1.2) * 0.04
      mainCell.scale.setScalar(pulse)

      // Satellite cell individual float
      satCells.forEach((cell, i) => {
        cell.position.y = satellites[i].pos[1] + Math.sin(t * 0.5 + i * 1.1) * 0.08
        cell.rotation.y += 0.004 + i * 0.001
        cell.rotation.x += 0.002
        const sp = 1 + Math.sin(t * 0.8 + i) * 0.03
        cell.scale.setScalar(sp)
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
      keyLight.intensity = 3.5 + Math.sin(t * 1.2) * 0.8
      purpleLight.intensity = 2.5 + Math.sin(t * 0.9 + 1) * 0.7

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
