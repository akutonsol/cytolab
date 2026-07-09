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
    const el = numRef.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !done.current) {
        done.current = true
        const dur = 2200, start = performance.now()
        const tick = (now: number) => {
          const p = Math.min((now - start) / dur, 1)
          const ease = 1 - Math.pow(1 - p, 3)
          const val = n * ease
          if (p < 1) {
            el.textContent = (float ? val.toFixed(2) : Math.round(val)) + suffix
            requestAnimationFrame(tick)
          } else {
            el.textContent = (float ? n.toFixed(2) : n) + suffix
            el.classList.add('num-slam')
          }
        }
        requestAnimationFrame(tick)
        obs.disconnect()
      }
    }, { threshold: 0.5 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [n, suffix, float])

  return (
    <div style={{ padding: 'var(--space-64) var(--space-32)', position: 'relative', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', bottom: '-0.1em', right: '-0.05em',
        fontFamily: 'var(--font-serif)', fontSize: '7.5rem', lineHeight: 1,
        color: 'rgba(9,9,14,0.04)', pointerEvents: 'none', fontStyle: 'italic', userSelect: 'none',
      }}>{ghost}</div>
      <div ref={numRef} className="metric-xl" style={{
        color: '#09090E', marginBottom: 'var(--space-8)',
      }}>0{suffix}</div>
      <div className="body-sm" style={{ color: 'rgba(9,9,14,0.38)', maxWidth: 'var(--measure-xs)' }}>{label}</div>
    </div>
  )
}

export default function Outcomes() {
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    el.classList.add('stagger-children')
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        el.classList.add('triggered')
        obs.disconnect()
      }
    }, { threshold: 0.1 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div ref={gridRef} style={{
      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
      borderBottom: '1px solid rgba(9,9,14,0.07)', background: '#F0EFE9',
      position: 'relative',
    }}>
      <div className="section-counter" aria-hidden="true">02</div>
      {stats.map((s, i) => (
        <div key={s.label} style={{ borderRight: i < 3 ? '1px solid rgba(9,9,14,0.07)' : 'none' }}>
          <StatCell {...s} />
        </div>
      ))}
    </div>
  )
}
