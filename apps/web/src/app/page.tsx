'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import {
  FlaskConical, Cog, BrainCircuit, Eye, FileText,
  Sparkles, Zap, BarChart3, ScanSearch,
  Target, Clock, ShieldCheck, Share2,
  Play, ArrowRight, ChevronRight, Check,
  Hand, Search, SlidersHorizontal, MoreHorizontal,
} from 'lucide-react';

import { WorkflowPipeline } from '@/components/landing/WorkflowPipeline';
import { SiteFooter, MarketingScrollStyle } from '@/components/landing/marketing-chrome';
import { CountUp } from '@/components/landing/CountUp';

// Landing-only hero composition (untouched HeroVial centerpiece + illuminated
// platform + orbiting telemetry cards + entrance choreography).
import { HeroScene } from '@/components/landing/HeroScene';
// New AI-pathology hero (replaces the vial hero in the homepage hero section only).
import { HeroV2 } from '@/components/hero-v2/HeroV2';

// Interactive product showcase — editorial + feature nav + morphing live dashboard.
const PlatformShowcase = dynamic(() => import('@/components/landing/PlatformShowcase'), { ssr: false });

// Living biological microscopy scene filling the right of the CTA section.
const CtaBioScene = dynamic(() => import('@/components/landing/CtaBioScene'), { ssr: false });

// "Living Science" — Three.js organism + editorial + feature cards.
const LivingScienceSection = dynamic(() => import('@/components/landing/LivingScienceSection'), { ssr: false });

const RED = '#E63946';
const INK = '#0a0b1a';
const GREEN = '#10B981';
const INDIGO = '#6366F1';

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut', delay }}
      viewport={{ once: true, margin: '-100px' }}
    >
      {children}
    </motion.div>
  );
}

type Cell = { size: number; top?: string; left?: string; right?: string; bottom?: string; opacity: number };
type StatCard = { label: string; value: string; trend: string; up: boolean };
type PipelineStep = { Icon: typeof FlaskConical; label: string; desc: string; active?: boolean };
type Feature = { Icon: typeof Sparkles; label: string; desc: string; badge?: string };
type RecordRow = { id: string; type: string; status: string; color: string };
type Plan = {
  name: string; desc: string; price: string; period: string;
  features: string[]; cta: string; href: string; highlighted: boolean; badge?: string;
};

// Granular chromatin stipple — scattered translucent dots reused by every cell
// (percentage positions scale with cell size). Gives the mottled H&E texture.
const CELL_STIPPLE = [
  'radial-gradient(circle at 22% 18%, rgba(118,78,188,0.42) 0%, transparent 9%)',
  'radial-gradient(circle at 41% 13%, rgba(134,94,204,0.36) 0%, transparent 7%)',
  'radial-gradient(circle at 63% 19%, rgba(108,68,178,0.44) 0%, transparent 10%)',
  'radial-gradient(circle at 80% 27%, rgba(128,88,198,0.36) 0%, transparent 8%)',
  'radial-gradient(circle at 14% 39%, rgba(118,78,188,0.42) 0%, transparent 9%)',
  'radial-gradient(circle at 34% 45%, rgba(140,100,208,0.32) 0%, transparent 7%)',
  'radial-gradient(circle at 86% 47%, rgba(112,72,182,0.42) 0%, transparent 9%)',
  'radial-gradient(circle at 19% 63%, rgba(124,84,194,0.38) 0%, transparent 8%)',
  'radial-gradient(circle at 45% 71%, rgba(108,68,178,0.44) 0%, transparent 10%)',
  'radial-gradient(circle at 67% 65%, rgba(134,94,204,0.34) 0%, transparent 7%)',
  'radial-gradient(circle at 83% 73%, rgba(118,78,188,0.42) 0%, transparent 9%)',
  'radial-gradient(circle at 30% 83%, rgba(128,88,198,0.36) 0%, transparent 8%)',
  'radial-gradient(circle at 55% 87%, rgba(112,72,182,0.42) 0%, transparent 9%)',
  'radial-gradient(circle at 72% 39%, rgba(140,100,208,0.30) 0%, transparent 7%)',
  'radial-gradient(circle at 50% 31%, rgba(124,84,194,0.34) 0%, transparent 7%)',
  'radial-gradient(circle at 11% 77%, rgba(118,78,188,0.36) 0%, transparent 8%)',
  'radial-gradient(circle at 27% 30%, rgba(206,182,246,0.28) 0%, transparent 12%)',
  'radial-gradient(circle at 71% 80%, rgba(210,186,248,0.24) 0%, transparent 12%)',
].join(', ');

