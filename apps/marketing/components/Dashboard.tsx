'use client'
import { useEffect, useRef } from 'react'

const NAV = ['AI Queue', 'Specimens', 'Reporting', 'Analytics', 'Billing', 'Workforce', 'QA']
const KPIS: [string, string, string][] = [
  ['147', 'In Queue', '↑ 12 today'],
  ['89', 'AI Screened', '84% conf.'],
  ['23', 'Flagged', '↑ urgent'],
  ['18h', 'Avg TAT', '↓ 54h'],
]
const FINDINGS: [string, string, string, string][] = [
  ['DM26-03-014', 'Cervical', 'ASC-US', '84%'],
  ['DM26-10-085', 'Breast FNA', 'Atypical', '77%'],
  ['DM26-05-715', 'Urine', 'Negative', '96%'],
  ['DM26-01-723', 'Thyroid FNA', 'HSIL', '91%'],
  ['DM26-02-330', 'Cervical', 'Negative', '98%'],
]
const ACC: [string, number][] = [
  ['HSIL / ASC-H', 97], ['LSIL', 94], ['ASC-US', 91], ['Negative (NILM)', 98], ['Specimen adequacy', 99],
]

function Bars() {
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = wrap.current; if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        el.querySelectorAll<HTMLElement>('[data-bar]').forEach((b) => { b.style.width = b.dataset.bar! })
        obs.disconnect()
      }
    }, { threshold: 0.3 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return (
    <div ref={wrap} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {ACC.map(([label, v]) => (
        <div key={label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '7px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 600,
              letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(240,239,233,0.4)' }}>{label}</span>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: '1.1rem', color: '#F0EFE9' }}>{v}%</span>
          </div>
          <div style={{ height: 3, background: 'rgba(240,239,233,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
            <div data-bar={`${v}%`} style={{ height: '100%', width: 0, background: '#4F46E5',
              borderRadius: '2px', transition: 'width 1.4s cubic-bezier(0.16,1,0.3,1)' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  return (
    <section style={{ background: '#09090E', color: '#F0EFE9', position: 'relative', overflow: 'hidden',
      borderBottom: '1px solid rgba(9,9,14,0.07)' }}>
      <div style={{ position: 'absolute', inset: 0,
        backgroundImage: 'linear-gradient(rgba(240,239,233,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(240,239,233,0.02) 1px,transparent 1px)',
        backgroundSize: '48px 48px', pointerEvents: 'none' }} />

      {/* Header */}
      <div style={{ padding: '5rem 2.5rem 3rem', position: 'relative' }}>
        <div style={{ position: 'absolute', right: '2.5rem', top: '2rem', fontFamily: 'var(--font-serif)',
          fontSize: '20vw', lineHeight: 1, color: 'rgba(240,239,233,0.02)', fontStyle: 'italic',
          pointerEvents: 'none', userSelect: 'none', whiteSpace: 'nowrap' }}>Workspace</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', fontWeight: 700,
          letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(240,239,233,0.25)',
          display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '2rem', position: 'relative' }}>
          <span style={{ width: 18, height: 1, background: 'rgba(240,239,233,0.2)', display: 'inline-block' }} />
          02 · The Platform
        </div>
        <div style={{ position: 'relative', lineHeight: 0.9 }}>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(3rem,6vw,5.5rem)',
            letterSpacing: '-0.03em', color: '#F0EFE9' }}>One workspace. </span>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(3rem,6vw,5.5rem)',
            letterSpacing: '-0.03em', color: 'transparent', WebkitTextStroke: '1.5px rgba(240,239,233,0.16)',
            fontStyle: 'italic' }}>Every workflow.</span>
        </div>
      </div>

      {/* App frame */}
      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '180px 1fr',
        borderTop: '1px solid rgba(240,239,233,0.07)' }}>
        {/* Sidebar */}
        <div style={{ borderRight: '1px solid rgba(240,239,233,0.07)', padding: '1.75rem 1.25rem' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', fontWeight: 700,
            letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(240,239,233,0.25)',
            marginBottom: '1.25rem' }}>Modules</div>
          {NAV.map((item, i) => (
            <div key={item} style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '9px 0',
              fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: i === 0 ? 700 : 500,
              color: i === 0 ? '#F0EFE9' : 'rgba(240,239,233,0.35)' }}>
              <span style={{ width: 5, height: 5, borderRadius: '2px',
                background: i === 0 ? '#4F46E5' : 'rgba(240,239,233,0.15)' }} />
              {item}
            </div>
          ))}
        </div>

        {/* Main */}
        <div style={{ padding: '1.75rem 2rem 3rem' }}>
          {/* KPI grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 0,
            border: '1px solid rgba(240,239,233,0.07)', marginBottom: '2rem' }}>
            {KPIS.map(([v, label, delta], i) => (
              <div key={label} style={{ padding: '1.5rem 1.25rem',
                borderRight: i < 3 ? '1px solid rgba(240,239,233,0.07)' : 'none' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', fontWeight: 600,
                  letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(240,239,233,0.3)',
                  marginBottom: '0.75rem' }}>{label}</div>
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: '2.6rem', lineHeight: 0.9,
                  color: '#F0EFE9', marginBottom: '0.4rem' }}>{v}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: '#3f97ef' }}>{delta}</div>
              </div>
            ))}
          </div>

          {/* Two panels */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 0,
            border: '1px solid rgba(240,239,233,0.07)' }}>
            {/* Findings */}
            <div style={{ padding: '1.5rem 1.5rem 1.75rem', borderRight: '1px solid rgba(240,239,233,0.07)' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(240,239,233,0.3)',
                marginBottom: '1.25rem' }}>AI Findings · Live</div>
              {FINDINGS.map(([id, kind, dx, conf]) => {
                const urgent = dx === 'HSIL' || dx === 'Atypical'
                return (
                  <div key={id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr auto',
                    alignItems: 'center', gap: '10px', padding: '11px 0',
                    borderTop: '1px solid rgba(240,239,233,0.05)', fontFamily: 'var(--font-mono)', fontSize: '0.66rem' }}>
                    <span style={{ color: '#F0EFE9', fontWeight: 600 }}>{id}</span>
                    <span style={{ color: 'rgba(240,239,233,0.4)' }}>{kind}</span>
                    <span style={{ color: urgent ? '#f87171' : 'rgba(240,239,233,0.6)', fontWeight: 700 }}>{dx}</span>
                    <span style={{ color: '#4F46E5', fontWeight: 700, textAlign: 'right' }}>{conf}</span>
                  </div>
                )
              })}
            </div>
            {/* Accuracy bars */}
            <div style={{ padding: '1.5rem 1.5rem 1.75rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(240,239,233,0.3)',
                marginBottom: '1.5rem' }}>CYTO AI Accuracy</div>
              <Bars />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
