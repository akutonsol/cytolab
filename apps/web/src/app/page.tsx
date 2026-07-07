'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import {
  FlaskConical, Cog, BrainCircuit, Eye, FileText,
  Sparkles, Zap, BarChart3, ScanSearch,
  Target, Clock, ShieldCheck,
  Play, ArrowRight, ChevronRight, Check,
} from 'lucide-react';

import { WorkflowPipeline } from '@/components/landing/WorkflowPipeline';

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
  features: string[]; cta: string; highlighted: boolean; badge?: string;
};

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
      cta: 'Start Free Trial', highlighted: false,
    },
    {
      name: 'Professional', badge: 'MOST POPULAR', desc: 'For established labs and clinics', price: '$1,299', period: '/month',
      features: ['Everything in Community', 'AI Screening Core', 'Workload Analytics', 'Priority Support 24/7', 'HIPAA & SOC-2 Compliance'],
      cta: 'Contact Sales', highlighted: true,
    },
    {
      name: 'Enterprise', desc: 'For large labs and hospital systems', price: 'Custom', period: '',
      features: ['Everything in Professional', 'SSO & Advanced Security', 'Custom Integrations', 'Dedicated Success Manager'],
      cta: 'Talk to Sales', highlighted: false,
    },
  ];

  const footerCells: Cell[] = [
    { size: 200, top: '-40px', right: '100px', opacity: 0.15 },
    { size: 150, bottom: '-30px', right: '300px', opacity: 0.1 },
    { size: 100, top: '20px', right: '400px', opacity: 0.12 },
  ];

  return (
    <div style={{ fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif', color: INK, background: '#fff' }}>
      {/* NAV */}
      <nav style={{
        position: 'fixed', top: 0, width: '100%', zIndex: 100,
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(0,0,0,0.06)', padding: '0 48px', height: 78,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Cell-cluster mark (ring of dots + nucleus) to match the brand logo. */}
          <svg width="42" height="42" viewBox="0 0 32 32" fill="none" aria-hidden>
            {Array.from({ length: 8 }).map((_, i) => {
              const a = (i / 8) * Math.PI * 2;
              return <circle key={i} cx={16 + 9 * Math.cos(a)} cy={16 + 9 * Math.sin(a)} r={2.5} fill={RED} />;
            })}
            <circle cx="16" cy="16" r="3" fill={RED} />
            <circle cx="11.5" cy="12.5" r="1.7" fill={RED} opacity={0.75} />
            <circle cx="20.5" cy="19.5" r="1.7" fill={RED} opacity={0.75} />
          </svg>
          <span style={{ fontWeight: 900, fontSize: 25, letterSpacing: '0.02em' }}>CYTOLAB</span>
        </div>
        <div style={{ display: 'flex', gap: 38, fontSize: 17 }}>
          {['Platform', 'Solutions', 'Resources', 'Pricing', 'Compliance', 'Support'].map((item, i) => (
            <a key={item} href={`#${item.toLowerCase()}`} style={{
              color: i === 0 ? RED : '#1F2937', fontWeight: i === 0 ? 700 : 600, textDecoration: 'none',
              borderBottom: i === 0 ? `2.5px solid ${RED}` : 'none', paddingBottom: 4,
            }}>{item}</a>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <a href="#demo" style={{
            background: RED, color: '#fff', padding: '13px 30px', borderRadius: 11,
            fontWeight: 700, fontSize: 16, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8,
          }}>Request Demo <ArrowRight size={18} /></a>
        </div>
      </nav>

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
            <a href="#demo" style={{
              background: RED, color: '#fff', padding: '14px 28px', borderRadius: 10, fontWeight: 700, fontSize: 15,
              textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8,
            }}>Request Demo <ArrowRight size={16} /></a>
            <a href="#overview" style={{ color: '#374151', fontSize: 14, fontWeight: 500, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 34, height: 34, borderRadius: '50%', border: `1px solid ${RED}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: RED }}>
                <Play size={14} fill={RED} />
              </span>
              Watch Overview
            </a>
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
          <button style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.7)', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" />
            </svg>
            View Full Pipeline
            <ChevronRight size={14} />
          </button>
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
            <div style={{ fontSize: '36px', fontWeight: 800, color: 'white', lineHeight: 1 }}>38</div>
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
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>{item.count}</span>
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
      <section style={{ padding: '72px 80px', marginTop: 0, background: 'white' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '38% 62%', gap: '80px', alignItems: 'center', maxWidth: '1280px', margin: '0 auto' }}>
          {/* Left column */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.15em', color: '#E63946', textTransform: 'uppercase', marginBottom: '16px' }}>AI Screening</div>
            <h2 style={{ fontSize: '44px', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#0a0b1a', margin: 0 }}>
              Smarter screening.<br />Stronger outcomes.
            </h2>
            <p style={{ fontSize: '16px', color: '#64748b', lineHeight: 1.65, marginTop: '20px', maxWidth: '380px' }}>
              Our AI models analyze millions of cells in seconds, prioritizing what matters most and reducing routine workload by up to 70%.
            </p>
            <div style={{ marginTop: '28px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[
                { text: 'Deep learning models trained on 50M+ cells', icon: <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" fill="#E63946" /> },
                { text: '99%+ accuracy on key abnormality detection', icon: <><circle cx="12" cy="12" r="3" fill="#E63946" /><circle cx="12" cy="12" r="6" fill="none" stroke="#E63946" strokeWidth="1.5" /></> },
                { text: 'Continuous learning from expert feedback', icon: <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" fill="#E63946" /> },
                { text: 'CAP & CLIA validated workflows', icon: <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" fill="#E63946" /> },
              ].map((feat, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(230,57,70,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">{feat.icon}</svg>
                  </div>
                  <span style={{ fontSize: '14px', color: '#374151', fontWeight: 500 }}>{feat.text}</span>
                </div>
              ))}
            </div>
            <button style={{ marginTop: '32px', display: 'inline-flex', alignItems: 'center', gap: '6px', border: '1.5px solid #E63946', color: '#E63946', background: 'transparent', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
              Explore AI Screening →
            </button>
          </div>

          {/* Right column — 3-panel: microscopy slide / analysis / findings */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0',
            borderRadius: '20px', overflow: 'hidden', border: '1px solid #e5e7eb',
            minHeight: '480px', boxShadow: '0 20px 60px rgba(0,0,0,0.08)',
          }}>

            {/* ── COL 1: MICROSCOPY SLIDE ── */}
            <div style={{ position: 'relative', background: '#f0ecf8', overflow: 'hidden', minHeight: '480px' }}>
              {/* Slide stain texture */}
              <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                background: 'radial-gradient(ellipse 40% 30% at 20% 30%, rgba(147,112,219,0.25) 0%, transparent 70%), radial-gradient(ellipse 50% 40% at 70% 60%, rgba(138,43,226,0.20) 0%, transparent 70%), radial-gradient(ellipse 60% 50% at 50% 50%, rgba(221,210,243,0.40) 0%, transparent 80%), linear-gradient(135deg, #f5f0fc 0%, #ede4f8 50%, #f0ecf8 100%)',
              }} />

              {/* Dense cell field */}
              {([
                [12, 8, 52, 0.55, true, 18], [38, 5, 44, 0.48, true, 15], [68, 10, 38, 0.52, true, 13],
                [85, 8, 46, 0.44, true, 16], [5, 28, 40, 0.50, true, 14], [25, 22, 60, 0.60, true, 22],
                [55, 18, 48, 0.56, true, 17], [78, 25, 35, 0.45, true, 12], [95, 20, 42, 0.50, true, 15],
                [15, 48, 38, 0.48, true, 13], [40, 42, 55, 0.58, true, 20], [65, 45, 42, 0.52, true, 15],
                [88, 42, 50, 0.55, true, 18], [8, 65, 46, 0.50, true, 16], [30, 62, 40, 0.45, true, 14],
                [58, 60, 65, 0.62, true, 24], [82, 65, 38, 0.48, true, 13], [20, 80, 44, 0.52, true, 15],
                [48, 78, 50, 0.55, true, 18], [72, 80, 42, 0.50, true, 15], [90, 78, 36, 0.44, true, 12],
                [35, 90, 38, 0.48, true, 13], [62, 92, 46, 0.52, true, 16],
                [50, 35, 22, 0.35, false, 0], [75, 35, 18, 0.30, false, 0], [10, 40, 20, 0.32, false, 0],
                [92, 55, 16, 0.28, false, 0], [22, 55, 24, 0.36, false, 0],
              ] as [number, number, number, number, boolean, number][]).map(([cx, cy, r, op, hasNuc, nucR], i) => (
                <div key={i} style={{
                  position: 'absolute', left: `${cx}%`, top: `${cy}%`,
                  width: `${r * 2}px`, height: `${r * 2}px`, transform: 'translate(-50%, -50%)', borderRadius: '50%',
                  background: `radial-gradient(circle at 35% 35%, rgba(180,140,230,${op + 0.1}) 0%, rgba(138,90,210,${op}) 40%, rgba(100,50,180,${op - 0.05}) 100%)`,
                  boxShadow: `inset -${r * 0.15}px -${r * 0.15}px ${r * 0.3}px rgba(60,0,120,0.3), inset ${r * 0.08}px ${r * 0.08}px ${r * 0.2}px rgba(220,200,255,0.2)`,
                }}>
                  {hasNuc && (
                    <div style={{
                      position: 'absolute', width: `${nucR * 2}px`, height: `${nucR * 2}px`, top: '50%', left: '50%',
                      transform: 'translate(-40%, -40%)', borderRadius: '50%',
                      background: 'radial-gradient(circle at 40% 40%, rgba(80,20,150,0.85) 0%, rgba(60,10,120,0.92) 100%)',
                      boxShadow: 'inset -2px -2px 4px rgba(0,0,0,0.4)',
                    }} />
                  )}
                </div>
              ))}

              {/* Primary AI detection box */}
              <div style={{ position: 'absolute', top: '28%', left: '28%', width: '44%', height: '38%', border: '2px solid #E63946', borderRadius: '4px', zIndex: 10 }}>
                <div style={{ position: 'absolute', top: -2, left: -2, width: 12, height: 12, borderTop: '3px solid #E63946', borderLeft: '3px solid #E63946' }} />
                <div style={{ position: 'absolute', top: -2, right: -2, width: 12, height: 12, borderTop: '3px solid #E63946', borderRight: '3px solid #E63946' }} />
                <div style={{ position: 'absolute', bottom: -2, left: -2, width: 12, height: 12, borderBottom: '3px solid #E63946', borderLeft: '3px solid #E63946' }} />
                <div style={{ position: 'absolute', bottom: -2, right: -2, width: 12, height: 12, borderBottom: '3px solid #E63946', borderRight: '3px solid #E63946' }} />
                <div style={{ position: 'absolute', left: 0, right: 0, height: '2px', top: '50%', background: 'linear-gradient(90deg, transparent, rgba(230,57,70,0.8), transparent)', animation: 'scan-line 2s ease-in-out infinite' }} />
              </div>

              {/* Secondary scan box (teal) */}
              <div style={{ position: 'absolute', top: '62%', left: '8%', width: '28%', height: '24%', border: '1.5px dashed rgba(56,189,248,0.7)', borderRadius: '4px', zIndex: 10, boxShadow: '0 0 8px rgba(56,189,248,0.2)' }}>
                <div style={{ position: 'absolute', top: -8, left: 8, background: 'rgba(56,189,248,0.9)', borderRadius: '10px', padding: '2px 8px', fontSize: 9, color: 'white', fontWeight: 600, whiteSpace: 'nowrap' }}>● Monitoring</div>
              </div>

              {/* Atypical cell badge */}
              <div style={{ position: 'absolute', top: '22%', left: '50%', transform: 'translateX(-50%)', background: '#E63946', color: 'white', borderRadius: '20px', padding: '5px 14px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap', zIndex: 20, boxShadow: '0 4px 16px rgba(230,57,70,0.4)', display: 'flex', alignItems: 'center', gap: 5, animation: 'badge-pulse 2s ease-in-out infinite' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'white', display: 'inline-block', animation: 'live-blink 1s ease-in-out infinite' }} />
                Atypical Cell Detected
              </div>
            </div>

            {/* ── COL 2: ANALYSIS PROGRESS ── */}
            <div style={{ background: 'linear-gradient(160deg, #1e1535 0%, #16102a 50%, #1a1228 100%)', padding: '28px 24px', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)', width: 200, height: 100, background: 'radial-gradient(ellipse, rgba(139,92,246,0.3) 0%, transparent 70%)', pointerEvents: 'none' }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: 'white', marginBottom: 20, position: 'relative' }}>Analysis Progress</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>Scanning cells...</div>
              <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 6, height: 6, overflow: 'hidden', marginBottom: 6, position: 'relative' }}>
                <div style={{ width: `${scanProgress}%`, height: '100%', borderRadius: 6, background: 'linear-gradient(90deg, #7c3aed, #a78bfa)', transition: 'width 0.8s ease', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)', animation: 'shimmer 1.5s ease-in-out infinite' }} />
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', textAlign: 'right', marginBottom: 24 }}>{Math.round(scanProgress)}%</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>Cells Analyzed</div>
              <div style={{ fontSize: 34, fontWeight: 800, color: 'white', lineHeight: 1, marginBottom: 20, fontVariantNumeric: 'tabular-nums' }}>{cellsAnalyzed.toLocaleString()}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 8 }}>AI Confidence</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <span style={{ fontSize: 30, fontWeight: 800, color: 'white' }}>98.4%</span>
                <span style={{ background: 'rgba(34,197,94,0.18)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>High Confidence</span>
              </div>
              <div style={{ marginTop: 'auto' }}>
                <svg width="100%" height="60" viewBox="0 0 200 60" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <polygon points="0,55 16,50 32,42 48,45 64,35 80,38 96,28 112,32 128,22 144,26 160,18 176,22 200,14 200,60 0,60" fill="url(#areaGrad)" />
                  <polyline points="0,55 16,50 32,42 48,45 64,35 80,38 96,28 112,32 128,22 144,26 160,18 176,22 200,14" fill="none" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  {([[0, 55, '#22c55e'], [32, 42, '#22c55e'], [64, 35, '#DB2777'], [96, 28, '#22c55e'], [128, 22, '#8b5cf6'], [160, 18, '#22c55e'], [200, 14, '#22c55e']] as [number, number, string][]).map(([x, y, c], i) => (
                    <circle key={i} cx={x} cy={y} r="3.5" fill={c} style={{ filter: `drop-shadow(0 0 3px ${c})` }} />
                  ))}
                  {/* Animated scan dot travelling the line */}
                  <circle r="4" fill="#22c55e" opacity="0.9">
                    <animateMotion dur="4s" repeatCount="indefinite" rotate="auto">
                      <mpath href="#sparkPath" />
                    </animateMotion>
                  </circle>
                  <path id="sparkPath" d="M0,55 L16,50 L32,42 L48,45 L64,35 L80,38 L96,28 L112,32 L128,22 L144,26 L160,18 L176,22 L200,14" fill="none" stroke="none" />
                </svg>
              </div>
            </div>

            {/* ── COL 3: TOP FINDINGS ── */}
            <div style={{ background: 'white', padding: '28px 24px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0a0b1a', marginBottom: 24 }}>Top Findings</div>
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                {[
                  { label: 'Atypical Squamous Cells', count: 18, color: '#E63946', pct: 1.4 },
                  { label: 'LSIL', count: 12, color: '#DB2777', pct: 0.96 },
                  { label: 'HSIL', count: 5, color: '#8b5cf6', pct: 0.40 },
                  { label: 'Negative', count: 1247, color: '#22c55e', pct: 100 },
                ].map((row, i, arr) => (
                  <div key={row.label} style={{ padding: '14px 0', borderBottom: i < arr.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, color: '#374151', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: row.color, boxShadow: `0 0 6px ${row.color}66`, flexShrink: 0, display: 'inline-block' }} />
                        {row.label}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#0a0b1a' }}>{row.count.toLocaleString()}</span>
                    </div>
                    <div style={{ height: 3, background: '#f1f5f9', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 2, background: row.color, opacity: 0.7, width: `${Math.min(row.pct * 2, 100)}%`, maxWidth: '100%', transition: 'width 1s ease' }} />
                    </div>
                  </div>
                ))}
              </div>
              <button style={{ marginTop: 20, width: '100%', padding: '12px', border: '1.5px solid #e5e7eb', borderRadius: 10, background: 'white', fontSize: 14, color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 500, transition: 'all 0.2s ease' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#E63946'; e.currentTarget.style.color = '#E63946'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.color = '#374151'; }}>
                View Full Results →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* LIVING SCIENCE — Three.js organism scene */}
      <LivingScienceSection />

      {/* SECTION C — TRUSTED BY (logos, replaces the old trusted-by strip) */}
      <section style={{ padding: '60px 80px', background: 'white', borderTop: '1px solid #f1f5f9' }}>
        <div style={{ textAlign: 'center', fontSize: '11px', fontWeight: 600, letterSpacing: '0.15em', color: '#94a3b8', marginBottom: '48px', textTransform: 'uppercase' }}>
          Trusted by Leading Labs and Health Systems
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: '48px', alignItems: 'center', maxWidth: '1100px', margin: '0 auto' }}>
          {[
            { name: 'MAYO CLINIC', icon: '✚' },
            { name: 'Labcorp', icon: '◎' },
            { name: 'Quest Diagnostics', icon: '◉' },
            { name: 'Cleveland Clinic', icon: '⊞' },
            { name: 'Sonic Healthcare', icon: '◈' },
            { name: 'agilon health', icon: '✦' },
          ].map((logo) => (
            <div key={logo.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#94a3b8', fontSize: '14px', fontWeight: 700, opacity: 0.65 }}>
              <span style={{ fontSize: '20px' }}>{logo.icon}</span>
              {logo.name}
            </div>
          ))}
        </div>
      </section>

      {/* SECTION D — STATS BAR */}
      <section style={{ padding: '72px 80px', background: '#f8f9ff', borderTop: '1px solid #e5e7eb' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '40px', maxWidth: '1100px', margin: '0 auto' }}>
          {[
            { Icon: ScanSearch, value: '500M+', label: 'Cells analyzed' },
            { Icon: FlaskConical, value: '2,500+', label: 'Labs worldwide' },
            { Icon: ShieldCheck, value: '99.9%', label: 'System uptime' },
            { Icon: Zap, value: '40%', label: 'Faster turnaround' },
            { Icon: BarChart3, value: '70%', label: 'Workload reduction' },
          ].map((stat) => (
            <div key={stat.label} style={{ textAlign: 'center' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'white', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <stat.Icon size={20} color={INK} strokeWidth={2} />
              </div>
              <div style={{ fontSize: '40px', fontWeight: 800, letterSpacing: '-0.02em', color: '#0a0b1a', lineHeight: 1 }}>{stat.value}</div>
              <div style={{ fontSize: '14px', color: '#64748b', marginTop: '6px' }}>{stat.label}</div>
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
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>BUILT FOR EVERY SCALE OF PATHOLOGY</div>
              <p style={{ color: '#6B7280', fontSize: 15 }}>Flexible plans for labs of all sizes. Enterprise-grade security. Unmatched support.</p>
            </div>
          </Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 24, alignItems: 'start' }}>
            {plans.map(({ name, badge, desc, price, period, features: feats, cta, highlighted }, i) => (
              <Reveal key={name} delay={i * 0.08}>
                <div style={{
                  border: highlighted ? `2px solid ${RED}` : '1px solid #E5E7EB', borderRadius: 24, padding: 32,
                  background: '#fff', position: 'relative', boxShadow: highlighted ? '0 20px 60px rgba(230,57,70,0.15)' : 'none',
                }}>
                  {badge && (
                    <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: RED, color: '#fff', fontSize: 10, fontWeight: 800, padding: '4px 12px', borderRadius: 20, letterSpacing: '0.05em' }}>{badge}</div>
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
                  <button style={{
                    width: '100%', padding: 14, background: highlighted ? RED : 'transparent',
                    color: highlighted ? '#fff' : '#374151', border: highlighted ? 'none' : '1px solid #E5E7EB',
                    borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer',
                  }}>{cta}</button>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER CTA (red) */}
      <section id="demo" style={{ background: 'linear-gradient(135deg, #8B0000 0%, #C1121F 35%, #9B1020 65%, #7A0015 100%)', padding: '80px 64px', position: 'relative', overflow: 'hidden' }}>
        <style>{`@keyframes badgePulse { 0%,100%{opacity:.55} 50%{opacity:1} }`}</style>

        {/* Volumetric overlay layers */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 80% at 80% 50%, rgba(255,60,80,0.25) 0%, transparent 60%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 40% 60% at 20% 50%, rgba(80,0,10,0.4) 0%, transparent 55%)', pointerEvents: 'none' }} />

        {footerCells.map((cell, i) => (
          <div key={i} style={{ position: 'absolute', width: cell.size, height: cell.size, borderRadius: '50%', background: 'rgba(255,255,255,0.3)', top: cell.top, right: cell.right, bottom: cell.bottom, opacity: cell.opacity }} />
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
                <a
                  href="#demo"
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 34px rgba(0,0,0,0.28), 0 2px 6px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.9)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.15), 0 1px 4px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.8)'; }}
                  style={{ background: 'rgba(255,255,255,0.95)', color: '#BF0D23', padding: '14px 28px', borderRadius: 50, fontWeight: 700, fontSize: 14, letterSpacing: '0.01em', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid rgba(255,255,255,0.3)', boxShadow: '0 4px 24px rgba(0,0,0,0.15), 0 1px 4px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.8)', backdropFilter: 'blur(8px)', transition: 'all 0.25s ease' }}
                >
                  Schedule Live Demo <ArrowRight size={16} />
                </a>
                <a
                  href="#support"
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                  style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', padding: '14px 28px', borderRadius: 50, fontWeight: 700, fontSize: 14, letterSpacing: '0.01em', textDecoration: 'none', border: '1px solid rgba(255,255,255,0.35)', backdropFilter: 'blur(8px)', transition: 'all 0.25s ease' }}
                >
                  Contact Sales
                </a>
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
      <footer id="support" style={{ background: INK, padding: '32px 64px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 24, height: 24, background: RED, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#fff', fontSize: 10, fontWeight: 900 }}>CY</span>
            </div>
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 700 }}>CYTOLAB</span>
            <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12, marginLeft: 8 }}>© 2026 Cytolabs Associates Ltd.</span>
          </div>
          <div style={{ display: 'flex', gap: 24 }}>
            {['Privacy Policy', 'Terms of Service', 'Security', 'Support'].map((item) => (
              <a key={item} href="#" style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, textDecoration: 'none' }}>{item}</a>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            {['in', 'X', '▶'].map((icon) => (
              <div key={icon} style={{ width: 32, height: 32, background: 'rgba(255,255,255,0.08)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 700 }}>{icon}</span>
              </div>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
