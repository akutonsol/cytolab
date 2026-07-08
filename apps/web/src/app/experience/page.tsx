'use client';

import dynamic from 'next/dynamic';

// Immersive, full-screen product experience. Client-only (heavy animation +
// pointer interaction) so it never blocks on SSR; renders over the viewport.
const InteractiveExperience = dynamic(
  () => import('@/components/experience/InteractiveExperience'),
  {
    ssr: false,
    loading: () => (
      <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: '#0b0a16', color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' }}>
        <div style={{ display: 'grid', justifyItems: 'center', gap: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.15)', borderTopColor: '#E63946', animation: 'xpspin 0.9s linear infinite' }} />
          <div style={{ fontSize: 13 }}>Loading live experience…</div>
          <style dangerouslySetInnerHTML={{ __html: '@keyframes xpspin{to{transform:rotate(360deg)}}' }} />
        </div>
      </div>
    ),
  },
);

export default function ExperiencePage() {
  return <InteractiveExperience />;
}
