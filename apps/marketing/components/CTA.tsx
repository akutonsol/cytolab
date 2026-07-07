'use client'
import { useEffect, useRef } from 'react'

const BADGES = ['HIPAA', 'CAP', 'CLIA', 'SOC 2', 'FHIR R4', 'HL7']

export default function CTA() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let animId: number
    let t = 0
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight }
    resize()
    window.addEventListener('resize', resize)

    const pts = Array.from({ length: 34 }, () => ({
      x: Math.random() * 800, y: Math.random() * 600,
      vx: (Math.random() - 0.5) * 0.16, vy: (Math.random() - 0.5) * 0.16,
      r: Math.random() * 1.6 + 0.4, o: Math.random() * 0.35 + 0.1,
    }))

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1
      for (let x = 0; x < canvas.width; x += 48) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke() }
      for (let y = 0; y < canvas.height; y += 48) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke() }
      pts.forEach((p, i) => {
        p.x += p.vx; p.y += p.vy
        if (p.x < 0) p.x = canvas.width; if (p.x > canvas.width) p.x = 0
        if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0
        pts.slice(i + 1).forEach(q => {
          const d = Math.hypot(p.x - q.x, p.y - q.y)
          if (d < 120) {
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y)
            ctx.strokeStyle = `rgba(255,255,255,${0.06 * (1 - d / 120)})`; ctx.lineWidth = 1; ctx.stroke()
          }
        })
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,255,255,${p.o})`; ctx.fill()
      })
      t += 0.016
      animId = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize) }
  }, [])

  return (
    <section id="cta" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr',
      background: '#4F46E5', color: '#fff', borderBottom: '1px solid rgba(9,9,14,0.07)' }}>
      {/* LEFT — canvas + big type */}
      <div style={{ position: 'relative', overflow: 'hidden', padding: '5.5rem 3rem 5.5rem 2.5rem',
        borderRight: '1px solid rgba(255,255,255,0.12)', minHeight: '520px',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.9 }} />
        <div style={{
          position: 'absolute',
          bottom: '-0.15em',
          left: '-0.05em',
          fontFamily: 'var(--font-serif)',
          fontSize: '28vw',
          lineHeight: 0.8,
          color: 'rgba(255,255,255,0.04)',
          pointerEvents: 'none',
          userSelect: 'none',
          fontStyle: 'italic',
          letterSpacing: '-0.05em',
          zIndex: 1,
          whiteSpace: 'nowrap',
        }} aria-hidden="true">AI</div>
        <div style={{ position: 'relative', zIndex: 2, lineHeight: 0.9 }}>
          <div><span style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(2.8rem,5vw,5rem)',
            letterSpacing: '-0.03em', color: '#fff' }}>The </span>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(2.8rem,5vw,5rem)',
              letterSpacing: '-0.03em', color: '#fff', fontStyle: 'italic' }}>laboratory</span></div>
          <div><span style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(2.8rem,5vw,5rem)',
            letterSpacing: '-0.03em', color: 'transparent', WebkitTextStroke: '1.5px rgba(255,255,255,0.4)' }}>operating</span></div>
          <div><span style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(2.8rem,5vw,5rem)',
            letterSpacing: '-0.03em', color: '#fff' }}>system your</span></div>
          <div><span style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(2.8rem,5vw,5rem)',
            letterSpacing: '-0.03em', color: '#fff' }}>lab </span>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(2.8rem,5vw,5rem)',
              letterSpacing: '-0.03em', color: 'transparent', WebkitTextStroke: '1.5px rgba(255,255,255,0.4)',
              fontStyle: 'italic' }}>deserves.</span></div>
        </div>
      </div>

      {/* RIGHT — copy + buttons + badges */}
      <div style={{ padding: '5.5rem 2.5rem 5.5rem 3rem', display: 'flex', flexDirection: 'column',
        justifyContent: 'center' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', fontWeight: 700,
          letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)',
          marginBottom: '1.5rem' }}>Get Started</div>
        <p style={{ fontSize: '1.05rem', lineHeight: 1.7, color: 'rgba(255,255,255,0.85)',
          maxWidth: '420px', marginBottom: '2.5rem', fontWeight: 300 }}>
          Join the next generation of pathology laboratories using AI to protect more
          specimens, reduce turnaround time, and improve diagnostic confidence.
        </p>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '3rem' }}>
          <button className="mag-btn" style={{ background: '#09090E', color: '#F0EFE9', border: 'none',
            padding: '14px 30px', borderRadius: '2px', fontFamily: 'var(--font-mono)',
            fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em',
            textTransform: 'uppercase', cursor: 'pointer' }}>Request demo →</button>
          <button className="mag-btn" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.35)',
            color: '#fff', padding: '14px 30px', borderRadius: '2px', fontFamily: 'var(--font-mono)',
            fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em',
            textTransform: 'uppercase', cursor: 'pointer' }}>Schedule consultation</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          {BADGES.map((b) => (
            <span key={b} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(255,255,255,0.25)', borderRadius: '2px', padding: '6px 12px' }}>{b}</span>
          ))}
        </div>
      </div>
    </section>
  )
}
