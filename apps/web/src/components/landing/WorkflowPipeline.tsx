'use client';

import { motion } from 'framer-motion';
import { Activity, CheckCircle2, Clock3, Radio, TestTube2, ScanLine, BrainCircuit, ClipboardCheck, FileCheck2 } from 'lucide-react';

const EASE = [0.22, 0.8, 0.2, 1] as const;

type Stage = {
  key: string;
  title: string;
  lead: string;
  Icon: typeof TestTube2;
  active?: boolean;
  status: string;
  time: string;
  signal: 'complete' | 'active' | 'queued';
  bullets: string[];
};

const STAGES: Stage[] = [
  { key: 'collect', title: 'Collect', lead: 'Specimen intake', Icon: TestTube2,
    status: 'Accessioned', time: '09:41 AM', signal: 'complete',
    bullets: ['Specimen accessioning', 'Barcode validation', 'Chain of custody'] },
  { key: 'process', title: 'Process', lead: 'Preparation & imaging', Icon: ScanLine,
    status: 'Digitized', time: '10:08 AM', signal: 'complete',
    bullets: ['Automated preparation', 'Digital imaging', 'Quality verification'] },
  { key: 'ai', title: 'AI Draft Assist', lead: 'Assistive reporting', Icon: BrainCircuit, active: true,
    status: 'Drafting', time: 'Live now', signal: 'active',
    bullets: ['Draft narrative', 'Structured suggestions', 'Human review'] },
  { key: 'review', title: 'Review', lead: 'Pathologist verification', Icon: ClipboardCheck,
    status: 'Queued', time: 'ETA 04:12', signal: 'queued',
    bullets: ['Pathologist verification', 'Annotation tools', 'Diagnostic approval'] },
  { key: 'report', title: 'Report', lead: 'Structured delivery', Icon: FileCheck2,
    status: 'Pending', time: 'Awaiting signout', signal: 'queued',
    bullets: ['Structured reporting', 'LIS delivery', 'FHIR integration'] },
];

