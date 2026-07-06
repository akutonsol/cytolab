'use client'
import { useEffect, useState } from 'react'

const LINKS = [
  { label: 'Platform', href: '#platform' },
  { label: 'Modules', href: '#modules' },
  { label: 'Security', href: '#security' },
  { label: 'Pricing', href: '#pricing' },
]

export default function Nav() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className="fixed inset-x-0 top-0 z-50 transition-all"
      style={{
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        background: scrolled ? 'rgba(240,239,233,0.72)' : 'transparent',
        borderBottom: `1px solid ${scrolled ? 'rgba(9,9,14,0.07)' : 'transparent'}`,
      }}
    >
      <div className="mx-auto flex max-w-[1240px] items-center justify-between px-[6vw] py-4 lg:px-8">
        <a href="#top" className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-md" style={{ background: 'var(--ink)' }}>
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--blue)' }} />
          </span>
          <span className="font-mono text-[15px] font-bold tracking-[0.12em]">CYTOLAB</span>
        </a>
        <nav className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <a key={l.label} href={l.href} className="font-sans text-[14px] text-ink/70 transition-colors hover:text-ink">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <a href="#" className="hidden font-sans text-[14px] text-ink/70 hover:text-ink sm:block">Sign in</a>
          <a
            href="#cta"
            className="rounded-full px-4 py-2 font-sans text-[14px] font-semibold text-bg transition-transform hover:scale-[0.98]"
            style={{ background: 'var(--ink)' }}
          >
            Request a demo
          </a>
        </div>
      </div>
    </header>
  )
}