// AI-Screening microscopy — a translucent "jelly" H&E cytology cell: see-through
// lavender body, granular chromatin stipple, glassy sheen, and a soft nucleus
// that MULTIPLY-blends into the cytoplasm (stained, not a solid ball on top).
// Duration is derived from cx so it stays stable across re-renders.
function renderCell(cx: number, cy: number, r: number, blur: number, delay: string, variant: 'normal' | 'large' | 'small' = 'normal') {
  const animDur = 3.5 + (cx % 4) * 0.6;
  return (
    <div key={`cell-${cx}-${cy}`} style={{
      position: 'absolute',
      left: `${cx}%`, top: `${cy}%`,
      width: r * 2, height: r * 2,
      transform: 'translate(-50%, -50%)',
      borderRadius: '50%',
      filter: blur > 0 ? `blur(${blur}px)` : 'none',
      animation: `float-cell ${animDur}s ease-in-out ${delay} infinite`,
      zIndex: blur > 0 ? 1 : variant === 'large' ? 4 : 2,
      overflow: 'hidden',
      isolation: 'isolate', // contain the nucleus multiply-blend to this cell
      // Translucent lavender jelly — low alpha so the slide shows through
      background: `radial-gradient(circle at 42% 38%, rgba(200,176,240,0.24) 0%, rgba(182,152,230,0.30) 45%, rgba(160,126,216,0.40) 75%, rgba(138,100,200,0.50) 92%, rgba(120,82,186,0.56) 100%)`,
      boxShadow: blur === 0 ? `0 4px 18px rgba(120,80,200,0.20), 0 1px 5px rgba(0,0,0,0.08)` : 'none',
    }}>
      {/* Granular chromatin stipple */}
      <div style={{ position: 'absolute', inset: `${r * 0.05}px`, borderRadius: '50%', background: CELL_STIPPLE }} />
      {/* Soft nucleus — multiply-blends into the cytoplasm, soft edge via gradient */}
      <div style={{
        position: 'absolute', width: `${r * 0.98}px`, height: `${r * 0.98}px`, top: '50%', left: '50%',
        transform: 'translate(-46%, -45%)', borderRadius: '50%', mixBlendMode: 'multiply',
        background: `radial-gradient(circle at 44% 40%, rgba(96,50,158,0.92) 0%, rgba(70,32,132,0.94) 42%, rgba(52,18,108,0.90) 70%, rgba(78,42,138,0.5) 88%, transparent 100%)`,
      }}>
        {variant !== 'small' && (
          <div style={{
            position: 'absolute', width: `${r * 0.18}px`, height: `${r * 0.18}px`, top: '34%', left: '34%', borderRadius: '50%',
            background: `radial-gradient(circle, rgba(38,10,86,0.55) 0%, transparent 100%)`,
          }} />
        )}
      </div>
      {/* Glass reflection — big soft jelly sheen top-left */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%', pointerEvents: 'none',
        background: `radial-gradient(ellipse 46% 34% at 30% 24%, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.14) 42%, transparent 70%)`,
      }} />
      {/* Bright rim arc (upper-left glass edge) */}
      <div style={{
        position: 'absolute', top: `${r * 0.08}px`, left: '13%', width: `${r * 0.72}px`, height: `${r * 0.3}px`, borderRadius: '50%', pointerEvents: 'none',
        background: `radial-gradient(ellipse, rgba(255,255,255,0.4) 0%, transparent 70%)`, transform: 'rotate(-32deg)', filter: `blur(${r * 0.03}px)`,
      }} />
      {/* Rim inner shadow for depth */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%', pointerEvents: 'none',
        background: `radial-gradient(circle at 50% 50%, transparent 0%, transparent 70%, rgba(70,35,135,0.06) 80%, rgba(50,22,110,0.14) 90%, rgba(35,12,85,0.22) 100%)`,
      }} />
    </div>
  );
}

// [cx%, cy%, r, blur, delay, variant] — dense + varied like a real slide
const cellLayout: [number, number, number, number, string, ('normal' | 'large' | 'small')][] = [
  [8, 4, 28, 1.8, '0.2s', 'small'], [38, 2, 24, 1.5, '0.8s', 'small'], [65, 3, 30, 1.8, '1.2s', 'small'],
  [88, 6, 26, 1.5, '0.5s', 'small'], [92, 25, 28, 1.8, '1.5s', 'small'], [3, 30, 26, 1.5, '0.9s', 'small'],
  [96, 55, 24, 1.8, '1.8s', 'small'], [5, 72, 28, 1.5, '0.4s', 'small'], [90, 78, 26, 1.8, '1.1s', 'small'],
  [40, 95, 24, 1.5, '0.7s', 'small'],
  [22, 12, 38, 0.6, '0.3s', 'normal'], [55, 10, 42, 0.6, '1.0s', 'normal'], [80, 15, 36, 0.6, '1.4s', 'normal'],
  [12, 45, 40, 0.6, '0.6s', 'normal'], [78, 45, 44, 0.6, '1.7s', 'normal'], [35, 75, 38, 0.6, '0.8s', 'normal'],
  [68, 72, 42, 0.6, '1.3s', 'normal'], [20, 82, 36, 0.6, '1.6s', 'normal'], [82, 82, 40, 0.6, '0.2s', 'normal'],
  [32, 28, 56, 0, '0.4s', 'large'], [70, 25, 52, 0, '1.1s', 'large'], [18, 62, 50, 0, '0.7s', 'large'],
  [60, 58, 54, 0, '1.5s', 'large'], [85, 60, 48, 0, '0.3s', 'normal'], [48, 45, 46, 0, '1.2s', 'normal'],
  [25, 48, 42, 0, '0.9s', 'normal'],
];