const EVENTS = [
  { Icon: Radio, label: 'Case CY-24-1187 entered review', time: '10:42:19' },
  { Icon: Activity, label: 'Draft narrative generated', time: '10:42:23' },
  { Icon: CheckCircle2, label: 'Slide quality control passed', time: '10:42:27' },
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
      <div className="lwf-console" aria-label="Live workflow status">
        <div className="lwf-case">
          <span className="lwf-case-live"><i /> LIVE CASE</span>
          <span className="lwf-case-id">CY-24-1187</span>
          <span className="lwf-case-note">Cervical cytology · AI screening in progress</span>
        </div>
        <div className="lwf-eta">
          <Clock3 size={14} />
          <span>Review ETA</span>
          <strong>04:12</strong>
        </div>
      </div>
      <div className="lwf-rail-wrap">
        <div className="lwf-rail">
          <div className="lwf-rail-base" />
          <span className="lwf-rail-pulse" />
          <span className="lwf-rail-pulse lwf-rail-pulse-2" />
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

              <div className={`lwf-status is-${s.signal}`}>
                <span />
                {s.status}
              </div>
              <div className={`lwf-node-title ${s.active ? 'is-active' : ''}`}>{s.title}</div>
              <div className="lwf-node-lead">{s.lead}</div>
              <div className="lwf-node-time">{s.time}</div>
              <ul className="lwf-node-bullets">
                {s.bullets.map((b) => <li key={b}>{b}</li>)}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
      <div className="lwf-events" aria-label="Live workflow activity">
        {EVENTS.map(({ Icon, label, time }, i) => (
          <motion.div key={label} className="lwf-event"
            initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ duration: 0.45, ease: EASE, delay: 0.45 + i * 0.12 }}>
            <span className="lwf-event-icon"><Icon size={14} /></span>
            <span className="lwf-event-label">{label}</span>
            <span className="lwf-event-time">{time}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

const CSS = `
  .lwf { --red: #E63946; position: relative; width: 100%; }
  .lwf-console { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-bottom: 18px; padding: 13px 16px;
    border: 1px solid rgba(255,255,255,.10); border-radius: 16px;
    background: linear-gradient(180deg, rgba(255,255,255,.065), rgba(255,255,255,.03));
    box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 18px 44px rgba(0,0,0,.24); }
  .lwf-case { min-width: 0; display: flex; align-items: center; gap: 12px; color: rgba(255,255,255,.68); font-size: 12px; font-weight: 650; }
  .lwf-case-live { display: inline-flex; align-items: center; gap: 7px; color: #fca5a5; font-size: 10px; letter-spacing: .14em; white-space: nowrap; }
  .lwf-case-live i { width: 7px; height: 7px; border-radius: 50%; background: var(--red); box-shadow: 0 0 10px rgba(230,57,70,.9); animation: lwf-live-dot 1.5s ease-in-out infinite; }
  .lwf-case-id { color: #fff; font-size: 13px; font-weight: 800; letter-spacing: .02em; white-space: nowrap; }
  .lwf-case-note { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lwf-eta { display: inline-flex; align-items: center; gap: 8px; color: rgba(255,255,255,.54); font-size: 12px; white-space: nowrap; }
  .lwf-eta strong { color: #fff; font-size: 13px; font-weight: 800; font-variant-numeric: tabular-nums; }

  .lwf-rail-wrap { position: relative; padding: 28px 0 12px; }
  .lwf-rail { position: absolute; top: 80px; left: 9%; right: 9%; height: 2px; z-index: 0; }
  .lwf-rail-base { position: absolute; inset: 0; border-radius: 2px; background: linear-gradient(90deg, rgba(255,255,255,.05), rgba(255,255,255,.18), rgba(255,255,255,.05)); }
  .lwf-rail-fill { position: absolute; inset: 0; transform-origin: left center; border-radius: 2px;
    background: linear-gradient(90deg, rgba(230,57,70,0), rgba(230,57,70,.75) 45%, rgba(139,92,246,.75) 78%, rgba(139,92,246,0));
    box-shadow: 0 0 14px rgba(230,57,70,.45); }
  .lwf-rail-pulse { position: absolute; top: -3px; left: 0; width: 14%; height: 8px; border-radius: 999px;
    background: linear-gradient(90deg, rgba(230,57,70,0), rgba(255,255,255,.75), rgba(139,92,246,0));
    transform: translate3d(-140%,0,0); opacity: 0; filter: drop-shadow(0 0 8px rgba(230,57,70,.45));
    animation: lwf-rail-pulse 4.8s cubic-bezier(.22,.8,.2,1) infinite; }
  .lwf-rail-pulse-2 { animation-delay: 2.1s; opacity: .65; }

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
    background: radial-gradient(circle at 50% 40%, rgba(64,46,92,.36), rgba(9,8,18,.62) 72%); }
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

  .lwf-status { margin-top: 16px; min-height: 25px; display: inline-flex; align-items: center; gap: 7px; padding: 5px 10px; border-radius: 999px;
    color: rgba(255,255,255,.68); font-size: 10.5px; font-weight: 750; letter-spacing: .015em;
    background: rgba(255,255,255,.055); border: 1px solid rgba(255,255,255,.08);
    box-shadow: inset 0 1px 0 rgba(255,255,255,.07); }
  .lwf-status span { width: 6px; height: 6px; border-radius: 50%; background: rgba(148,163,184,.85); box-shadow: 0 0 7px rgba(148,163,184,.5); }
  .lwf-status.is-complete { color: rgba(187,247,208,.78); border-color: rgba(34,197,94,.18); background: rgba(34,197,94,.08); }
  .lwf-status.is-complete span { background: #22c55e; box-shadow: 0 0 9px rgba(34,197,94,.7); }
  .lwf-status.is-active { color: #fecdd3; border-color: rgba(230,57,70,.34); background: rgba(230,57,70,.12); }
  .lwf-status.is-active span { background: var(--red); box-shadow: 0 0 10px rgba(230,57,70,.9); animation: lwf-live-dot 1.2s ease-in-out infinite; }

  .lwf-node-title { margin-top: 10px; font-size: 15px; font-weight: 700; color: #fff; }
  .lwf-node-title::before { content: ''; display: inline-block; width: 7px; height: 7px; border-radius: 2px; background: var(--red); margin-right: 8px; vertical-align: middle; box-shadow: 0 0 7px rgba(230,57,70,.6); }
  .lwf-node.is-ai .lwf-node-title { font-size: 16px; }
  .lwf-node-title.is-active { color: var(--red); }
  .lwf-node-lead { margin-top: 4px; font-size: 12px; color: rgba(255,255,255,.5); font-weight: 600; }
  .lwf-node-time { margin-top: 5px; font-size: 10.5px; color: rgba(255,255,255,.34); font-weight: 650; font-variant-numeric: tabular-nums; }
  .lwf-node-bullets { margin: 12px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 5px; align-items: center; }
  .lwf-node-bullets li { position: relative; font-size: 11.5px; color: rgba(255,255,255,.42); padding-left: 14px; }
  .lwf-node-bullets li::before { content: ''; position: absolute; left: 0; top: 6px; width: 5px; height: 5px; border-radius: 50%; background: rgba(255,255,255,.28); }
  .lwf-node.is-ai .lwf-node-bullets li::before { background: rgba(230,57,70,.8); box-shadow: 0 0 6px rgba(230,57,70,.6); }

  .lwf-events { margin-top: 28px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .lwf-event { min-width: 0; display: flex; align-items: center; gap: 10px; padding: 12px 13px; border-radius: 14px;
    background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.028));
    border: 1px solid rgba(255,255,255,.08); box-shadow: inset 0 1px 0 rgba(255,255,255,.07); }
  .lwf-event-icon { width: 28px; height: 28px; border-radius: 9px; display: grid; place-items: center; flex: 0 0 auto;
    color: #fecdd3; background: rgba(230,57,70,.13); border: 1px solid rgba(230,57,70,.20); box-shadow: 0 0 18px rgba(230,57,70,.12); }
  .lwf-event-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: rgba(255,255,255,.66); font-size: 11.5px; font-weight: 650; }
  .lwf-event-time { margin-left: auto; color: rgba(255,255,255,.34); font-size: 10.5px; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }

  @keyframes lwf-live-dot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .45; transform: scale(.72); } }
  @keyframes lwf-rail-pulse { 0% { opacity: 0; transform: translate3d(-140%,0,0); } 10% { opacity: .78; } 78% { opacity: .62; } 100% { opacity: 0; transform: translate3d(720%,0,0); } }

  @media (max-width: 1100px) {
    .lwf-console { align-items: flex-start; flex-direction: column; }
    .lwf-case { width: 100%; }
    .lwf-rail { top: 70px; left: 7%; right: 7%; }
    .lwf-arrow { top: 70px; }
    .lwf-circle { width: 74px; height: 74px; }
    .lwf-node.is-ai { margin-top: -12px; }
    .lwf-node.is-ai .lwf-circle { width: 96px; height: 96px; }
    .lwf-status { font-size: 0; padding: 7px; min-height: 0; }
    .lwf-status span { width: 7px; height: 7px; }
    .lwf-node-bullets { display: none; }
    .lwf-events { grid-template-columns: 1fr; }
  }

  @media (prefers-reduced-motion: reduce) {
    .lwf *, .lwf *::before, .lwf *::after { animation: none !important; transition: none !important; }
    .lwf-rail-pulse { display: none; }
  }
`;
