'use client';

import { PremiumNav } from '@/components/marketing/PremiumNav';

// Standalone preview for the premium marketing navigation. Lives outside the
// (app) route group so it isn't auth-gated. Light hero content sits under the
// glass bar so the backdrop blur is visible.
export default function NavPreviewPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#EEF2F8 0%,#E8ECF5 40%,#F4F1FB 100%)', fontFamily: 'Geist, ui-sans-serif, system-ui, sans-serif' }}>
      <PremiumNav />

      <main style={{ maxWidth: 1680, margin: 'auto', padding: '160px 56px 120px' }}>
        <p style={{ fontSize: 14, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#E53A34', margin: 0 }}>
          AI Pathology Platform
        </p>
        <h1 style={{ fontSize: 72, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.02, color: '#101828', margin: '16px 0 0', maxWidth: 820 }}>
          Don&rsquo;t just test.<br />Optimize.
        </h1>
        <p style={{ fontSize: 20, lineHeight: 1.6, color: '#475569', maxWidth: 640, margin: '24px 0 0' }}>
          A next-generation diagnostics experience that turns lab results into
          actionable intelligence — combining clinical data with AI-driven analysis.
        </p>

        {/* Color bands so the fixed glass bar has content to blur over on scroll. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20, marginTop: 64 }}>
          {['#E53A34', '#4F46E5', '#0F172A'].map((c) => (
            <div key={c} style={{ height: 260, borderRadius: 24, background: c, boxShadow: '0 30px 80px rgba(15,23,42,.10)' }} />
          ))}
        </div>
      </main>
    </div>
  );
}
