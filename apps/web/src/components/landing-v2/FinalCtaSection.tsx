'use client';

// Final CTA — a single, confident closing panel on a purple gradient. Two actions.
import { ArrowRight, Play } from 'lucide-react';
import { DARK, PURPLE, PURPLE_DEEP, Reveal } from './primitives';

export function FinalCtaSection() {
  return (
    <section style={{ position: 'relative', background: '#FFFFFF', padding: '40px 72px 120px', overflow: 'hidden' }}>
      <div style={{ maxWidth: 1600, margin: '0 auto' }}>
        <Reveal>
          <div style={{
            position: 'relative', overflow: 'hidden', borderRadius: 32, padding: '84px 72px', textAlign: 'center',
            background: `linear-gradient(135deg, ${PURPLE_DEEP} 0%, ${PURPLE} 55%, #9370ff 100%)`,
            boxShadow: '0 40px 90px -30px rgba(91,63,224,0.55)',
          }}>
            {/* soft light + grid texture, no hard edges */}
            <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(50% 80% at 20% 0%, rgba(255,255,255,0.22) 0%, transparent 60%), radial-gradient(50% 80% at 100% 100%, rgba(11,16,32,0.18) 0%, transparent 60%)', pointerEvents: 'none' }} />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.22)', padding: '7px 16px', borderRadius: 999 }}>
                See it on your slides
              </span>
              <h2 style={{ margin: '24px auto 0', maxWidth: 820, fontSize: 'clamp(34px, 4vw, 56px)', lineHeight: 1.04, fontWeight: 800, letterSpacing: '-0.03em', color: '#fff' }}>
                Ready to give your lab an operating system?
              </h2>
              <p style={{ margin: '20px auto 0', maxWidth: 560, fontSize: 19, lineHeight: 1.6, color: 'rgba(255,255,255,0.82)' }}>
                Bring your own cases to a live demo and watch Osieri carry a specimen from scan to signed report.
              </p>
              <div style={{ marginTop: 38, display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
                <a href="#" className="v2-fcta" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, height: 56, padding: '0 32px', borderRadius: 16, background: '#fff', color: DARK, fontWeight: 700, fontSize: 16, textDecoration: 'none' }}>
                  Request a demo <ArrowRight size={18} className="v2-fcta-arrow" />
                </a>
                <a href="#" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, height: 56, padding: '0 28px', borderRadius: 16, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.28)', color: '#fff', fontWeight: 700, fontSize: 16, textDecoration: 'none' }}>
                  <Play size={16} fill="#fff" /> Talk to sales
                </a>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        .v2-fcta { transition: transform .28s cubic-bezier(.22,.8,.2,1), box-shadow .28s ease; }
        .v2-fcta:hover { transform: translateY(-2px); box-shadow: 0 16px 30px -12px rgba(11,16,32,0.4); }
        .v2-fcta-arrow { transition: transform .28s cubic-bezier(.22,.8,.2,1); }
        .v2-fcta:hover .v2-fcta-arrow { transform: translateX(4px); }
        @media (prefers-reduced-motion: reduce) { .v2-fcta, .v2-fcta-arrow { transition: none; } }
      ` }} />
    </section>
  );
}

export default FinalCtaSection;
