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

// Homepage hero — new AI-pathology design (HeroV2), replaces the old vial hero.
// (Old hero composition lived in HeroScene; HeroV2 is now mounted below the nav.)
import { HeroV2 } from '@/components/hero-v2/HeroV2';
// New V2 landing sections (purple HeroV2 design language).
import { WorkflowSection } from '@/components/landing-v2/WorkflowSection';
import { FeatureGridSection } from '@/components/landing-v2/FeatureGridSection';
import { IntegrationsSection } from '@/components/landing-v2/IntegrationsSection';
import { SecuritySection } from '@/components/landing-v2/SecuritySection';
import { TestimonialsSection } from '@/components/landing-v2/TestimonialsSection';
import { PricingSection } from '@/components/landing-v2/PricingSection';
import { FinalCtaSection } from '@/components/landing-v2/FinalCtaSection';

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

      {/* HERO (v2) — new AI-pathology hero. Keeps the #platform anchor. */}
      <div id="platform" className="scroll-anchor">
        <HeroV2 />
      </div>

      {/* NEW V2 SECTIONS (being built out; old sections below are WIP replacements) */}
      <WorkflowSection />

      <FeatureGridSection />
      <IntegrationsSection />
      <SecuritySection />
      <TestimonialsSection />
      <PricingSection />
      <FinalCtaSection />

      <SiteFooter />
    </div>
  );
}
