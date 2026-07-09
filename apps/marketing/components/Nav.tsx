'use client'
import { useState, useEffect } from 'react'

export default function Nav() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      height: '56px', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', padding: '0 var(--section-gutter)',
      background: scrolled ? 'rgba(240,239,233,0.92)' : 'rgba(240,239,233,0.75)',
      backdropFilter: 'blur(24px)',
      borderBottom: '1px solid rgba(9,9,14,0.07)',
      transition: 'background 0.3s ease',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-8)',
        fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.85rem',
        letterSpacing: '0.08em', color: '#09090E',
      }}>
        <div style={{
          width: 20, height: 20, background: '#4F46E5', borderRadius: '2px',
          display: 'grid', placeItems: 'center', fontSize: '8px', fontWeight: 900, color: '#fff',
        }}>C</div>
        CYTOLAB
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-40)' }}>
        {['Platform', 'CYTO AI', 'Security', 'Pricing'].map(item => (
          <a key={item} href={`#${item.toLowerCase().replace(' ', '-')}`}
            style={{
              fontFamily: 'var(--font-sans)', fontSize: '0.68rem', fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              color: 'rgba(9,9,14,0.32)', textDecoration: 'none', transition: 'color 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#09090E')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(9,9,14,0.32)')}
          >{item}</a>
        ))}
      </div>
      <button
        className="mag-btn"
        style={{
          background: '#09090E', color: '#F0EFE9', border: 'none',
          padding: '8px 18px', borderRadius: '2px',
          fontFamily: 'var(--font-sans)', fontSize: '0.68rem', fontWeight: 700,
          letterSpacing: '0.07em', textTransform: 'uppercase', cursor: 'pointer',
          transition: 'background 0.2s',
        }}
        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#4F46E5')}
        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = '#09090E')}
      >Request demo</button>
    </nav>
  )
}