export default function LandingPage() {
  // Bounce authenticated users straight to the app. Wait for the persisted
  // auth store to hydrate before deciding, so anonymous visitors still see
  // the landing page.
  const router = useRouter();
  const { isAuthed, hydrated } = useAuth();
  useEffect(() => {
    if (hydrated && isAuthed) router.replace('/dashboard');
  }, [hydrated, isAuthed, router]);

  // Live-ticking counters for the Live Workflow stat cards.
  const [activeCases, setActiveCases] = useState(4281);
  const [inAnalysis, setInAnalysis] = useState(1247);
  useEffect(() => {
    const a = setInterval(() => { if (Math.random() > 0.4) setActiveCases((p) => p + 1); }, 5000);
    const b = setInterval(() => { setInAnalysis((p) => p + Math.floor(Math.random() * 3)); }, 3000);
    return () => { clearInterval(a); clearInterval(b); };
  }, []);

  const features: Feature[] = [
    { Icon: Sparkles, label: 'AI-Assisted Reporting', desc: 'Human-reviewed draft narratives.' },
    { Icon: Zap, label: 'Intelligent Workflows', desc: 'Automate. Standardize. Scale.' },
    { Icon: BarChart3, label: 'Real-time Analytics', desc: 'Insights that drive decisions.' },
    { Icon: ScanSearch, label: 'Focus Mode', desc: 'Distraction-free slide review.', badge: 'NEW' },
  ];

  const kpis: StatCard[] = [
    { label: 'Total Records', value: '75', trend: '16% vs last week', up: true },
    { label: 'Authorized', value: '44', trend: '22% vs last week', up: true },
    { label: 'Pending', value: '31', trend: '8% vs last week', up: false },
    { label: 'Completed Today', value: '12', trend: '14% vs last week', up: true },
  ];

  const recentRecords: RecordRow[] = [
    { id: 'TST-0004', type: 'ENDOCERVICAL ASP.', status: 'SUBMITTED', color: INDIGO },
    { id: 'TST-0001', type: 'PLEURAL FLUID', status: 'APPROVED', color: GREEN },
    { id: 'DM26-07-908', type: 'CERVICAL SCRAPE', status: 'COMPLETED', color: GREEN },
    { id: 'DM26-07-906', type: 'ENDOCERVICAL ASP.', status: 'RESULTED', color: INDIGO },
  ];

  const bigStats: { Icon: typeof Target; value: string; label: string }[] = [
    { Icon: Target, value: '100%', label: 'Human-authorized sign-out' },
    { Icon: Zap, value: '40%', label: 'Efficiency Gain' },
    { Icon: Clock, value: '2.0h', label: 'Average TAT' },
    { Icon: ShieldCheck, value: '100%', label: 'Data Security & Compliance' },
  ];

  const plans: Plan[] = [
    {
      name: 'Community', desc: 'For small labs and growing teams', price: '$499', period: '/month',
      features: ['Up to 5 users', 'AI-assisted report drafting', 'Core reporting', 'Standard support'],
      cta: 'Start Free Trial', href: '/book-demo', highlighted: false,
    },
    {
      name: 'Professional', badge: 'MOST POPULAR', desc: 'For established labs and clinics', price: '$1,299', period: '/month',
      features: ['Everything in Community', 'AI-assisted reporting tools', 'Workload Analytics', 'Priority Support 24/7', 'HIPAA & SOC-2 Compliance'],
      cta: 'Contact Sales', href: '/contact', highlighted: true,
    },
    {
      name: 'Enterprise', desc: 'For large labs and hospital systems', price: 'Custom', period: '',
      features: ['Everything in Professional', 'SSO & Advanced Security', 'Custom Integrations', 'Dedicated Success Manager'],
      cta: 'Talk to Sales', href: '/contact', highlighted: false,
    },
  ];

  const footerCells: Cell[] = [
    { size: 200, top: '-40px', right: '100px', opacity: 0.15 },
    { size: 150, bottom: '-30px', right: '300px', opacity: 0.1 },
    { size: 100, top: '20px', right: '400px', opacity: 0.12 },
  ];

  return (
    <div style={{ fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif', color: INK, background: '#fff' }}>
      <MarketingScrollStyle />

      {/* HERO — new AI-pathology hero (replaces the vial hero) */}
      <div className="scroll-anchor">
        <HeroV2 />
      </div>

      {/* WORKFLOW TITLE — white background, above the dark card */}
      <section id="platform" className="scroll-anchor" style={{ background: '#fff', padding: '112px 88px 48px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 20 }}>
            One system. End to end.
          </div>
          <h2 style={{ fontSize: 60, fontWeight: 800, lineHeight: 1.04, letterSpacing: '-0.03em', color: INK, margin: 0, maxWidth: 720 }}>
            Built for the way pathology labs <em style={{ fontStyle: 'italic', color: RED }}>work.</em>
          </h2>
          <p style={{ fontSize: 17, lineHeight: 1.7, color: '#64748b', maxWidth: 560, marginTop: 24 }}>
            From specimen collection through structured reporting, PathOS connects every step of the cytology workflow — with human-reviewed AI drafting assistance where it helps.
          </p>
        </div>
      </section>

      {/* SECTION A — LIVE WORKFLOW PIPELINE (dark rounded card) */}
      <section style={{
        margin: '0 40px 96px 40px',
        background: 'linear-gradient(180deg, #0d0d1a 0%, #0f0818 50%, #0d0d1a 100%)',
        borderRadius: '24px',
        padding: '32px 48px 40px 48px',
        border: '1px solid rgba(255,255,255,0.08)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes live-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
          .live-dot { display: inline-block; animation: live-blink 1.5s ease-in-out infinite; }
          @keyframes bar-grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
          @keyframes count-tick {
            0% { opacity: 1; transform: translateY(0); }
            50% { opacity: 0; transform: translateY(-4px); }
            51% { opacity: 0; transform: translateY(4px); }
            100% { opacity: 1; transform: translateY(0); }
          }
          @keyframes ping-ripple { 0% { transform: scale(1); opacity: 0.8; } 100% { transform: scale(2.8); opacity: 0; } }
          @keyframes row-sweep { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
          @keyframes heartbeat { 0%, 100% { transform: scale(1); } 14% { transform: scale(1.015); } 28% { transform: scale(1); } 42% { transform: scale(1.01); } 56% { transform: scale(1); } }
          @keyframes scanner-rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes donut-draw { from { stroke-dashoffset: 188.5; } to { stroke-dashoffset: 0; } }
          @keyframes warn-pulse { 0%, 100% { opacity: 1; filter: drop-shadow(0 0 3px rgba(230,57,70,0.7)); } 50% { opacity: 0.55; filter: drop-shadow(0 0 8px rgba(230,57,70,0.9)); } }
          @keyframes scan-line { 0% { transform: translateY(0); opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { transform: translateY(320px); opacity: 0; } }
          @keyframes badge-pulse { 0%, 100% { box-shadow: 0 4px 16px rgba(230,57,70,0.4); } 50% { box-shadow: 0 4px 28px rgba(230,57,70,0.75); } }
          @keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
          @keyframes float-cell { 0%, 100% { transform: translate(-50%, -50%) translateY(0px); } 50% { transform: translate(-50%, -50%) translateY(-6px); } }
          @keyframes scan-sweep { 0% { transform: translateY(0); opacity: 0; } 8% { opacity: 1; } 92% { opacity: 1; } 100% { transform: translateY(330px); opacity: 0; } }
          @keyframes corner-flash { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
          @keyframes live-ping { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(2.2); opacity: 0; } }
          @keyframes lens-breathe { 0%, 100% { opacity: 0.46; transform: translate3d(0,0,0); } 50% { opacity: 0.72; transform: translate3d(8px,-6px,0); } }
          @keyframes panel-sheen { 0%, 100% { opacity: 0.24; transform: translateX(-8%); } 50% { opacity: 0.42; transform: translateX(8%); } }
        ` }} />
        {/* Top purple atmospheric glow */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '200px',
          background: 'radial-gradient(ellipse 70% 100% at 50% 0%, rgba(100,20,120,0.45) 0%, rgba(60,10,80,0.2) 50%, transparent 100%)',
          pointerEvents: 'none', zIndex: 0,
        }} />
        {/* Bottom fade */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '80px',
          background: 'linear-gradient(0deg, rgba(10,10,20,0.6), transparent)',
          pointerEvents: 'none', zIndex: 0,
        }} />

        {/* Header row */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>
              Live Workflow
            </span>
            <span style={{ background: 'rgba(230,57,70,0.15)', color: '#E63946', borderRadius: '20px', padding: '3px 10px', fontSize: '11px', fontWeight: 600 }}>
              <span className="live-dot">●</span> LIVE
            </span>
          </div>
          <a href="#resources" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.7)', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" />
            </svg>
            View Full Pipeline
            <ChevronRight size={14} />
          </a>
        </div>

        {/* Pipeline — animated glowing-node workflow */}
        <div style={{ position: 'relative', zIndex: 1, marginBottom: '36px' }}>
          <WorkflowPipeline />
        </div>

        {/* Stats cards row */}
        <div style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '20px' }}>
          {/* Card 1 — Active Cases */}
          <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '24px', animation: 'heartbeat 4s ease-in-out infinite' }}>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontWeight: 600, marginBottom: '8px' }}>Active Cases</div>
            <div style={{ lineHeight: 1 }}>
              <span key={activeCases} style={{ display: 'inline-block', animation: 'count-tick 0.3s ease', fontSize: 36, fontWeight: 800, color: 'white' }}>
                {activeCases.toLocaleString()}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#22c55e', marginTop: '4px' }}>+231 today</div>
            <svg width="140" height="52" viewBox="0 0 140 52" style={{ marginTop: 12 }}>
              {[12, 20, 16, 32, 22, 38, 28, 14, 35, 30, 20, 28].map((h, i) => {
                const x = i * 12 + 4;
                const y = 52 - h;
                const isActive = i >= 9;
                const color = isActive ? '#E63946' : '#8B5CF6';
                const dimColor = isActive ? '#E63946' : 'rgba(139,92,246,0.4)';
                return (
                  <g key={i} style={{ transformBox: 'fill-box', transformOrigin: 'bottom', animation: `bar-grow 0.6s ease ${i * 0.05}s both` }}>
                    <line x1={x + 3} y1={y + 5} x2={x + 3} y2={52} stroke={dimColor} strokeWidth="2" strokeLinecap="round" />
                    <circle cx={x + 3} cy={y + 3} r="3.5" fill={color} />
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Card 2 — In Analysis */}
          <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontWeight: 600, marginBottom: '8px' }}>In Analysis</div>
              <div style={{ lineHeight: 1 }}>
                <span key={inAnalysis} style={{ display: 'inline-block', animation: 'count-tick 0.3s ease', fontSize: 36, fontWeight: 800, color: 'white' }}>
                  {inAnalysis.toLocaleString()}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>29% of total</div>
            </div>
            <svg width="80" height="80" viewBox="0 0 80 80" style={{ flexShrink: 0 }}>
              <defs>
                <linearGradient id="donutGrad2" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" />
                  <stop offset="50%" stopColor="#E63946" />
                  <stop offset="100%" stopColor="#f472b6" />
                </linearGradient>
              </defs>
              <circle cx="40" cy="40" r="30" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="9" />
              <circle cx="40" cy="40" r="30" fill="none" stroke="url(#donutGrad2)" strokeWidth="9" strokeDasharray={`${2 * Math.PI * 30 * 0.29} ${2 * Math.PI * 30}`} strokeLinecap="round" transform="rotate(-90 40 40)" style={{ animation: 'donut-draw 1.5s ease-out forwards', strokeDashoffset: 2 * Math.PI * 30 }} />
              {/* Rotating scanner line */}
              <g style={{ transformBox: 'view-box', transformOrigin: '40px 40px', animation: 'scanner-rotate 3s linear infinite' }}>
                <line x1="40" y1="40" x2="40" y2="12" stroke="rgba(139,92,246,0.4)" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="40" cy="12" r="2.5" fill="#8b5cf6" opacity="0.7" />
              </g>
              <text x="40" y="37" textAnchor="middle" fill="white" fontSize="12" fontWeight="800">29%</text>
              <text x="40" y="50" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="8">of total</text>
            </svg>
          </div>

          {/* Card 3 — High Priority */}
          <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '24px', position: 'relative' }}>
            <div style={{ position: 'absolute', top: '16px', right: '16px', animation: 'warn-pulse 2s ease-in-out infinite' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 3.5l8.5 15h-17z" stroke="#E63946" strokeWidth="2" strokeLinejoin="round" />
                <line x1="12" y1="10" x2="12" y2="14" stroke="#E63946" strokeWidth="2" strokeLinecap="round" />
                <circle cx="12" cy="16.6" r="0.8" fill="#E63946" />
              </svg>
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontWeight: 600, marginBottom: '8px' }}>High Priority</div>
            <div style={{ fontSize: '36px', fontWeight: 800, color: 'white', lineHeight: 1 }}><CountUp value={38} /></div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>Requires review</div>
            <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {[
                { label: 'Atypical', count: 18, color: '#E63946', delay: '0s' },
                { label: 'Suspicious', count: 12, color: '#DB2777', delay: '0.15s' },
                { label: 'Critical', count: 8, color: '#ef4444', delay: '0.3s' },
              ].map((item) => (
                <div key={item.label} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '4px 8px', borderRadius: 6,
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.05) 50%, transparent 100%)',
                  backgroundSize: '200% 100%',
                  animation: `row-sweep 3s ease-in-out ${item.delay} infinite`,
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                    <span style={{ position: 'relative', width: 9, height: 9, flexShrink: 0, display: 'inline-block' }}>
                      <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: item.color, animation: 'ping-ripple 2s ease-out infinite', animationDelay: item.delay }} />
                      <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: item.color, boxShadow: `0 0 6px ${item.color}` }} />
                    </span>
                    {item.label}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}><CountUp value={item.count} duration={1200} /></span>
                </div>
              ))}
            </div>
          </div>

          {/* Card 4 — System Status */}
          <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '24px' }}>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontWeight: 600, marginBottom: '16px' }}>System Status</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {[
                { label: 'AI Engine', pingDelay: 0 },
                { label: 'Image Processing', pingDelay: 0.5 },
                { label: 'Data Sync', pingDelay: 1.0 },
                { label: 'Storage', pingDelay: 1.5 },
              ].map((item, i) => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(255,255,255,0.3)' }} />
                    </div>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>{item.label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ position: 'relative', width: 10, height: 10 }}>
                      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#22c55e', opacity: 0, animation: `ping-ripple 2s ease-out ${item.pingDelay}s infinite` }} />
                      <div style={{ position: 'absolute', inset: '15%', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px rgba(34,197,94,0.8), 0 0 12px rgba(34,197,94,0.4)' }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#22c55e', letterSpacing: '0.02em' }}>Operational</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* AI Screening marketing section removed (Program 1 · P1-1b): it depicted a
          simulated cell-detection pipeline, confidence scores, a named model version, and
          CAP/CLIA validation that the product does not perform. Genuine assistive AI
          (human-reviewed report drafting) is represented elsewhere; real image inference
          is Program 6. */}

      {/* LIVING SCIENCE — Three.js organism scene */}
      <LivingScienceSection />

      {/* SECTION C — TRUSTED BY (logo wall) */}
      <section style={{ padding: '112px 32px 64px', background: 'white' }}>
        <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, letterSpacing: '0.2em', color: '#8f8fb8', marginBottom: 62, textTransform: 'uppercase' }}>
          Trusted by Leading Labs and Health Systems
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 20, alignItems: 'center', maxWidth: 1780, margin: '0 auto' }}>
          {[
            {
              a: 'MAYO', b: 'CLINIC', icon: (
                <svg width="54" height="54" viewBox="0 0 44 44" fill="none">
                  <g fill="#464660">
                    <path transform="translate(22,15) scale(0.95)" d="M0,-11 C4,-9 6,-9 8,-9 L8,-3 C8,3 4,7 0,9 C-4,7 -8,3 -8,-3 L-8,-9 C-6,-9 -4,-9 0,-11 Z" />
                    <path transform="translate(13.5,26) scale(0.7)" opacity="0.62" d="M0,-11 C4,-9 6,-9 8,-9 L8,-3 C8,3 4,7 0,9 C-4,7 -8,3 -8,-3 L-8,-9 C-6,-9 -4,-9 0,-11 Z" />
                    <path transform="translate(30.5,26) scale(0.7)" opacity="0.62" d="M0,-11 C4,-9 6,-9 8,-9 L8,-3 C8,3 4,7 0,9 C-4,7 -8,3 -8,-3 L-8,-9 C-6,-9 -4,-9 0,-11 Z" />
                  </g>
                </svg>
              ),
            },
            {
              a: 'Labcorp', big: true, icon: (
                <svg width="52" height="52" viewBox="0 0 44 44" fill="none">
                  <circle cx="22" cy="22" r="15" fill="#464660" opacity="0.1" />
                  <circle cx="22" cy="22" r="15" stroke="#464660" strokeWidth="1.7" />
                  <ellipse cx="22" cy="22" rx="6.4" ry="15" stroke="#464660" strokeWidth="1.4" />
                  <line x1="7" y1="22" x2="37" y2="22" stroke="#464660" strokeWidth="1.4" />
                  <line x1="10.5" y1="13.5" x2="33.5" y2="13.5" stroke="#464660" strokeWidth="1.1" opacity="0.55" />
                  <line x1="10.5" y1="30.5" x2="33.5" y2="30.5" stroke="#464660" strokeWidth="1.1" opacity="0.55" />
                </svg>
              ),
            },
            {
              a: 'Quest', b: 'Diagnostics', icon: (
                <svg width="52" height="52" viewBox="0 0 44 44" fill="none">
                  <circle cx="22" cy="22" r="15" fill="#464660" />
                  <path d="M29 15a9.5 9.5 0 1 0 1 13" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" />
                  <circle cx="22" cy="22" r="3.6" fill="#fff" />
                </svg>
              ),
            },
            {
              a: 'Cleveland', b: 'Clinic', icon: (
                <svg width="50" height="50" viewBox="0 0 44 44" fill="none">
                  <path d="M11 11h11v5.5h-5.5v11H22V33H11z" fill="#464660" />
                  <path d="M33 11H22v5.5h5.5v11H22V33h11z" fill="#464660" />
                </svg>
              ),
            },
            {
              a: 'Sonic', b: 'Healthcare', icon: (
                <svg width="52" height="52" viewBox="0 0 44 44" fill="none">
                  <circle cx="22" cy="22" r="15" stroke="#464660" strokeWidth="1.5" opacity="0.4" />
                  <path d="M16 10c0 7 12 7 12 12s-12 5-12 12" stroke="#464660" strokeWidth="2" strokeLinecap="round" />
                  <path d="M28 10c0 7-12 7-12 12s12 5 12 12" stroke="#464660" strokeWidth="2" strokeLinecap="round" />
                  <line x1="17" y1="15" x2="27" y2="15" stroke="#464660" strokeWidth="1.4" />
                  <line x1="18" y1="22" x2="26" y2="22" stroke="#464660" strokeWidth="1.4" opacity="0.6" />
                  <line x1="17" y1="29" x2="27" y2="29" stroke="#464660" strokeWidth="1.4" />
                </svg>
              ),
            },
            {
              a: 'agilon', b: 'health', icon: (
                <svg width="50" height="50" viewBox="0 0 44 44" fill="none">
                  {[0, 45, 90, 135].map((deg) => (
                    <line key={deg} x1="22" y1="8" x2="22" y2="36" stroke="#464660" strokeWidth="2.8" strokeLinecap="round" transform={`rotate(${deg} 22 22)`} />
                  ))}
                  <circle cx="22" cy="22" r="2.6" fill="#464660" />
                </svg>
              ),
            },
          ].map((logo, i) => (
            <motion.div key={i}
              initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6, ease: 'easeOut', delay: i * 0.08 }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
              {logo.icon}
              <div style={{ lineHeight: 1.1 }}>
                <div style={{ fontSize: logo.big ? 30 : 20.5, fontWeight: 800, color: '#33334d', letterSpacing: logo.big ? '-0.01em' : '0.01em' }}>{logo.a}</div>
                {logo.b && <div style={{ fontSize: 15.5, fontWeight: 600, color: '#9090ac', marginTop: 2 }}>{logo.b}</div>}
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* SECTION D — STATS BAR */}
      <section style={{ padding: '64px 32px 112px', background: 'white' }}>
        {/* Shared violet→magenta gradient for the stat icons */}
        <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
          <defs>
            <linearGradient id="statIcon" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="24">
              <stop offset="0%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#d946ef" />
            </linearGradient>
          </defs>
        </svg>
        <div style={{
          maxWidth: 1780, margin: '0 auto', background: '#faf9ff', border: '1px solid #eae7f6',
          borderRadius: 30, boxShadow: '0 18px 52px rgba(80,60,160,0.07)', padding: '46px 24px',
          display: 'grid', gridTemplateColumns: 'repeat(5,1fr)',
        }}>
          {[
            { Icon: Cog, num: 500, dec: 0, suffix: 'M+', label: 'Data points processed' },
            { Icon: FlaskConical, num: 2500, dec: 0, suffix: '+', label: 'Labs worldwide' },
            { Icon: ShieldCheck, num: 99.9, dec: 1, suffix: '%', label: 'System uptime' },
            { Icon: Share2, num: 40, dec: 0, suffix: '%', label: 'Faster turnaround' },
            { Icon: BarChart3, num: 70, dec: 0, suffix: '%', label: 'Workload reduction' },
          ].map((stat, i) => (
            <div key={stat.label} style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '8px 44px', borderLeft: i > 0 ? '1px solid #ede9f8' : 'none' }}>
              <div style={{ width: 66, height: 66, borderRadius: 19, background: 'linear-gradient(135deg, rgba(139,92,246,0.18), rgba(217,70,239,0.10))', border: '1px solid rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <stat.Icon size={31} color="url(#statIcon)" strokeWidth={2} />
              </div>
              <div>
                <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-0.02em', color: '#0a0b1a', lineHeight: 1 }}><CountUp value={stat.num} decimals={stat.dec} suffix={stat.suffix} /></div>
                <div style={{ fontSize: 15, color: '#64748b', marginTop: 6 }}>{stat.label}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* PRODUCT PREVIEW */}
      {/* INTERACTIVE PLATFORM SHOWCASE (replaces the old feature grid + stats bar) */}
      <section id="resources">
        <PlatformShowcase />
      </section>

      {/* PRICING */}
      <section id="pricing" style={{ background: '#fff', padding: '112px 64px 104px' }}>
        <style dangerouslySetInnerHTML={{ __html: `@keyframes badge-breathe { 0%,100% { box-shadow: 0 4px 14px rgba(230,57,70,0.35); } 50% { box-shadow: 0 7px 24px rgba(230,57,70,0.6); } }` }} />
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>BUILT FOR EVERY SCALE OF PATHOLOGY</div>
              <p style={{ color: '#6B7280', fontSize: 15 }}>Flexible plans for labs of all sizes. Enterprise-grade security. Unmatched support.</p>
            </div>
          </Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 24, alignItems: 'start' }}>
            {plans.map(({ name, badge, desc, price, period, features: feats, cta, href, highlighted }, i) => (
              <Reveal key={name} delay={i * 0.08}>
                <div
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-6px)';
                    e.currentTarget.style.boxShadow = highlighted ? '0 30px 72px rgba(230,57,70,0.26)' : '0 24px 52px rgba(16,24,40,0.13)';
                    e.currentTarget.style.borderColor = highlighted ? RED : '#c9cede';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = highlighted ? '0 20px 60px rgba(230,57,70,0.15)' : 'none';
                    e.currentTarget.style.borderColor = highlighted ? RED : '#E5E7EB';
                  }}
                  style={{
                    border: highlighted ? `2px solid ${RED}` : '1px solid #E5E7EB', borderRadius: 24, padding: 32,
                    background: '#fff', position: 'relative', boxShadow: highlighted ? '0 20px 60px rgba(230,57,70,0.15)' : 'none',
                    transition: 'transform 0.3s cubic-bezier(0.22,0.8,0.2,1), box-shadow 0.3s ease, border-color 0.3s ease',
                  }}>
                  {badge && (
                    <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: RED, color: '#fff', fontSize: 10, fontWeight: 800, padding: '4px 12px', borderRadius: 20, letterSpacing: '0.05em', animation: 'badge-breathe 3s ease-in-out infinite' }}>{badge}</div>
                  )}
                  <div style={{ fontSize: 18, fontWeight: 800, color: INK, marginBottom: 4 }}>{name}</div>
                  <div style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 20 }}>{desc}</div>
                  <div style={{ marginBottom: 24 }}>
                    <span style={{ fontSize: 40, fontWeight: 900, color: INK }}>{price}</span>
                    <span style={{ fontSize: 14, color: '#9CA3AF' }}>{period}</span>
                  </div>
                  <div style={{ marginBottom: 24 }}>
                    {feats.map((f) => (
                      <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 13, color: '#374151' }}>
                        <Check size={15} color={GREEN} strokeWidth={3} />{f}
                      </div>
                    ))}
                  </div>
                  <Link href={href}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      if (highlighted) { e.currentTarget.style.boxShadow = '0 10px 24px rgba(230,57,70,0.4)'; }
                      else { e.currentTarget.style.background = '#f7f8fb'; e.currentTarget.style.borderColor = '#c9cede'; }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      if (highlighted) { e.currentTarget.style.boxShadow = 'none'; }
                      else { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = '#E5E7EB'; }
                    }}
                    style={{
                    display: 'block', textAlign: 'center', textDecoration: 'none',
                    width: '100%', padding: 14, background: highlighted ? RED : 'transparent',
                    color: highlighted ? '#fff' : '#374151', border: highlighted ? 'none' : '1px solid #E5E7EB',
                    borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer',
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease, border-color 0.2s ease',
                  }}>{cta}</Link>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER CTA — cinematic glass panel */}
      <section id="demo" style={{
        position: 'relative',
        overflow: 'hidden',
        padding: '136px 40px 120px',
        background: 'radial-gradient(circle at 50% -10%, rgba(255,255,255,0.92), rgba(255,255,255,0) 28%), linear-gradient(180deg, #fff 0%, #170814 24%, #090711 100%)',
      }}>
        <style>{`
          @keyframes ctaGradientDrift {
            0%, 100% { transform: translate3d(-4%, -2%, 0) scale(1); opacity: .74; }
            50% { transform: translate3d(5%, 4%, 0) scale(1.08); opacity: .96; }
          }
          @keyframes ctaParticleFloat {
            0% { transform: translate3d(0, 18px, 0); opacity: 0; }
            18% { opacity: .72; }
            82% { opacity: .52; }
            100% { transform: translate3d(var(--x, 20px), -110px, 0); opacity: 0; }
          }
          @keyframes ctaSheen {
            0%, 100% { transform: translateX(-26%); opacity: .18; }
            50% { transform: translateX(22%); opacity: .36; }
          }
          @keyframes ctaPulse {
            0%, 100% { opacity: .55; transform: scale(1); }
            50% { opacity: 1; transform: scale(.72); }
          }
          @media (prefers-reduced-motion: reduce) {
            .final-cta-particle, .final-cta-glow, .final-cta-sheen, .final-cta-live-dot { animation: none !important; }
          }
        `}</style>

        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 110, zIndex: 0, pointerEvents: 'none', background: 'linear-gradient(180deg, #ffffff 0%, rgba(255,255,255,0) 100%)' }} />
        <div className="final-cta-glow" style={{ position: 'absolute', inset: '-22% -8% auto', height: 520, borderRadius: '50%', background: 'radial-gradient(circle at 42% 50%, rgba(230,57,70,.42), transparent 58%), radial-gradient(circle at 64% 44%, rgba(139,92,246,.24), transparent 54%)', filter: 'blur(6px)', animation: 'ctaGradientDrift 10s ease-in-out infinite', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 18% 64%, rgba(230,57,70,.20), transparent 34%), radial-gradient(circle at 78% 42%, rgba(255,255,255,.12), transparent 30%), linear-gradient(135deg, rgba(230,57,70,.16), rgba(40,10,28,0) 46%)', pointerEvents: 'none' }} />

        {Array.from({ length: 22 }).map((_, i) => (
          <span
            key={i}
            className="final-cta-particle"
            style={{
              position: 'absolute',
              left: `${8 + ((i * 41) % 84)}%`,
              bottom: `${10 + ((i * 17) % 72)}px`,
              width: i % 4 === 0 ? 3 : 2,
              height: i % 4 === 0 ? 3 : 2,
              borderRadius: '50%',
              background: i % 3 === 0 ? 'rgba(255,255,255,.72)' : 'rgba(255,120,140,.64)',
              boxShadow: '0 0 12px rgba(255,120,140,.45)',
              opacity: 0,
              ['--x' as string]: `${i % 2 ? 26 : -22}px`,
              animation: `ctaParticleFloat ${7 + (i % 5)}s ease-in-out ${i * 0.28}s infinite`,
              pointerEvents: 'none',
              zIndex: 1,
            }}
          />
        ))}

        <Reveal>
          <div style={{
            position: 'relative',
            zIndex: 2,
            maxWidth: 1320,
            minHeight: 540,
            margin: '0 auto',
            borderRadius: 36,
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,.18)',
            background: 'linear-gradient(135deg, rgba(255,255,255,.16), rgba(255,255,255,.055) 48%, rgba(255,255,255,.10)), rgba(16,8,20,.56)',
            boxShadow: '0 44px 110px -42px rgba(0,0,0,.78), inset 0 1px 0 rgba(255,255,255,.22)',
            backdropFilter: 'blur(18px)',
          }}>
            <div className="final-cta-sheen" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(110deg, transparent 0%, rgba(255,255,255,.16) 38%, transparent 58%)', animation: 'ctaSheen 8s ease-in-out infinite', pointerEvents: 'none' }} />

            <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: '52%', minHeight: 540, zIndex: 0, pointerEvents: 'none', opacity: .98 }}>
              <CtaBioScene />
            </div>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(12,7,18,.98) 0%, rgba(14,7,18,.84) 44%, rgba(14,7,18,.24) 72%, rgba(14,7,18,.10) 100%)', pointerEvents: 'none', zIndex: 1 }} />

            <div style={{ position: 'relative', zIndex: 2, display: 'grid', gridTemplateColumns: 'minmax(0, .92fr) minmax(320px, .58fr)', gap: 46, alignItems: 'center', minHeight: 540, padding: '68px 72px' }}>
              <div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 22, color: '#fda4af', fontSize: 11, fontWeight: 850, letterSpacing: '.18em', textTransform: 'uppercase' }}>
                  <span className="final-cta-live-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: '#E63946', boxShadow: '0 0 14px rgba(230,57,70,.95)', animation: 'ctaPulse 1.6s ease-in-out infinite' }} />
                  PathOS deployment window open
                </div>
                <h2 style={{ maxWidth: 760, fontSize: 64, fontWeight: 900, color: '#fff', lineHeight: .98, letterSpacing: '-0.045em', margin: '0 0 22px' }}>
                  Bring the lab online in one cinematic command center.
                </h2>
                <p style={{ color: 'rgba(255,255,255,.72)', fontSize: 18, lineHeight: 1.65, maxWidth: 610, margin: '0 0 34px' }}>
                  See specimen intake, AI-assisted drafting, pathologist review, reporting, and compliance move as one connected operating system.
                </p>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <Link
                    href="/book-demo"
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 18px 42px rgba(230,57,70,.34), inset 0 1px 0 rgba(255,255,255,.92)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 12px 34px rgba(230,57,70,.24), inset 0 1px 0 rgba(255,255,255,.84)'; }}
                    style={{ background: '#fff', color: '#A70F24', padding: '16px 26px', borderRadius: 999, fontWeight: 800, fontSize: 14.5, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid rgba(255,255,255,.55)', boxShadow: '0 12px 34px rgba(230,57,70,.24), inset 0 1px 0 rgba(255,255,255,.84)', transition: 'transform .22s ease, box-shadow .22s ease' }}
                  >
                    Request a live demo <ArrowRight size={16} />
                  </Link>
                  <Link
                    href="/contact"
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,.13)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.34)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,.075)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.20)'; }}
                    style={{ background: 'rgba(255,255,255,.075)', color: '#fff', padding: '16px 24px', borderRadius: 999, fontWeight: 760, fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(255,255,255,.20)', transition: 'background .22s ease, border-color .22s ease' }}
                  >
                    Contact sales
                  </Link>
                </div>
              </div>

              <div id="compliance" style={{ justifySelf: 'end', width: 'min(100%, 370px)', display: 'grid', gap: 12 }}>
                {[
                  { k: 'AI drafting', v: 'Live workflow preview' },
                  { k: 'Deployment', v: 'Guided by PathOS engineers' },
                  { k: 'Security', v: 'HIPAA · SOC 2 · RBAC' },
                ].map((item) => (
                  <div key={item.k} style={{ border: '1px solid rgba(255,255,255,.16)', borderRadius: 18, padding: '16px 18px', background: 'linear-gradient(180deg, rgba(255,255,255,.105), rgba(255,255,255,.045))', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.12)' }}>
                    <div style={{ color: 'rgba(255,255,255,.46)', fontSize: 11, fontWeight: 820, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 7 }}>{item.k}</div>
                    <div style={{ color: '#fff', fontSize: 15, fontWeight: 720 }}>{item.v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* FOOTER */}
      <SiteFooter />
    </div>
  );
}
