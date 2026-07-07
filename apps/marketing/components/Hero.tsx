'use client'
import { useEffect, useRef } from 'react'

export default function Hero() {
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

    const pts = Array.from({ length: 40 }, () => ({
      x: Math.random() * 800, y: Math.random() * 600,
      vx: (Math.random() - 0.5) * 0.14, vy: (Math.random() - 0.5) * 0.14,
      r: Math.random() * 1.3 + 0.3, o: Math.random() * 0.12 + 0.03,
    }))
    const bars = [42,55,62,48,71,58,76,69,88,82,110,147]
    const maxB = Math.max(...bars)

    function drawTube(cx: number, cy: number) {
      const w = 52, h = 140, rx = 26, top = cy - h / 2
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(cx - w/2 + rx, top); ctx.lineTo(cx + w/2 - rx, top)
      ctx.quadraticCurveTo(cx+w/2, top, cx+w/2, top+rx)
      ctx.lineTo(cx+w/2, top+h-rx)
      ctx.quadraticCurveTo(cx+w/2, top+h, cx, top+h+rx*0.6)
      ctx.quadraticCurveTo(cx-w/2, top+h, cx-w/2, top+h-rx)
      ctx.lineTo(cx-w/2, top+rx)
      ctx.quadraticCurveTo(cx-w/2, top, cx-w/2+rx, top)
      ctx.closePath()
      ctx.fillStyle = 'rgba(18,18,32,0.88)'; ctx.fill()
      ctx.strokeStyle = 'rgba(79,70,229,0.45)'; ctx.lineWidth = 1; ctx.stroke()
      ctx.save(); ctx.clip()
      const ly = top + h * 0.32 + Math.sin(t * 1.4) * 4
      ctx.beginPath()
      ctx.moveTo(cx-w/2+2, ly+Math.sin(t*2)*3)
      ctx.bezierCurveTo(cx-8, ly-5+Math.sin(t*1.2)*4, cx+8, ly+5+Math.sin(t*0.9)*4, cx+w/2-2, ly+Math.sin(t*1.6+1)*3)
      ctx.lineTo(cx+w/2-2, top+h+20); ctx.lineTo(cx-w/2+2, top+h+20); ctx.closePath()
      const g = ctx.createLinearGradient(0, ly, 0, top+h)
      g.addColorStop(0, 'rgba(190,35,35,0.82)'); g.addColorStop(1, 'rgba(110,8,8,0.96)')
      ctx.fillStyle = g; ctx.fill(); ctx.restore()
      for (let i = 0; i < 5; i++) {
        const a = t * 0.75 + i * (Math.PI * 2 / 5)
        ctx.beginPath(); ctx.arc(cx+Math.cos(a)*52, cy+Math.sin(a)*22, 2.5, 0, Math.PI*2)
        ctx.fillStyle = `rgba(79,70,229,${0.45+Math.sin(a+t)*0.25})`; ctx.fill()
      }
      if (ctx.roundRect) ctx.roundRect(cx-w/2+3, top-18, w-6, 20, [3,3,0,0])
      else ctx.rect(cx-w/2+3, top-18, w-6, 20)
      ctx.fillStyle = 'rgba(79,70,229,0.82)'; ctx.fill(); ctx.restore()
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.strokeStyle = 'rgba(240,239,233,0.025)'; ctx.lineWidth = 1
      for (let x = 0; x < canvas.width; x += 48) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke() }
      for (let y = 0; y < canvas.height; y += 48) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke() }
      pts.forEach(p => {
        p.x += p.vx; p.y += p.vy
        if (p.x < 0) p.x = canvas.width; if (p.x > canvas.width) p.x = 0
        if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2)
        ctx.fillStyle = `rgba(79,70,229,${p.o})`; ctx.fill()
      })
      const bw = 10, gap = 5, totalW = bars.length*(bw+gap), sx = (canvas.width-totalW)/2, by = canvas.height*0.55
      bars.forEach((v, i) => {
        ctx.fillStyle = i === bars.length-1 ? 'rgba(79,70,229,0.88)' : 'rgba(79,70,229,0.22)'
        ctx.fillRect(sx+i*(bw+gap), by-(v/maxB)*110, bw, (v/maxB)*110)
      })
      drawTube(canvas.width/2, canvas.height*0.28+Math.sin(t*0.5)*6)
      const scan = (t*22) % canvas.width
      ctx.beginPath(); ctx.moveTo(scan,0); ctx.lineTo(scan,canvas.height)
      ctx.strokeStyle='rgba(63,151,239,0.05)'; ctx.lineWidth=1.5; ctx.stroke()
      const pulse = (Math.sin(t*3)+1)*0.5
      ctx.beginPath(); ctx.arc(canvas.width-20, 20, 4, 0, Math.PI*2)
      ctx.fillStyle=`rgba(74,222,128,${0.5+pulse*0.5})`; ctx.fill()
      t += 0.016
      animId = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize) }
  }, [])

  const liveData = [
    { label: 'Queue', value: '147', change: '↑12', changeColor: '#3f97ef' },
    { label: 'AI Screened', value: '89', change: '84% conf.', changeColor: '#3f97ef' },
    { label: 'High Risk', value: '4', valueColor: '#f87171', change: 'HSIL/ASC-H', changeColor: 'rgba(240,239,233,0.15)' },
    { label: 'Avg TAT', value: '18h', valueColor: '#4ade80', change: '↓54h', changeColor: '#3f97ef' },
  ]

  return (
    <section style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '1fr 1fr',
      borderBottom: '1px solid rgba(9,9,14,0.07)', position: 'relative', overflow: 'hidden',
      paddingTop: '56px' }}>
      <div style={{ position: 'absolute', inset: 0,
        backgroundImage: 'linear-gradient(rgba(9,9,14,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(9,9,14,0.04) 1px,transparent 1px)',
        backgroundSize: '48px 48px', pointerEvents: 'none', zIndex: 0 }} />

      {/* LEFT */}
      <div style={{ padding: '5rem 3.5rem 4rem 2.5rem', display: 'flex',
        flexDirection: 'column', justifyContent: 'space-between',
        borderRight: '1px solid rgba(9,9,14,0.07)', position: 'relative', zIndex: 2 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 700,
            letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(9,9,14,0.25)',
            display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2rem' }}>
            <span style={{ width: 24, height: 1, background: 'rgba(9,9,14,0.2)', display: 'inline-block' }} />
            AI Operating System · Cytology Labs
          </div>
          <div>
            {[
              { text: 'The future', ghost: false, italic: false },
              { text: 'of pathology', ghost: true, italic: false },
            ].map(({ text, ghost }, i) => (
              <div key={i} style={{ overflow: 'hidden', display: 'block', lineHeight: 0.88, marginBottom: '0.15rem' }}>
                <span style={{
                  display: 'inline-block',
                  fontFamily: 'var(--font-serif)',
                  fontSize: 'clamp(4.5rem, 8vw, 7.5rem)',
                  letterSpacing: '-0.03em', lineHeight: 0.88,
                  color: ghost ? 'transparent' : '#09090E',
                  WebkitTextStroke: ghost ? '1.5px rgba(9,9,14,0.18)' : undefined,
                }}>{text}</span>
              </div>
            ))}
            <div style={{ overflow: 'hidden', display: 'block', lineHeight: 0.88 }}>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(4.5rem, 8vw, 7.5rem)',
                letterSpacing: '-0.03em', lineHeight: 0.88, color: '#4F46E5', fontStyle: 'italic' }}>is</span>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(4.5rem, 8vw, 7.5rem)',
                letterSpacing: '-0.03em', lineHeight: 0.88, color: '#09090E' }}> here.</span>
            </div>
          </div>
        </div>
        <div>
          <p style={{ fontSize: '0.9rem', color: 'rgba(9,9,14,0.45)', lineHeight: 1.75,
            maxWidth: '400px', marginBottom: '2rem', fontWeight: 300 }}>
            One AI-powered platform. Specimen tracking, CYTO AI screening, reporting,
            billing, workforce, and full EMR interoperability.
          </p>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '3.5rem' }}>
            <button style={{ background: '#09090E', color: '#F0EFE9', border: 'none',
              padding: '13px 26px', borderRadius: '2px', fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em',
              textTransform: 'uppercase', cursor: 'pointer' }}>Request demo →</button>
            <button style={{ background: 'transparent', border: '1px solid rgba(9,9,14,0.07)',
              color: '#09090E', padding: '13px 26px', borderRadius: '2px',
              fontSize: '0.72rem', cursor: 'pointer' }}>Watch product tour</button>
          </div>
          <div style={{ display: 'flex', gap: '3.5rem' }}>
            {[['43%','Faster TAT'],['91%','Less manual review'],['97%','AI accuracy']].map(([num,label]) => (
              <div key={label} style={{ borderLeft: '2px solid #4F46E5', paddingLeft: '1rem' }}>
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: '2.5rem', color: '#09090E', lineHeight: 1 }}>{num}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 600,
                  letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(9,9,14,0.3)', marginTop: '3px' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT — dark canvas */}
      <div style={{ background: '#09090E', position: 'relative', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <div style={{ position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at 30% 40%, rgba(79,70,229,0.1) 0%, transparent 55%)' }} />
        <div style={{ position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(rgba(240,239,233,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(240,239,233,0.025) 1px,transparent 1px)',
          backgroundSize: '48px 48px' }} />
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
        <div style={{ position: 'relative', zIndex: 2 }}>
          <div style={{ padding: '2rem 2rem 0', fontFamily: 'var(--font-mono)', fontSize: '0.55rem',
            fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase',
            color: 'rgba(240,239,233,0.18)' }}>CYTOLAB · Live · AI Queue</div>
          <div style={{ padding: '1.25rem 2rem 2.5rem' }}>
            {liveData.map(({ label, value, valueColor, change, changeColor }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'baseline',
                justifyContent: 'space-between', padding: '11px 0',
                borderTop: '1px solid rgba(240,239,233,0.05)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 600,
                  letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(240,239,233,0.22)' }}>{label}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', fontWeight: 700,
                  color: valueColor || '#fff' }}>{value}</span>
                <span style={{ fontSize: '0.62rem', fontWeight: 700, color: changeColor }}>{change}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <style>{`
        @keyframes wordRise { from { transform: translateY(108%); } to { transform: translateY(0); } }
      `}</style>
    </section>
  )
}
