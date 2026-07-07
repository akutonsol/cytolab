'use client'
import { useEffect, useRef } from 'react'
import SectionReveal from './SectionReveal'

export default function CTA() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let animId: number

    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight }
    resize()
    window.addEventListener('resize', resize)

    const lines = Array.from({ length: 18 }, () => ({
      x: Math.random() * 1200, y: Math.random() * 700,
      len: Math.random() * 100 + 30,
      angle: Math.random() * Math.PI,
      spd: (Math.random() - 0.5) * 0.2,
      o: Math.random() * 0.05 + 0.01,
    }))

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      lines.forEach(l => {
        l.x += Math.cos(l.angle) * l.spd; l.y += Math.sin(l.angle) * l.spd
        if (l.x < -200) l.x = canvas.width + 200
        if (l.x > canvas.width + 200) l.x = -200
        ctx.beginPath(); ctx.moveTo(l.x, l.y)
        ctx.lineTo(l.x + Math.cos(l.angle) * l.len, l.y + Math.sin(l.angle) * l.len)
        ctx.strokeStyle = `rgba(255,255,255,${l.o})`; ctx.lineWidth = 0.5; ctx.stroke()
      })
      animId = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize) }
  }, [])

  const sTag = (label: string) => (
    <div style={{
      fontFamily: 'var(--font-mono)', fontSize: '0.55rem', fontWeight: 700,
      letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)',
      display: 'flex', alignItems: 'center', gap: '9px',
    }}>
      <span style={{ width: 18, height: 1, background: 'rgba(255,255,255,0.18)', display: 'inline-block' }} />
      {label}
    </div>
  )

  return (
    <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: '#4F46E5' }}>
      <div style={{ padding: '7rem 3rem 7rem 2.5rem', borderRight: '1px solid rgba(255,255,255,0.1)', position: 'relative', overflow: 'hidden' }}>
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
        {/* Ghost AI text */}
        <div style={{
          position: 'absolute', bottom: '-0.15em', left: '-0.05em',
          fontFamily: 'var(--font-serif)', fontSize: '35vw', lineHeight: 0.8,
          color: 'rgba(255,255,255,0.055)', pointerEvents: 'none', userSelect: 'none',
          fontStyle: 'italic', letterSpacing: '-0.05em', zIndex: 1, whiteSpace: 'nowrap',
        }} aria-hidden="true">AI</div>
        <SectionReveal>
          <div style={{ position: 'relative', zIndex: 2 }}>
            <div style={{ marginBottom: '2.5rem' }}>{sTag('Ready to modernize?')}</div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(5rem, 10vw, 10rem)', lineHeight: 0.85, letterSpacing: '-0.05em' }}>
              <span style={{ color: '#fff' }}>The laboratory<br /></span>
              <span style={{ color: 'transparent', WebkitTextStroke: '1px rgba(255,255,255,0.22)' }}>operating<br /></span>
              <span style={{ color: '#fff' }}>system your<br /></span>
              <span style={{ color: 'transparent', WebkitTextStroke: '1px rgba(255,255,255,0.22)' }}>lab</span>{' '}
              <span style={{ color: '#fff' }}>deserves.</span>
            </div>
          </div>
        </SectionReveal>
      </div>

      <SectionReveal direction="right">
        <div style={{ padding: '7rem 2.5rem 7rem 3rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <p style={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.8, marginBottom: '3rem', fontWeight: 300, maxWidth: '360px' }}>
            Join the next generation of pathology laboratories using AI to process more specimens, reduce turnaround time, and improve diagnostic confidence.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '280px' }}>
            <button className="mag-btn" style={{ background: '#fff', border: 'none', color: '#4F46E5', padding: '14px 30px', borderRadius: '2px', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', cursor: 'pointer' }}>
              Request demo &rarr;
            </button>
            <button style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.22)', color: 'rgba(255,255,255,0.65)', padding: '14px 30px', borderRadius: '2px', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 400, letterSpacing: '0.04em', cursor: 'pointer' }}>
              Schedule consultation
            </button>
          </div>
          <div style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {['HIPAA', 'SOC 2', 'CAP', 'FHIR R4', 'CLIA'].map(b => (
              <span key={b} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', fontWeight: 700, color: 'rgba(255,255,255,0.32)', border: '1px solid rgba(255,255,255,0.12)', padding: '4px 10px', borderRadius: '2px', letterSpacing: '0.07em' }}>{b}</span>
            ))}
          </div>
        </div>
      </SectionReveal>
    </section>
  )
}
