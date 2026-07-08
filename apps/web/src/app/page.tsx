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
} from 'lucide-react';

import { WorkflowPipeline } from '@/components/landing/WorkflowPipeline';
import { SiteNav, SiteFooter, MarketingScrollStyle } from '@/components/landing/marketing-chrome';
import { SmoothScroll } from '@/components/landing/SmoothScroll';
import { CountUp } from '@/components/landing/CountUp';

const HeroVial = dynamic(() => import('@/components/landing/HeroVial'), {
  ssr: false,
  loading: () => <div style={{ width: 600, height: 700 }} />,
});

// Floating live AI-telemetry panels overlaying the hero vial (canvas + parallax).
const HeroStatCards = dynamic(() => import('@/components/landing/HeroStatCards'), { ssr: false });

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
  const [cellsAnalyzed, setCellsAnalyzed] = useState(14223);
  const [scanProgress, setScanProgress] = useState(76);
  useEffect(() => {
    const a = setInterval(() => { if (Math.random() > 0.4) setActiveCases((p) => p + 1); }, 5000);
    const b = setInterval(() => { setInAnalysis((p) => p + Math.floor(Math.random() * 3)); }, 3000);
    const c = setInterval(() => {
      setCellsAnalyzed((p) => p + Math.floor(Math.random() * 8 + 2));
      setScanProgress((p) => (p >= 99 ? 76 : p + Math.random() * 0.3));
    }, 1200);
    return () => { clearInterval(a); clearInterval(b); clearInterval(c); };
  }, []);

  const features: Feature[] = [
    { Icon: Sparkles, label: 'AI-Powered Screening', desc: 'High accuracy. Faster results.' },
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
    { Icon: Target, value: '99.9%', label: 'Detection Accuracy' },
    { Icon: Zap, value: '40%', label: 'Efficiency Gain' },
    { Icon: Clock, value: '2.0h', label: 'Average TAT' },
    { Icon: ShieldCheck, value: '100%', label: 'Data Security & Compliance' },
  ];

  const plans: Plan[] = [
    {
      name: 'Community', desc: 'For small labs and growing teams', price: '$499', period: '/month',
      features: ['Up to 5 users', 'AI screening unlimited', 'Core reporting', 'Standard support'],
      cta: 'Start Free Trial', href: '/book-demo', highlighted: false,
    },
    {
      name: 'Professional', badge: 'MOST POPULAR', desc: 'For established labs and clinics', price: '$1,299', period: '/month',
      features: ['Everything in Community', 'AI Screening Core', 'Workload Analytics', 'Priority Support 24/7', 'HIPAA & SOC-2 Compliance'],
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
      <SmoothScroll />
      <SiteNav active="platform" />

      {/* HERO */}
      <section id="platform" style={{
        width: '100vw', minHeight: '100vh', marginLeft: 'calc(-50vw + 50%)', marginTop: 0, paddingTop: 72,
        background: '#F2F1F9',
        display: 'flex', alignItems: 'center', overflow: 'hidden', position: 'relative',
      }}>
        <motion.div
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: 'easeOut' }}
          style={{ padding: '80px 0 80px 6vw', position: 'relative', zIndex: 2, maxWidth: 620 }}
        >
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'rgba(230,57,70,0.1)', border: '1px solid rgba(230,57,70,0.2)',
            borderRadius: 20, padding: '6px 14px', marginBottom: 24,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: RED }} />
            <span style={{ fontSize: 11, color: RED, fontWeight: 600, letterSpacing: '0.12em' }}>ARTIFICIAL INTELLIGENCE · PATHOLOGY</span>
          </div>
          <h1 style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.05, color: INK, margin: '0 0 16px', letterSpacing: '-0.025em' }}>
            Unified pathology.<br />One platform.<br />
            <em style={{ color: RED, fontStyle: 'italic' }}>Cellular level.</em>
          </h1>
          <p style={{ fontSize: 17, fontWeight: 400, color: '#4a4a5a', lineHeight: 1.65, maxWidth: 420, marginBottom: 32 }}>
            CYTOLAB unifies every step of your workflow with AI-powered screening, intelligent workflows, and real-time
            insights — so you can focus on what matters most: better outcomes.
          </p>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <Link href="/book-demo" style={{
              background: RED, color: '#fff', padding: '14px 28px', borderRadius: 10, fontWeight: 700, fontSize: 15,
              textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8,
            }}>Request Demo <ArrowRight size={16} /></Link>
            <Link href="/experience" style={{ color: '#374151', fontSize: 14, fontWeight: 500, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 34, height: 34, borderRadius: '50%', border: `1px solid ${RED}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: RED }}>
                <Play size={14} fill={RED} />
              </span>
              Experience it live
            </Link>
          </div>
        </motion.div>

        {/* Right canvas — bleeds to the right edge of the viewport */}
        <div style={{ position: 'absolute', top: 72, right: 0, bottom: 0, width: '60vw', zIndex: 1 }}>
          <div style={{ width: '100%', height: '100%', position: 'relative', zIndex: 2 }}>
            <HeroVial />
          </div>
          <div style={{ position: 'absolute', top: '50%', right: 32, transform: 'translateY(-50%)', zIndex: 3 }}>
            <HeroStatCards />
          </div>
        </div>
      </section>

      {/* WORKFLOW TITLE — white background, above the dark card */}
      <section style={{ background: '#fff', padding: '84px 88px 40px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 20 }}>
            One system. End to end.
          </div>
          <h2 style={{ fontSize: 60, fontWeight: 800, lineHeight: 1.04, letterSpacing: '-0.03em', color: INK, margin: 0, maxWidth: 720 }}>
            Built for the way pathology labs <em style={{ fontStyle: 'italic', color: RED }}>work.</em>
          </h2>
          <p style={{ fontSize: 17, lineHeight: 1.7, color: '#64748b', maxWidth: 560, marginTop: 24 }}>
            From specimen collection to AI-powered diagnosis and structured reporting, CYTOLAB connects every step into one intelligent workflow.
          </p>
        </div>
      </section>

      {/* SECTION A — LIVE WORKFLOW PIPELINE (dark rounded card) */}
      <section style={{
        margin: '0 40px 0 40px',
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
          @keyframes scan-line { 0% { top: 5%; opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { top: 92%; opacity: 0; } }
          @keyframes badge-pulse { 0%, 100% { box-shadow: 0 4px 16px rgba(230,57,70,0.4); } 50% { box-shadow: 0 4px 28px rgba(230,57,70,0.75); } }
          @keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
          @keyframes float-cell { 0%, 100% { transform: translate(-50%, -50%) translateY(0px); } 50% { transform: translate(-50%, -50%) translateY(-6px); } }
          @keyframes scan-sweep { 0% { top: 4%; opacity: 0; } 8% { opacity: 1; } 92% { opacity: 1; } 100% { top: 93%; opacity: 0; } }
          @keyframes corner-flash { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
          @keyframes live-ping { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(2.2); opacity: 0; } }
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
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '24px', backdropFilter: 'blur(10px)', animation: 'heartbeat 4s ease-in-out infinite' }}>
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
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '24px', backdropFilter: 'blur(10px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '24px', position: 'relative', backdropFilter: 'blur(10px)' }}>
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
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '24px', backdropFilter: 'blur(10px)' }}>
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

      {/* SECTION B — AI SCREENING */}
      <section style={{ padding: '80px 40px', marginTop: 0, background: '#f8f7ff' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '35% 65%', gap: '60px', alignItems: 'center' }}>
          {/* Left column */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.15em', color: '#E63946', textTransform: 'uppercase', marginBottom: '16px' }}>AI Screening</div>
            <h2 style={{ fontSize: '44px', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#0a0b1a', margin: 0 }}>
              Smarter screening.<br />Stronger outcomes.
            </h2>
            <p style={{ fontSize: '16px', color: '#64748b', lineHeight: 1.65, marginTop: '20px', maxWidth: '380px' }}>
              Our AI models analyze millions of cells in seconds, prioritizing what matters most and reducing routine workload by up to 70%.
            </p>
            <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column' }}>
              {[
                { title: 'Deep learning models trained on 50M+ cells', sub: "Built on the world's largest curated datasets", icon: <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" fill="#E63946" /> },
                { title: '99%+ accuracy on key abnormality detection', sub: 'Proven performance across diverse populations', icon: <><circle cx="12" cy="12" r="3" fill="#E63946" /><circle cx="12" cy="12" r="6" fill="none" stroke="#E63946" strokeWidth="1.5" /></> },
                { title: 'Continuous learning from expert feedback', sub: 'Models improve with every case reviewed', icon: <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" fill="#E63946" /> },
                { title: 'CAP & CLIA validated workflows', sub: 'Enterprise-grade accuracy and compliance', icon: <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" fill="#E63946" /> },
              ].map((feat, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginTop: 18 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(230,57,70,0.08)', border: '1px solid rgba(230,57,70,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">{feat.icon}</svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 14, color: '#0a0b1a', fontWeight: 600, lineHeight: 1.3 }}>{feat.title}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3, lineHeight: 1.4 }}>{feat.sub}</div>
                  </div>
                </div>
              ))}
            </div>
            <Link href="/solutions" style={{ marginTop: '32px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', border: '1.5px solid #E63946', color: '#E63946', background: 'transparent', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
              Explore AI Screening →
            </Link>
          </div>

          {/* Right column — 3-panel: microscopy slide / analysis / findings */}
          <div style={{
            display: 'grid', gridTemplateColumns: '42% 32% 26%', gap: '0',
            borderRadius: '20px', overflow: 'hidden', border: '1px solid #e5e7eb',
            minHeight: '580px', boxShadow: '0 20px 60px rgba(0,0,0,0.08)',
          }}>

            {/* ── COL 1: MICROSCOPY SLIDE ── */}
            <div style={{ position: 'relative', background: 'radial-gradient(ellipse 55% 45% at 30% 30%, rgba(220, 205, 255, 0.30) 0%, transparent 65%), radial-gradient(ellipse 45% 55% at 70% 70%, rgba(210, 192, 250, 0.25) 0%, transparent 60%), linear-gradient(145deg, #faf8ff 0%, #f5f0fd 25%, #f0eafa 50%, #f5f0fd 75%, #faf8ff 100%)', overflow: 'hidden', minHeight: '580px' }}>
              {/* Slide stain texture */}
              <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                background: 'radial-gradient(ellipse 40% 30% at 20% 30%, rgba(147,112,219,0.25) 0%, transparent 70%), radial-gradient(ellipse 50% 40% at 70% 60%, rgba(138,43,226,0.20) 0%, transparent 70%), radial-gradient(ellipse 60% 50% at 50% 50%, rgba(221,210,243,0.40) 0%, transparent 80%), linear-gradient(135deg, #f5f0fc 0%, #ede4f8 50%, #f0ecf8 100%)',
              }} />

              {/* Stained cytology cell field */}
              {cellLayout.map(([cx, cy, r, blur, delay, variant]) => renderCell(cx, cy, r, blur, delay, variant))}

              {/* Primary AI detection box */}
              <div style={{ position: 'absolute', top: '18%', left: '18%', width: '38%', height: '38%', border: '2px solid #E63946', borderRadius: '4px', zIndex: 10, boxShadow: '0 0 16px rgba(230,57,70,0.25)' }}>
                <div style={{ position: 'absolute', top: -2, left: -2, width: 14, height: 14, borderTop: '3px solid #E63946', borderLeft: '3px solid #E63946', animation: 'corner-flash 2s ease-in-out infinite' }} />
                <div style={{ position: 'absolute', top: -2, right: -2, width: 14, height: 14, borderTop: '3px solid #E63946', borderRight: '3px solid #E63946', animation: 'corner-flash 2s ease-in-out 0.15s infinite' }} />
                <div style={{ position: 'absolute', bottom: -2, left: -2, width: 14, height: 14, borderBottom: '3px solid #E63946', borderLeft: '3px solid #E63946', animation: 'corner-flash 2s ease-in-out 0.30s infinite' }} />
                <div style={{ position: 'absolute', bottom: -2, right: -2, width: 14, height: 14, borderBottom: '3px solid #E63946', borderRight: '3px solid #E63946', animation: 'corner-flash 2s ease-in-out 0.45s infinite' }} />
                <div style={{ position: 'absolute', left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, rgba(230,57,70,0.9), transparent)', boxShadow: '0 0 8px rgba(230,57,70,0.6)', animation: 'scan-sweep 2.5s ease-in-out infinite' }} />
              </div>

              {/* Atypical badge */}
              <div style={{ position: 'absolute', top: '13%', left: '50%', transform: 'translateX(-50%)', background: '#E63946', color: 'white', borderRadius: '20px', padding: '5px 14px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', zIndex: 20, display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 4px 20px rgba(230,57,70,0.45)', animation: 'badge-pulse 2s ease-in-out infinite' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'white', display: 'inline-block', animation: 'live-blink 1s ease-in-out infinite' }} />
                Atypical Cell Detected
              </div>

              {/* Secondary cyan scan box */}
              <div style={{ position: 'absolute', top: '58%', left: '6%', width: '36%', height: '26%', border: '1.5px dashed rgba(6,182,212,0.65)', borderRadius: '4px', zIndex: 10, boxShadow: '0 0 10px rgba(6,182,212,0.15)' }} />

              {/* Monitoring badge (cyan) */}
              <div style={{ position: 'absolute', top: '55%', left: '8%', background: 'rgba(6,182,212,0.92)', color: 'white', borderRadius: '20px', padding: '4px 12px', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', zIndex: 20, display: 'flex', alignItems: 'center', gap: 5, boxShadow: '0 2px 12px rgba(6,182,212,0.4)' }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'white', display: 'inline-block' }} />
                Monitoring
              </div>

              {/* Bottom toolbar */}
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', borderTop: '1px solid rgba(0,0,0,0.08)', padding: '10px 16px', display: 'flex', justifyContent: 'space-around', zIndex: 20 }}>
                {[{ icon: '⊕', label: 'Pan' }, { icon: '⌕', label: 'Zoom' }, { icon: '⊙', label: 'Enhance' }, { icon: '•••', label: 'More' }].map((tool) => (
                  <button key={tool.label} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#374151', fontWeight: 500, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <span style={{ fontSize: 15, lineHeight: 1 }}>{tool.icon}</span>
                    <span style={{ fontSize: 11 }}>{tool.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ── COL 2: ANALYSIS PROGRESS ── */}
            <div style={{ background: 'linear-gradient(160deg, #1e1535 0%, #16102a 50%, #1a1228 100%)', padding: '28px 24px', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)', width: 200, height: 100, background: 'radial-gradient(ellipse, rgba(139,92,246,0.3) 0%, transparent 70%)', pointerEvents: 'none' }} />
              {/* Header + LIVE badge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, position: 'relative' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>Analysis Progress</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 20, padding: '3px 10px' }}>
                  <div style={{ position: 'relative', width: 8, height: 8 }}>
                    <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#22c55e', animation: 'live-ping 1.5s ease-out infinite' }} />
                    <div style={{ position: 'absolute', inset: '15%', borderRadius: '50%', background: '#22c55e' }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#22c55e' }}>LIVE</span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Scanning cells...</span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>{Math.round(scanProgress)}%</span>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 6, height: 6, overflow: 'hidden', marginBottom: 24, position: 'relative' }}>
                <div style={{ width: `${scanProgress}%`, height: '100%', borderRadius: 6, background: 'linear-gradient(90deg, #7c3aed, #a78bfa)', transition: 'width 0.8s ease', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)', animation: 'shimmer 1.5s ease-in-out infinite' }} />
                </div>
              </div>

              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>Cells Analyzed</div>
              <div style={{ fontSize: 38, fontWeight: 900, color: 'white', lineHeight: 1, marginBottom: 4, fontVariantNumeric: 'tabular-nums' }}>{cellsAnalyzed.toLocaleString()}</div>
              <div style={{ fontSize: 11, color: '#22c55e', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 4 }}>↑ 12% vs last 15 min</div>

              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 8 }}>AI Confidence</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <span style={{ fontSize: 30, fontWeight: 800, color: 'white' }}><CountUp value={98.4} decimals={1} suffix="%" duration={1800} /></span>
                <span style={{ background: 'rgba(22,163,74,0.25)', border: '1px solid rgba(34,197,94,0.4)', color: '#22c55e', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 700, textAlign: 'center', lineHeight: 1.3 }}>High<br />Confidence</span>
              </div>

              {/* Sparkline + time labels */}
              <div style={{ marginTop: 'auto' }}>
                <svg width="100%" height="80" viewBox="0 0 220 80" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="areaGrad2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity="0.5" />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>
                  {[20, 40, 60].map((y) => (<line key={y} x1="0" y1={y} x2="220" y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />))}
                  <polygon points="0,70 30,65 55,60 80,55 105,48 120,52 140,38 160,32 180,28 200,22 220,16 220,80 0,80" fill="url(#areaGrad2)" />
                  <polyline points="0,70 30,65 55,60 80,55 105,48 120,52 140,38 160,32 180,28 200,22 220,16" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  {([[0, 70, '#22c55e'], [55, 60, '#22c55e'], [105, 48, '#DB2777'], [140, 38, '#8b5cf6'], [180, 28, '#22c55e'], [220, 16, '#22c55e']] as [number, number, string][]).map(([x, y, c], i) => (
                    <circle key={i} cx={x} cy={y} r="3.5" fill={c} style={{ filter: `drop-shadow(0 0 4px ${c})` }} />
                  ))}
                  <circle r="4.5" fill="#22c55e" opacity="0.9" style={{ filter: 'drop-shadow(0 0 6px #22c55e)' }}>
                    <animateMotion dur="5s" repeatCount="indefinite"><mpath href="#chartPath2" /></animateMotion>
                  </circle>
                  <path id="chartPath2" d="M0,70 L30,65 L55,60 L80,55 L105,48 L120,52 L140,38 L160,32 L180,28 L200,22 L220,16" fill="none" stroke="none" />
                </svg>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
                  <span>10:30</span><span>10:45</span><span>11:00</span><span>Now</span>
                </div>
              </div>

              {/* AI Model footer */}
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <BrainCircuit size={16} color="#a78bfa" />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'white' }}>Model: Cytolab AI v3.2</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 1, whiteSpace: 'nowrap' }}>Last updated: Today, 10:42 AM</div>
                  </div>
                </div>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(34,197,94,0.2)', border: '1px solid rgba(34,197,94,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#22c55e' }}>
                  <Check size={13} strokeWidth={3} />
                </div>
              </div>
            </div>

            {/* ── COL 3: TOP FINDINGS ── */}
            <div style={{ background: 'white', padding: '28px 24px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0a0b1a', marginBottom: 24 }}>Top Findings</div>
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                {[
                  { label: 'Atypical Squamous Cells', count: 18, color: '#E63946', spark: '0,12 20,10 40,13 60,8 80,9 100,6 120,7' },
                  { label: 'LSIL', count: 12, color: '#DB2777', spark: '0,10 20,11 40,9 60,10 80,8 100,9 120,8' },
                  { label: 'HSIL', count: 5, color: '#8b5cf6', spark: '0,11 20,9 40,12 60,8 80,10 100,7 120,9' },
                  { label: 'Negative', count: 1247, color: '#22c55e', spark: '0,8 20,9 40,7 60,8 80,6 100,7 120,6' },
                ].map((row, i, arr) => (
                  <div key={row.label} style={{ padding: '16px 0', borderBottom: i < arr.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 13, color: '#374151', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: row.color, flexShrink: 0, display: 'inline-block', boxShadow: `0 0 6px ${row.color}66` }} />
                        {row.label}
                      </span>
                      <span style={{ fontSize: 15, fontWeight: 800, color: '#0a0b1a' }}><CountUp value={row.count} duration={1500} /></span>
                    </div>
                    <svg width="100%" height="16" viewBox="0 0 120 16" preserveAspectRatio="none">
                      <polyline points={row.spark} fill="none" stroke={row.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
                    </svg>
                  </div>
                ))}
              </div>
              <a href="#resources" style={{ marginTop: 20, width: '100%', padding: '12px', border: '1.5px solid #e5e7eb', borderRadius: 10, background: 'white', fontSize: 14, color: '#374151', cursor: 'pointer', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 500, transition: 'all 0.2s ease' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#E63946'; e.currentTarget.style.color = '#E63946'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.color = '#374151'; }}>
                View Full Results →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* LIVING SCIENCE — Three.js organism scene */}
      <LivingScienceSection />

      {/* SECTION C — TRUSTED BY (logo wall) */}
      <section style={{ padding: '76px 32px 58px', background: 'white' }}>
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
      <section style={{ padding: '24px 32px 96px', background: 'white' }}>
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
            { Icon: Cog, num: 500, dec: 0, suffix: 'M+', label: 'Cells analyzed' },
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
      <section id="pricing" style={{ background: '#fff', padding: '80px 64px' }}>
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

      {/* FOOTER CTA (red) */}
      <section id="demo" style={{ background: 'linear-gradient(135deg, #8B0000 0%, #C1121F 35%, #9B1020 65%, #7A0015 100%)', padding: '80px 64px', position: 'relative', overflow: 'hidden' }}>
        <style>{`@keyframes badgePulse { 0%,100%{opacity:.55} 50%{opacity:1} }`}</style>

        {/* Blended seam — dissolves the white Pricing surface above into the red
            CTA instead of a hard cut. Sits above the section fill, below content,
            and clears the heading (which starts at the 80px top padding). */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 64, zIndex: 0, pointerEvents: 'none', background: 'linear-gradient(180deg, #ffffff 0%, rgba(255,255,255,0) 100%)' }} />

        {/* Volumetric overlay layers */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 80% at 80% 50%, rgba(255,60,80,0.25) 0%, transparent 60%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 40% 60% at 20% 50%, rgba(80,0,10,0.4) 0%, transparent 55%)', pointerEvents: 'none' }} />

        {footerCells.map((cell, i) => (
          <motion.div key={i}
            animate={{ y: [0, -16, 0], x: [0, i % 2 ? 10 : -8, 0] }}
            transition={{ duration: 13 + i * 4, repeat: Infinity, ease: 'easeInOut' }}
            style={{ position: 'absolute', width: cell.size, height: cell.size, borderRadius: '50%', background: 'rgba(255,255,255,0.3)', top: cell.top, right: cell.right, bottom: cell.bottom, opacity: cell.opacity }} />
        ))}

        {/* Living biological microscopy scene — fills the right 40% */}
        <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: '42%', minHeight: 380, zIndex: 0, pointerEvents: 'none' }}>
          <CtaBioScene />
        </div>

        <Reveal>
          <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center', position: 'relative', zIndex: 1 }}>
            <div>
              <h2 style={{ fontSize: 52, fontWeight: 900, color: '#fff', lineHeight: 1.1, letterSpacing: '-0.02em', textTransform: 'uppercase', margin: '0 0 16px' }}>
                The arterial operating system your pathology lab deserves.
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 15, letterSpacing: '0.01em', lineHeight: 1.6, marginBottom: 32 }}>Join 500+ labs transforming diagnostic excellence with CYTOLAB.</p>
              <div style={{ display: 'flex', gap: 12 }}>
                <Link
                  href="/book-demo"
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 34px rgba(0,0,0,0.28), 0 2px 6px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.9)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.15), 0 1px 4px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.8)'; }}
                  style={{ background: 'rgba(255,255,255,0.95)', color: '#BF0D23', padding: '14px 28px', borderRadius: 50, fontWeight: 700, fontSize: 14, letterSpacing: '0.01em', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid rgba(255,255,255,0.3)', boxShadow: '0 4px 24px rgba(0,0,0,0.15), 0 1px 4px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.8)', backdropFilter: 'blur(8px)', transition: 'all 0.25s ease' }}
                >
                  Schedule Live Demo <ArrowRight size={16} />
                </Link>
                <Link
                  href="/contact"
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                  style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', padding: '14px 28px', borderRadius: 50, fontWeight: 700, fontSize: 14, letterSpacing: '0.01em', textDecoration: 'none', border: '1px solid rgba(255,255,255,0.35)', backdropFilter: 'blur(8px)', transition: 'all 0.25s ease' }}
                >
                  Contact Sales
                </Link>
              </div>
            </div>
            <div id="compliance" style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
              {['HIPAA COMPLIANT', 'SOC 2 TYPE II CERTIFIED', 'ENTERPRISE READY'].map((item) => (
                <div key={item} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)', borderRadius: 40, padding: '8px 16px', backdropFilter: 'blur(8px)', boxShadow: '0 2px 12px rgba(0,0,0,0.1)' }}>
                  <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(255,255,255,0.18)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 10px rgba(255,255,255,0.5)', animation: 'badgePulse 2.4s ease-in-out infinite' }}>
                    <Check size={12} color="#fff" strokeWidth={3} />
                  </span>
                  <span style={{ color: '#fff', fontWeight: 600, fontSize: 12, letterSpacing: '0.08em' }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* FOOTER */}
      <SiteFooter />
    </div>
  );
}
