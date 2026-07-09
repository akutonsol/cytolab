'use client'
import { useEffect, useRef } from 'react'
import SectionReveal from './SectionReveal'

const navItems = ['AI Queue', 'Specimens', 'Patients', 'Analytics', 'Reports', 'Billing', 'Workforce', 'Settings']
const findings = [
  { id: 'SP-2026-0842', result: 'HSIL', conf: '97%', color: '#f87171', bg: 'rgba(239,68,68,0.1)' },
  { id: 'SP-2026-0839', result: 'ASC-US', conf: '88%', color: '#3f97ef', bg: 'rgba(63,151,239,0.1)' },
  { id: 'SP-2026-0836', result: 'NILM', conf: '99%', color: '#4ade80', bg: 'rgba(74,222,128,0.1)' },
  { id: 'SP-2026-0833', result: 'ASC-H', conf: '92%', color: '#60a5fa', bg: 'rgba(63,151,239,0.1)' },
]
const accuracy = [
  { label: 'NILM', pct: 99, color: '#4ade80' },
  { label: 'HSIL', pct: 97, color: '#4F46E5' },
  { label: 'ASC-US', pct: 88, color: '#3f97ef' },
  { label: 'Carcinoma', pct: 94, color: '#f87171' },
]

export default function Dashboard() {
  const barRefs = useRef<(HTMLDivElement | null)[]>([])
  const animated = useRef(false)

  useEffect(() => {
    const container = document.getElementById('dash-section')
    if (!container) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !animated.current) {
        animated.current = true
        barRefs.current.forEach((bar, i) => {
          if (bar) setTimeout(() => { bar.style.width = bar.dataset.w + '%' }, 300 + i * 120)
        })
        obs.disconnect()
      }
    }, { threshold: 0.3 })
    obs.observe(container)
    return () => obs.disconnect()
  }, [])

  const sTagInv = (label: string) => (
    <div className="label" style={{
      color: 'rgba(240,239,233,0.22)',
      display: 'flex', alignItems: 'center', gap: '9px',
    }}>
      <span style={{ width: 18, height: 1, background: 'rgba(240,239,233,0.18)', display: 'inline-block' }} />
      {label}
    </div>
  )

  return (
    <section id="dash-section" style={{ background: '#09090E', borderBottom: '1px solid rgba(240,239,233,0.04)', position: 'relative' }}>
      <div className="section-counter" aria-hidden="true" style={{ color: 'rgba(240,239,233,0.04)' }}>03</div>
      <SectionReveal>
        <div style={{
          padding: '5rem 2.5rem 3rem', display: 'grid', gridTemplateColumns: '1fr 1fr',
          alignItems: 'end', borderBottom: '1px solid rgba(240,239,233,0.04)', position: 'relative',
        }}>
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            fontFamily: 'var(--font-serif)', fontSize: '28vw', color: 'rgba(240,239,233,0.028)',
            whiteSpace: 'nowrap', pointerEvents: 'none', fontStyle: 'italic',
            letterSpacing: '-0.04em', userSelect: 'none',
          }}>Workspace</div>
          <div style={{ position: 'relative', zIndex: 2 }}>
            <div style={{ marginBottom: '1.5rem' }}>{sTagInv('02 · Platform')}</div>
            <div className="display-lg" style={{ color: '#fff' }}>
              One workspace.<br />
              <em style={{ fontStyle: 'italic', color: 'rgba(240,239,233,0.18)' }}>Every workflow.</em>
            </div>
          </div>
          <div style={{ textAlign: 'right', position: 'relative', zIndex: 2 }}>
            <p style={{ fontSize: '0.78rem', color: 'rgba(240,239,233,0.2)', lineHeight: 1.7, maxWidth: '250px', marginLeft: 'auto', fontWeight: 300 }}>
              Built for speed, diagnostic clarity, and zero friction.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr' }}>
          <div style={{ borderRight: '1px solid rgba(240,239,233,0.04)', padding: '1.25rem 0' }}>
            {navItems.map((item, i) => (
              <div key={item} style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 1.25rem',
                fontSize: '0.68rem', fontWeight: 500,
                color: i === 0 ? '#fff' : 'rgba(240,239,233,0.2)',
                background: i === 0 ? 'rgba(240,239,233,0.03)' : 'transparent',
                letterSpacing: '0.01em',
              }}>
                <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
                {item}
              </div>
            ))}
          </div>

          <div style={{ padding: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px', marginBottom: '10px' }}>
              {[['Queue','147','↑12 today','#3f97ef'],['Screened','89','84% conf.','#3f97ef'],['Pending','23','4 high risk','#3f97ef'],['Avg TAT','18h','↓54h faster','#3f97ef']].map(([l,v,d,dc]) => (
                <div key={l} style={{ background: 'rgba(240,239,233,0.025)', border: '1px solid rgba(240,239,233,0.05)', borderRadius: '2px', padding: '1.1rem' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(240,239,233,0.18)', marginBottom: '4px' }}>{l}</div>
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: '2.2rem', color: 'rgba(240,239,233,0.9)', lineHeight: 1 }}>{v}</div>
                  <div style={{ fontSize: '0.6rem', color: dc, marginTop: '2px' }}>{d}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
              <div style={{ background: 'rgba(240,239,233,0.025)', border: '1px solid rgba(240,239,233,0.05)', borderRadius: '2px', padding: '1.1rem' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(240,239,233,0.18)', marginBottom: '10px' }}>AI Findings</div>
                {findings.map(f => (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid rgba(240,239,233,0.03)', fontSize: '0.68rem', color: 'rgba(240,239,233,0.35)' }}>
                    <span style={{ minWidth: '100px', fontSize: '0.65rem' }}>{f.id}</span>
                    <span style={{ padding: '2px 6px', borderRadius: '1px', fontSize: '0.58rem', fontWeight: 700, background: f.bg, color: f.color }}>{f.result}</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.62rem' }}>{f.conf}</span>
                  </div>
                ))}
              </div>
              <div style={{ background: 'rgba(240,239,233,0.025)', border: '1px solid rgba(240,239,233,0.05)', borderRadius: '2px', padding: '1.1rem' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(240,239,233,0.18)', marginBottom: '10px' }}>CYTO AI</div>
                {accuracy.map((a, i) => (
                  <div key={a.label} style={{ marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: 'rgba(240,239,233,0.2)', marginBottom: '3px' }}>
                      <span>{a.label}</span><span>{a.pct}%</span>
                    </div>
                    <div style={{ height: '2px', background: 'rgba(240,239,233,0.05)', borderRadius: '1px' }}>
                      <div
                        ref={el => { barRefs.current[i] = el }}
                        data-w={a.pct}
                        style={{ height: '100%', background: a.color, borderRadius: '1px', width: '0%', transition: 'width 1.3s ease' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </SectionReveal>
    </section>
  )
}
