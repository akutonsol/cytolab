'use client';

import { motion } from 'framer-motion';
import { TestTube2, ScanLine, BrainCircuit, ClipboardCheck, FileCheck2 } from 'lucide-react';

const EASE = [0.22, 0.8, 0.2, 1] as const;

type Stage = {
  key: string; title: string; lead: string; Icon: typeof TestTube2; active?: boolean; bullets: string[];
};

const STAGES: Stage[] = [
  { key: 'collect', title: 'Collect', lead: 'Specimen intake', Icon: TestTube2,
    bullets: ['Specimen accessioning', 'Barcode validation', 'Chain of custody'] },
  { key: 'process', title: 'Process', lead: 'Preparation & imaging', Icon: ScanLine,
    bullets: ['Automated preparation', 'Digital imaging', 'Quality verification'] },
  { key: 'ai', title: 'AI Analysis', lead: 'Screening intelligence', Icon: BrainCircuit, active: true,
    bullets: ['Deep learning inference', 'Region detection', 'Confidence scoring'] },
  { key: 'review', title: 'Review', lead: 'Pathologist verification', Icon: ClipboardCheck,
    bullets: ['Pathologist verification', 'Annotation tools', 'Diagnostic approval'] },
  { key: 'report', title: 'Report', lead: 'Structured delivery', Icon: FileCheck2,
    bullets: ['CAP-compliant reporting', 'LIS delivery', 'FHIR integration'] },
];

/**
 * Animated workflow pipeline — the glowing-node rail lifted out of
 * WorkflowSection so it can live inside the dark "Live Workflow" card.
 * Self-contained (scoped `.lwf` CSS + framer-motion); no dark background of
 * its own, so it reads on whatever surface it sits on.
 */
export function WorkflowPipeline() {
  return (
    <div className="lwf">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="lwf-rail-wrap">
        <div className="lwf-rail">
          <div className="lwf-rail-base" />
          <motion.div className="lwf-rail-fill"
            initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }}
            transition={{ duration: 1.6, ease: EASE, delay: 0.15 }} />
        </div>

        <div className="lwf-arrows" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="lwf-arrow" style={{ left: `${19.25 + i * 20.5}%` }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5l11 7-11 7z" /></svg>
            </span>
          ))}
        </div>

        <div className="lwf-nodes">
          {STAGES.map((s, i) => (
            <motion.div key={s.key} className={`lwf-node ${s.active ? 'is-ai' : ''}`}
              initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ duration: 0.55, ease: EASE, delay: 0.2 + i * 0.16 }}>
              <motion.div className={`lwf-circle ${s.active ? 'is-active' : ''}`}
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 4 + i * 0.4, repeat: Infinity, ease: 'easeInOut' }}>
                {s.active && (
                  <>
                    <span className="lwf-bloom-node" />
                    <motion.span className="lwf-ring"
                      animate={{ rotate: 360 }} transition={{ duration: 9, repeat: Infinity, ease: 'linear' }} />
                    <motion.span className="lwf-ring lwf-ring-2"
                      animate={{ rotate: -360 }} transition={{ duration: 14, repeat: Infinity, ease: 'linear' }} />
                    <motion.span className="lwf-halo"
                      animate={{ scale: [1, 1.12, 1], opacity: [0.55, 0.85, 0.55] }}
                      transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }} />
                    <motion.span className="lwf-ripple"
                      animate={{ scale: [1, 2], opacity: [0.5, 0] }}
                      transition={{ duration: 2.6, repeat: Infinity, ease: 'easeOut' }} />
                    <motion.span className="lwf-orbit"
                      animate={{ rotate: 360 }} transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}>
                      <i /><i /><i />
                    </motion.span>
                  </>
                )}
                <span className="lwf-glass" />
                <span className="lwf-icon"><s.Icon size={s.active ? 32 : 26} strokeWidth={1.6} /></span>
              </motion.div>

              <div className={`lwf-node-title ${s.active ? 'is-active' : ''}`}>{s.title}</div>
              <div className="lwf-node-lead">{s.lead}</div>
              <ul className="lwf-node-bullets">
                {s.bullets.map((b) => <li key={b}>{b}</li>)}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

