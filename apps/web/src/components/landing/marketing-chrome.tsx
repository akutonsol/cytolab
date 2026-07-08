'use client';

// Shared marketing chrome — the fixed top nav + footer used across every public
// (unauthenticated) page. Extracted VERBATIM from the landing page's inline nav
// and footer so the visual is byte-identical; the only change is that links are
// now route-aware (they resolve from any page, not just the home page) so every
// destination is real. Do NOT redesign this — it is the shipping landing chrome.
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { SmoothScroll } from './SmoothScroll';

const RED = '#E63946';
const INK = '#0a0b1a';

export const MARKETING = { RED, INK, GREEN: '#10B981', INDIGO: '#6366F1' } as const;

// Nav model. Hash links point at real sections on the home page (they resolve as
// `/#section` from any route); the rest point at real routed pages.
type NavItem = { label: string; href: string; key: string };
const NAV: NavItem[] = [
  { label: 'Platform', href: '/#platform', key: 'platform' },
  { label: 'Solutions', href: '/solutions', key: 'solutions' },
  { label: 'Resources', href: '/#resources', key: 'resources' },
  { label: 'Pricing', href: '/#pricing', key: 'pricing' },
  { label: 'Compliance', href: '/compliance', key: 'compliance' },
  { label: 'Support', href: '/contact', key: 'support' },
];

export function SiteNav({ active = 'platform' }: { active?: string }) {
  return (
    <nav style={{
      position: 'fixed', top: 0, width: '100%', zIndex: 100,
      background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(0,0,0,0.06)', padding: '0 48px', height: 78,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: INK }}>
        {/* Cell-cluster mark (ring of dots + nucleus) to match the brand logo. */}
        <svg width="42" height="42" viewBox="0 0 32 32" fill="none" aria-hidden>
          {Array.from({ length: 8 }).map((_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return <circle key={i} cx={16 + 9 * Math.cos(a)} cy={16 + 9 * Math.sin(a)} r={2.5} fill={RED} />;
          })}
          <circle cx="16" cy="16" r="3" fill={RED} />
          <circle cx="11.5" cy="12.5" r="1.7" fill={RED} opacity={0.75} />
          <circle cx="20.5" cy="19.5" r="1.7" fill={RED} opacity={0.75} />
        </svg>
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.02 }}>
          <span style={{ fontWeight: 900, fontSize: 25, letterSpacing: '0.02em' }}>PathOS</span>
          <span style={{ fontSize: 10.5, fontWeight: 600, color: '#6b7280', letterSpacing: '0.005em', marginTop: 3 }}>The Operating System for Modern Pathology</span>
        </span>
      </Link>
      <div style={{ display: 'flex', gap: 38, fontSize: 17 }}>
        {NAV.map((item) => {
          const on = item.key === active;
          return (
            <Link key={item.key} href={item.href} style={{
              color: on ? RED : '#1F2937', fontWeight: on ? 700 : 600, textDecoration: 'none',
              borderBottom: on ? `2.5px solid ${RED}` : 'none', paddingBottom: 4,
            }}>{item.label}</Link>
          );
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <Link href="/book-demo" style={{
          background: RED, color: '#fff', padding: '13px 30px', borderRadius: 11,
          fontWeight: 700, fontSize: 16, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8,
        }}>Request Demo <ArrowRight size={18} /></Link>
      </div>
    </nav>
  );
}

export function SiteFooter() {
  const links: { label: string; href: string }[] = [
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms of Service', href: '/terms' },
    { label: 'Security', href: '/compliance' },
    { label: 'Support', href: '/contact' },
  ];
  return (
    <footer id="support" style={{ background: INK, padding: '32px 64px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
            <div style={{ width: 24, height: 24, background: RED, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#fff', fontSize: 10, fontWeight: 900 }}>PO</span>
            </div>
            <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: 800, letterSpacing: '0.01em' }}>PathOS</span>
          </Link>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12.5 }}>The Operating System for Modern Pathology</span>
          <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>© 2026 PathOS. All rights reserved.</span>
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          {links.map((item) => (
            <Link key={item.label} href={item.href} style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, textDecoration: 'none' }}>{item.label}</Link>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {['in', 'X', '▶'].map((icon) => (
            <div key={icon} style={{ width: 32, height: 32, background: 'rgba(255,255,255,0.08)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 700 }}>{icon}</span>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}

// Smooth-scroll + fixed-nav offset for hash navigation. Injected once via the
// endorsed raw-CSS pattern (avoids SSR hydration mismatch). scroll-margin-top
// keeps anchored sections clear of the 78px fixed nav.
export function MarketingScrollStyle() {
  return <style dangerouslySetInnerHTML={{ __html: `
    @media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
    section[id], [id].scroll-anchor { scroll-margin-top: 96px; }
  ` }} />;
}

// Full page shell for routed marketing sub-pages: fixed nav + padded main + footer.
export function MarketingPage({ active, children }: { active?: string; children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif', color: INK, background: '#fff', minHeight: '100vh' }}>
      <MarketingScrollStyle />
      <SmoothScroll />
      <SiteNav active={active} />
      <main style={{ paddingTop: 78 }}>{children}</main>
      <SiteFooter />
    </div>
  );
}
