'use client';

// Shared premium UI primitives for the marketing sub-pages. These match the
// landing page's visual language (RED accents, INK ink, light surfaces, generous
// radius, soft shadows) so every routed page feels like one product. Palette is
// brand-only — no orange/amber anywhere (zero-orange rule).
import type { ReactNode } from 'react';
import { Check } from 'lucide-react';

export const RED = '#E63946';
export const INK = '#0a0b1a';
export const GREEN = '#10B981';
export const INDIGO = '#6366F1';
export const VIOLET = '#8b5cf6';

export function Eyebrow({ children, color = RED }: { children: ReactNode; color?: string }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', color, textTransform: 'uppercase', marginBottom: 16 }}>
      {children}
    </div>
  );
}

// Standard sub-page hero: soft lavender field, eyebrow, big headline, sub, optional actions.
export function PageHero({
  eyebrow, title, accent, sub, children,
}: { eyebrow: string; title: ReactNode; accent?: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <section style={{
      background: 'linear-gradient(180deg, #F2F1F9 0%, #F7F6FC 100%)',
      padding: '84px 64px 72px', borderBottom: '1px solid rgba(0,0,0,0.05)',
    }}>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 style={{ fontSize: 60, fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.03em', color: INK, margin: 0, maxWidth: 820 }}>
          {title}{accent && <em style={{ fontStyle: 'italic', color: RED }}> {accent}</em>}
        </h1>
        {sub && <p style={{ fontSize: 18, lineHeight: 1.65, color: '#64748b', maxWidth: 620, marginTop: 24 }}>{sub}</p>}
        {children && <div style={{ marginTop: 32 }}>{children}</div>}
      </div>
    </section>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      border: '1px solid #E5E7EB', borderRadius: 20, padding: 28, background: '#fff',
      boxShadow: '0 1px 3px rgba(0,0,0,0.03)', ...style,
    }}>{children}</div>
  );
}

export function IconTile({ children, tint = RED }: { children: ReactNode; tint?: string }) {
  return (
    <div style={{
      width: 46, height: 46, borderRadius: 12, flexShrink: 0,
      background: `${tint}14`, border: `1px solid ${tint}26`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', color: tint,
    }}>{children}</div>
  );
}

export function CheckItem({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0', fontSize: 14, color: '#374151', lineHeight: 1.5 }}>
      <span style={{ marginTop: 2, flexShrink: 0 }}><Check size={15} color={GREEN} strokeWidth={3} /></span>
      <span>{children}</span>
    </div>
  );
}

export function TrustStrip() {
  const items = ['HIPAA Compliant', 'SOC 2 Type II', '256-bit AES Encryption', 'CAP / CLIA Validated'];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      {items.map((t) => (
        <span key={t} style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: '#334155',
          background: '#fff', border: '1px solid #E5E7EB', borderRadius: 40, padding: '8px 15px', boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
        }}>
          <span style={{ width: 16, height: 16, borderRadius: '50%', background: `${GREEN}1f`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Check size={10} color={GREEN} strokeWidth={3} />
          </span>
          {t}
        </span>
      ))}
    </div>
  );
}

// Section wrapper with a centered heading block.
export function Section({
  bg = '#fff', eyebrow, title, sub, children, id,
}: { bg?: string; eyebrow?: string; title?: ReactNode; sub?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} style={{ background: bg, padding: '80px 64px' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        {(eyebrow || title) && (
          <div style={{ marginBottom: 44 }}>
            {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
            {title && <h2 style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.12, letterSpacing: '-0.02em', color: INK, margin: 0, maxWidth: 720 }}>{title}</h2>}
            {sub && <p style={{ fontSize: 17, lineHeight: 1.65, color: '#64748b', maxWidth: 620, marginTop: 18 }}>{sub}</p>}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}