const CSS = `
  .lwf { --red: #E63946; position: relative; width: 100%; }
  .lwf-rail-wrap { position: relative; padding: 34px 0 8px; }
  .lwf-rail { position: absolute; top: 80px; left: 9%; right: 9%; height: 2px; z-index: 0; }
  .lwf-rail-base { position: absolute; inset: 0; border-radius: 2px; background: linear-gradient(90deg, rgba(255,255,255,.05), rgba(255,255,255,.18), rgba(255,255,255,.05)); }
  .lwf-rail-fill { position: absolute; inset: 0; transform-origin: left center; border-radius: 2px;
    background: linear-gradient(90deg, rgba(230,57,70,0), rgba(230,57,70,.75) 45%, rgba(139,92,246,.75) 78%, rgba(139,92,246,0));
    box-shadow: 0 0 14px rgba(230,57,70,.45); }

  .lwf-arrows { position: absolute; inset: 0; z-index: 2; pointer-events: none; }
  .lwf-arrow { position: absolute; top: 80px; transform: translate(-50%, -50%); color: rgba(230,57,70,.85); display: grid; place-items: center; filter: drop-shadow(0 0 5px rgba(230,57,70,.6)); }

  .lwf-nodes { position: relative; z-index: 1; display: flex; align-items: flex-start; }
  .lwf-node { flex: 1; display: flex; flex-direction: column; align-items: center; text-align: center; position: relative; }

  .lwf-circle { position: relative; width: 92px; height: 92px; border-radius: 50%; display: grid; place-items: center; will-change: transform;
    box-shadow: 0 12px 40px rgba(0,0,0,.5); }
  .lwf-node.is-ai .lwf-circle { width: 120px; height: 120px; }
  .lwf-circle::before { content: ''; position: absolute; inset: 0; border-radius: 50%; padding: 1.5px; z-index: 2; pointer-events: none;
    background: linear-gradient(180deg, rgba(196,181,253,.55), rgba(230,57,70,.78));
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor;
            mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask-composite: exclude; }
  .lwf-glass { position: absolute; inset: 0; border-radius: 50%;
    background: radial-gradient(circle at 50% 40%, rgba(64,46,92,.30), rgba(9,8,18,.52) 72%);
    -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); }
  .lwf-glass::after { content: ''; position: absolute; left: 16%; top: 10%; width: 42%; height: 30%; border-radius: 50%;
    background: radial-gradient(circle, rgba(255,255,255,.22), transparent 70%); }
  .lwf-icon { position: relative; z-index: 3; color: #fff; display: grid; place-items: center; }

  .lwf-node.is-ai { margin-top: -14px; }
  .lwf-circle.is-active::before { padding: 2px; background: linear-gradient(180deg, rgba(255,120,132,.85), rgba(230,57,70,.98)); }
  .lwf-circle.is-active .lwf-glass { background: radial-gradient(circle at 50% 40%, rgba(128,32,46,.42), rgba(28,8,14,.55) 72%); }
  .lwf-circle.is-active { box-shadow: 0 0 60px rgba(230,57,70,.6), 0 16px 54px rgba(230,57,70,.4); }
  .lwf-bloom-node { position: absolute; left: 50%; top: 50%; width: 220px; height: 220px; transform: translate(-50%,-50%);
    border-radius: 50%; background: radial-gradient(circle, rgba(230,57,70,.35), transparent 62%); filter: blur(14px); z-index: 0; pointer-events: none; }
  .lwf-ring { position: absolute; inset: -8px; border-radius: 50%; z-index: 1;
    background: conic-gradient(from 0deg, transparent, rgba(230,57,70,.95), transparent 52%, rgba(139,92,246,.75), transparent);
    -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px));
            mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px)); }
  .lwf-ring-2 { inset: -16px; opacity: .5;
    background: conic-gradient(from 90deg, transparent, rgba(139,92,246,.8), transparent 60%, rgba(230,57,70,.6), transparent); }
  .lwf-halo { position: absolute; inset: -4px; border-radius: 50%; z-index: 0; box-shadow: 0 0 40px rgba(230,57,70,.55); }
  .lwf-ripple { position: absolute; inset: 0; border-radius: 50%; border: 1.5px solid rgba(230,57,70,.6); z-index: 1; }
  .lwf-orbit { position: absolute; inset: -14px; z-index: 2; }
  .lwf-orbit i { position: absolute; width: 6px; height: 6px; border-radius: 50%; background: #FB7185; box-shadow: 0 0 8px rgba(251,113,133,1); }
  .lwf-orbit i:nth-child(1) { top: -3px; left: 50%; }
  .lwf-orbit i:nth-child(2) { bottom: 8%; right: -3px; background: #C4B5FD; box-shadow: 0 0 8px rgba(196,181,253,1); }
  .lwf-orbit i:nth-child(3) { bottom: 8%; left: -3px; background: var(--red); box-shadow: 0 0 8px rgba(230,57,70,1); }

  .lwf-node-title { margin-top: 20px; font-size: 15px; font-weight: 700; color: #fff; }
  .lwf-node-title::before { content: ''; display: inline-block; width: 7px; height: 7px; border-radius: 2px; background: var(--red); margin-right: 8px; vertical-align: middle; box-shadow: 0 0 7px rgba(230,57,70,.6); }
  .lwf-node.is-ai .lwf-node-title { margin-top: 24px; font-size: 16px; }
  .lwf-node-title.is-active { color: var(--red); }
  .lwf-node-lead { margin-top: 4px; font-size: 12px; color: rgba(255,255,255,.5); font-weight: 600; }
  .lwf-node-bullets { margin: 12px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 5px; align-items: center; }
  .lwf-node-bullets li { position: relative; font-size: 11.5px; color: rgba(255,255,255,.42); padding-left: 14px; }
  .lwf-node-bullets li::before { content: ''; position: absolute; left: 0; top: 6px; width: 5px; height: 5px; border-radius: 50%; background: rgba(255,255,255,.28); }
  .lwf-node.is-ai .lwf-node-bullets li::before { background: rgba(230,57,70,.8); box-shadow: 0 0 6px rgba(230,57,70,.6); }

  @media (max-width: 1100px) {
    .lwf-rail { top: 70px; left: 7%; right: 7%; }
    .lwf-arrow { top: 70px; }
    .lwf-circle { width: 74px; height: 74px; }
    .lwf-node.is-ai { margin-top: -12px; }
    .lwf-node.is-ai .lwf-circle { width: 96px; height: 96px; }
    .lwf-node-bullets { display: none; }
  }
`;
