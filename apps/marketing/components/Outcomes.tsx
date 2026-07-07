'use client'
import { useEffect, useRef } from 'react'

const stats = [
  { n: 43, suffix: '%', label: 'Faster turnaround time', ghost: '43' },
  { n: 91, suffix: '%', label: 'Less manual review', ghost: '91' },
  { n: 97, suffix: '%', label: 'HSIL detection accuracy', ghost: '97' },
  { n: 99.98, suffix: '%', label: 'Platform uptime SLA', ghost: '99', float: true },
]

function StatCell({ n, suffix, label, ghost, float }: typeof stats[0]) {
  const numRef = useRef<HTMLDivElement>(null)
  const done = useRef(false)
  useEffect(() => {
    const el = numRef.current; if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !done.current) {
        done.current = true
        const dur = 2200, start = performance.now()
        const tick = (now: number) => {
          const p = Math.min((now-start)/dur, 1), ease = 1-Math.pow(1-p,3), val = n*ease
          el.textContent = (float ? val.toFixed(2) : Math.round(val)) + suffix
          if (p < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
        obs.disconnect()
      }
    }, { threshold: 0.5 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [n, suffix, float])

  return (
    <div style={{ padding: '4rem 2rem', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', bottom: '-0.1em', right: '-0.05em',
        fontFamily: 'var(--font-serif)', fontSize: '7.5rem', lineHeight: 1,
        color: 'rgba(9,9,14,0.04)', pointerEvents: 'none',
        fontStyle: 'italic', userSelect: 'none' }}>{ghost}</div>
      <div ref={numRef} style={{ fontFamily: 'var(--font-serif)',
        fontSize: 'clamp(3.5rem, 5.5vw, 5.5rem)', lineHeight: 0.88,
        color: '#09090E', marginBottom: '0.6rem' }}>0{suffix}</div>
      <div style={{ fontSize: '0.72rem', color: 'rgba(9,9,14,0.38)',
        lineHeight: 1.5, maxWidth: '130px' }}>{label}</div>
    </div>
  )
}

export default function Outcomes() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
      borderBottom: '1px solid rgba(9,9,14,0.07)', background: '#F0EFE9' }}>
      {stats.map((s, i) => (
        <div key={s.label} style={{ borderRight: i < 3 ? '1px solid rgba(9,9,14,0.07)' : 'none' }}>
          <StatCell {...s} />
        </div>
      ))}
    </div>
  )
}
