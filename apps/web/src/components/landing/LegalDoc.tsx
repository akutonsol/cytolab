'use client';

// Shared legal-document layout for /privacy and /terms. Clean, readable prose
// column with a sticky section index — credible enough for enterprise review.
import { MarketingPage } from './marketing-chrome';
import { INK, RED } from './marketing-ui';

export type LegalSection = { id: string; heading: string; body: string[] };

export function LegalDoc({ title, updated, intro, sections }: {
  title: string; updated: string; intro: string; sections: LegalSection[];
}) {
  return (
    <MarketingPage active="">
      <section style={{ background: 'linear-gradient(180deg, #F2F1F9 0%, #FFFFFF 100%)', padding: '72px 64px 40px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', color: RED, textTransform: 'uppercase', marginBottom: 14 }}>Legal</div>
          <h1 style={{ fontSize: 46, fontWeight: 800, letterSpacing: '-0.03em', color: INK, margin: '0 0 12px' }}>{title}</h1>
          <div style={{ fontSize: 14, color: '#94a3b8' }}>Last updated: {updated}</div>
          <p style={{ fontSize: 17, lineHeight: 1.7, color: '#4a4a5a', marginTop: 24, maxWidth: 680 }}>{intro}</p>
        </div>
      </section>

      <section style={{ background: '#fff', padding: '56px 64px 96px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gridTemplateColumns: '220px 1fr', gap: 48, alignItems: 'start' }}>
          {/* Sticky index */}
          <nav style={{ position: 'sticky', top: 100, display: 'flex', flexDirection: 'column', gap: 8 }} aria-label="Sections">
            {sections.map((s) => (
              <a key={s.id} href={`#${s.id}`} style={{ fontSize: 13.5, color: '#64748b', textDecoration: 'none', lineHeight: 1.4, padding: '2px 0' }}>{s.heading}</a>
            ))}
          </nav>
          {/* Body */}
          <div>
            {sections.map((s) => (
              <div key={s.id} id={s.id} className="scroll-anchor" style={{ marginBottom: 40 }}>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: INK, margin: '0 0 12px', letterSpacing: '-0.01em' }}>{s.heading}</h2>
                {s.body.map((p, i) => (
                  <p key={i} style={{ fontSize: 15, lineHeight: 1.75, color: '#475569', margin: '0 0 14px' }}>{p}</p>
                ))}
              </div>
            ))}
            <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid #eef0f5', fontSize: 14, color: '#94a3b8' }}>
              Questions about this document? Contact <a href="mailto:legal@cytolab.demo" style={{ color: RED, textDecoration: 'none' }}>legal@cytolab.demo</a>.
            </div>
          </div>
        </div>
      </section>
    </MarketingPage>
  );
}
