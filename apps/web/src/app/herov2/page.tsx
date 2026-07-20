// Isolated preview route for HeroV2 (VERSION 2 hero redesign). Nothing here
// touches HeroV1 or any shipping component — this page exists only so the new
// hero can be reviewed in isolation before it replaces the current homepage hero.
import { HeroV2 } from '@/components/hero-v2/HeroV2';
import { ArrowRight } from 'lucide-react';

const DARK = '#0B1020';

export default function HeroV2Preview() {
  const nav = ['Platform', 'AI Pathology', 'Solutions', 'Resources', 'Company'];
  return (
    <div style={{ fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif', background: '#FAFAFB', minHeight: '100vh' }}>
      {/* lightweight standalone nav (isolated — not the shared marketing chrome) */}
      <nav style={{
        position: 'relative', zIndex: 20, maxWidth: 1600, margin: '0 auto', height: 80,
        padding: '0 72px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden>
            {Array.from({ length: 8 }).map((_, i) => {
              const a = (i / 8) * Math.PI * 2;
              return <circle key={i} cx={16 + 9 * Math.cos(a)} cy={16 + 9 * Math.sin(a)} r={2.4} fill="#7C5CFF" />;
            })}
            <circle cx="16" cy="16" r="3" fill="#7C5CFF" />
          </svg>
          <span style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.01em', color: DARK }}>Osieri</span>
        </div>
        <div style={{ display: 'flex', gap: 34, fontSize: 15 }}>
          {nav.map((n) => (
            <span key={n} style={{ color: '#3f4557', fontWeight: 500, cursor: 'pointer' }}>{n}</span>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <span style={{ color: DARK, fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>Sign in</span>
          <a href="#" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, height: 46, padding: '0 22px',
            borderRadius: 14, background: DARK, color: '#fff', fontWeight: 600, fontSize: 15, textDecoration: 'none',
          }}>Request a demo <ArrowRight size={16} /></a>
        </div>
      </nav>

      <HeroV2 />
    </div>
  );
}
