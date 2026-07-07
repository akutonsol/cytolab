'use client';

import { useEffect } from 'react';
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

import { WorkflowSection } from '@/components/marketing/WorkflowSection';

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

      {/* SECTION A — LIVE WORKFLOW PIPELINE (dark rounded card) */}
      <section style={{
        margin: '0 40px 0 40px',
        background: '#0d0d1a',
        borderRadius: '24px',
        padding: '32px 48px 40px 48px',
        border: '1px solid rgba(255,255,255,0.08)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Purple top glow */}
        <div style={{
          position: 'absolute', top: '-60px', left: '50%', transform: 'translateX(-50%)',
          width: '600px', height: '160px',
          background: 'radial-gradient(ellipse, rgba(139,92,246,0.35) 0%, rgba(109,40,217,0.15) 40%, transparent 70%)',
          pointerEvents: 'none', zIndex: 0,
        }} />

        {/* Header row */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>
              Live Workflow
            </span>
            <span style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', borderRadius: '20px', padding: '3px 10px', fontSize: '11px', fontWeight: 600 }}>
              ● LIVE
            </span>
          </div>
          <button style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.7)', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' }}>
            View Full Pipeline →
          </button>
        </div>

        {/* Pipeline steps */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'flex-start', marginBottom: '40px' }}>
          {[
            { n: 1, label: 'Collect', sub: 'Sample received', time: '2 min ago', s: 'done' },
            { n: 2, label: 'Process', sub: 'Slide prepared', time: '4 min ago', s: 'done' },
            { n: 3, label: 'AI Analyze', sub: 'Analyzing cells', time: 'In progress', s: 'active' },
            { n: 4, label: 'Review', sub: 'Pathologist review', time: 'Pending', s: 'pending' },
            { n: 5, label: 'Report', sub: 'Report generated', time: 'Pending', s: 'pending' },
          ].map((step, i, arr) => (
            <div key={step.n} style={{ display: 'flex', alignItems: 'flex-start', flex: i < arr.length - 1 ? 1 : 'none' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '80px' }}>
                <div style={{ position: 'relative' }}>
                  {step.s === 'active' ? (
                    <div style={{
                      width: '52px', height: '52px', borderRadius: '50%', background: 'transparent',
                      border: '2px solid #E63946', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '18px', fontWeight: 800, color: '#E63946',
                      boxShadow: '0 0 0 4px rgba(230,57,70,0.15), 0 0 20px rgba(230,57,70,0.3)',
                    }}>{step.n}</div>
                  ) : step.s === 'done' ? (
                    <div style={{
                      width: '52px', height: '52px', borderRadius: '50%', background: '#1a1a2e',
                      border: step.n === 1 ? '2px solid rgba(255,255,255,0.2)' : '2px solid rgba(255,255,255,0.25)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '18px', fontWeight: 800, color: step.n === 1 ? 'white' : 'rgba(255,255,255,0.8)',
                    }}>{step.n}</div>
                  ) : (
                    <div style={{
                      width: '52px', height: '52px', borderRadius: '50%', background: 'transparent',
                      border: '2px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '18px', fontWeight: 800, color: 'rgba(255,255,255,0.25)',
                    }}>{step.n}</div>
                  )}
                  {step.s === 'done' && step.n === 1 && (
                    <div style={{
                      position: 'absolute', bottom: '-2px', right: '-2px', width: '20px', height: '20px', borderRadius: '50%',
                      background: '#E63946', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '11px', color: 'white', fontWeight: 700, border: '2px solid #0d0d1a',
                    }}>✓</div>
                  )}
                </div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'white', marginTop: '12px', textAlign: 'center' }}>{step.label}</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: '2px', textAlign: 'center' }}>{step.sub}</div>
                <div style={{ fontSize: '11px', marginTop: '3px', textAlign: 'center', color: step.s === 'done' ? '#22c55e' : step.s === 'active' ? '#E63946' : 'rgba(255,255,255,0.25)' }}>{step.time}</div>
              </div>
              {i < arr.length - 1 && (
                <div style={{
                  height: '2px', flex: 1, marginTop: '26px', marginLeft: '4px', marginRight: '4px',
                  background: i === 0 ? 'linear-gradient(90deg, rgba(255,255,255,0.3), #E63946)' : i === 1 ? '#E63946' : 'rgba(255,255,255,0.1)',
                }} />
              )}
            </div>
          ))}
        </div>

        {/* Stats cards row */}
        <div style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '20px' }}>
          {/* Card 1 — Active Cases */}
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '24px', backdropFilter: 'blur(10px)' }}>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontWeight: 600, marginBottom: '8px' }}>Active Cases</div>
            <div style={{ fontSize: '36px', fontWeight: 800, color: 'white', lineHeight: 1 }}>4,281</div>
            <div style={{ fontSize: '12px', color: '#22c55e', marginTop: '4px' }}>+231 today</div>
            <svg width="120" height="52" viewBox="0 0 120 52" style={{ marginTop: '12px' }}>
              {[18, 28, 22, 38, 26, 44, 35, 20, 42, 38, 28, 36].map((h, i) => {
                const x = i * 10 + 1;
                const y = 52 - h;
                const isLast = i === 11;
                return (
                  <g key={i}>
                    <defs>
                      <linearGradient id={`bar${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={isLast ? '#ff6b8a' : '#E63946'} stopOpacity="0.9" />
                        <stop offset="100%" stopColor="#E63946" stopOpacity="0.2" />
                      </linearGradient>
                    </defs>
                    <rect x={x} y={y} width="7" height={h} rx="2" fill={`url(#bar${i})`} />
                    <circle cx={x + 3.5} cy={y} r="3" fill={isLast ? '#ff6b8a' : '#E63946'} filter="url(#barGlow)" />
                  </g>
                );
              })}
              <defs>
                <filter id="barGlow">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
            </svg>
          </div>

          {/* Card 2 — In Analysis */}
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '24px', backdropFilter: 'blur(10px)' }}>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontWeight: 600, marginBottom: '8px' }}>In Analysis</div>
            <div style={{ fontSize: '36px', fontWeight: 800, color: 'white', lineHeight: 1 }}>1,247</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>29% of total</div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <svg width="80" height="80" viewBox="0 0 80 80" style={{ marginTop: '12px' }}>
                <defs>
                  <linearGradient id="donutGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" />
                    <stop offset="100%" stopColor="#E63946" />
                  </linearGradient>
                </defs>
                <circle cx="40" cy="40" r="30" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
                <circle cx="40" cy="40" r="30" fill="none" stroke="url(#donutGrad)" strokeWidth="8" strokeDasharray={`${2 * Math.PI * 30 * 0.29} ${2 * Math.PI * 30}`} strokeLinecap="round" transform="rotate(-90 40 40)" />
                <text x="40" y="44" textAnchor="middle" fill="white" fontSize="13" fontWeight="700">29%</text>
              </svg>
            </div>
          </div>

          {/* Card 3 — High Priority */}
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '24px', position: 'relative', backdropFilter: 'blur(10px)' }}>
            <div style={{ position: 'absolute', top: '16px', right: '16px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 3.5l8.5 15h-17z" stroke="#E63946" strokeWidth="2" strokeLinejoin="round" />
                <line x1="12" y1="10" x2="12" y2="14" stroke="#E63946" strokeWidth="2" strokeLinecap="round" />
                <circle cx="12" cy="16.6" r="0.8" fill="#E63946" />
              </svg>
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontWeight: 600, marginBottom: '8px' }}>High Priority</div>
            <div style={{ fontSize: '36px', fontWeight: 800, color: 'white', lineHeight: 1 }}>38</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>Requires review</div>
            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {[
                { label: 'Atypical', count: 18, color: '#E63946' },
                { label: 'Suspicious', count: 12, color: '#DB2777' },
                { label: 'Critical', count: 8, color: '#ef4444' },
              ].map((item) => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: item.color, fontSize: '8px' }}>●</span>
                    {item.label}
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'white' }}>{item.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Card 4 — System Status */}
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '24px', backdropFilter: 'blur(10px)' }}>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontWeight: 600, marginBottom: '16px' }}>System Status</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {['AI Engine', 'Image Processing', 'Data Sync', 'Storage'].map((item) => (
                <div key={item} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.65)' }}>{item}</span>
                  <span style={{ fontSize: '12px', color: '#22c55e', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '7px' }}>●</span> Operational
                  </span>
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

          {/* Right column — microscopy viewer + analysis + findings */}
          <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0', borderRadius: '20px', overflow: 'hidden', border: '1px solid #e5e7eb', minHeight: '420px' }}>

            {/* LEFT: Microscopy image */}
            <div style={{ position: 'relative', background: '#f0eef8', overflow: 'hidden' }}>
              {/* Atypical Cell Detected badge */}
              <div style={{ position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)', background: '#E63946', color: 'white', borderRadius: '20px', padding: '4px 14px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap', zIndex: 10 }}>
                ● Atypical Cell Detected
              </div>

              {/* CSS microscopy cells */}
              {[
                { s: 160, t: '5%', l: '5%', c: 'rgba(109,40,217,0.45)', n: 'rgba(80,20,180,0.7)' },
                { s: 140, t: '15%', l: '45%', c: 'rgba(124,58,237,0.40)', n: 'rgba(90,25,190,0.65)' },
                { s: 120, t: '50%', l: '10%', c: 'rgba(139,92,246,0.38)', n: 'rgba(100,30,200,0.6)' },
                { s: 150, t: '45%', l: '50%', c: 'rgba(109,40,217,0.42)', n: 'rgba(80,20,180,0.68)' },
                { s: 100, t: '70%', l: '30%', c: 'rgba(124,58,237,0.35)', n: 'rgba(90,25,190,0.58)' },
                { s: 110, t: '60%', l: '68%', c: 'rgba(139,92,246,0.40)', n: 'rgba(100,30,200,0.62)' },
                { s: 90, t: '25%', l: '75%', c: 'rgba(109,40,217,0.32)', n: 'rgba(80,20,180,0.55)' },
              ].map((cell, i) => (
                <div key={i} style={{
                  position: 'absolute', width: `${cell.s}px`, height: `${cell.s}px`, top: cell.t, left: cell.l, borderRadius: '50%',
                  background: `radial-gradient(circle at 35% 35%, ${cell.c.replace(/[\d.]+\)/, '0.6)')}, ${cell.c})`,
                  boxShadow: 'inset -8px -8px 20px rgba(0,0,0,0.2), inset 4px 4px 12px rgba(255,255,255,0.15)',
                }}>
                  <div style={{
                    position: 'absolute', width: `${cell.s * 0.38}px`, height: `${cell.s * 0.38}px`, top: '50%', left: '50%',
                    transform: 'translate(-40%, -40%)', borderRadius: '50%', background: cell.n,
                    boxShadow: 'inset -3px -3px 8px rgba(0,0,0,0.3)',
                  }} />
                </div>
              ))}

              {/* AI Detection box with corner markers */}
              <div style={{ position: 'absolute', top: '42%', left: '22%', width: '120px', height: '120px', border: '2px solid #E63946', borderRadius: '6px', boxShadow: '0 0 12px rgba(230,57,70,0.3)' }}>
                <div style={{ position: 'absolute', top: -2, left: -2, width: 12, height: 12, borderTop: '3px solid #E63946', borderLeft: '3px solid #E63946' }} />
                <div style={{ position: 'absolute', top: -2, right: -2, width: 12, height: 12, borderTop: '3px solid #E63946', borderRight: '3px solid #E63946' }} />
                <div style={{ position: 'absolute', bottom: -2, left: -2, width: 12, height: 12, borderBottom: '3px solid #E63946', borderLeft: '3px solid #E63946' }} />
                <div style={{ position: 'absolute', bottom: -2, right: -2, width: 12, height: 12, borderBottom: '3px solid #E63946', borderRight: '3px solid #E63946' }} />
              </div>
            </div>

            {/* RIGHT SIDE: dark analysis + white findings */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {/* Dark Analysis Card */}
              <div style={{ background: '#1a1a2e', padding: '24px', flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: '16px' }}>Analysis Progress</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px' }}>Scanning cells...</div>
                <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '4px', height: '4px', marginBottom: '4px' }}>
                  <div style={{ width: '76%', height: '100%', borderRadius: '4px', background: 'linear-gradient(90deg,#E63946,#ff6b8a)' }} />
                </div>
                <div style={{ fontSize: '12px', color: 'white', fontWeight: 600, textAlign: 'right', marginBottom: '20px' }}>76%</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginBottom: '2px' }}>Cells Analyzed</div>
                <div style={{ fontSize: '32px', fontWeight: 800, color: 'white', lineHeight: 1, marginBottom: '16px' }}>14,223</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginBottom: '6px' }}>AI Confidence</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                  <span style={{ fontSize: '28px', fontWeight: 800, color: 'white' }}>98.4%</span>
                  <span style={{ background: 'rgba(34,197,94,0.2)', color: '#22c55e', borderRadius: '20px', padding: '3px 10px', fontSize: '11px', fontWeight: 600 }}>High Confidence</span>
                </div>
                {/* Green sparkline */}
                <svg width="100%" height="36" viewBox="0 0 200 36">
                  <defs>
                    <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <polygon points="0,28 20,24 40,26 60,20 80,22 100,16 120,18 140,12 160,15 180,10 200,8 200,36 0,36" fill="url(#sparkGrad)" />
                  <polyline points="0,28 20,24 40,26 60,20 80,22 100,16 120,18 140,12 160,15 180,10 200,8" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" />
                  {[[0, 28], [60, 20], [120, 18], [180, 10], [200, 8]].map(([x, y], i) => (
                    <circle key={i} cx={x} cy={y} r="3" fill="#22c55e" />
                  ))}
                </svg>
              </div>

              {/* White Top Findings Card */}
              <div style={{ background: 'white', padding: '24px', borderTop: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0a0b1a', marginBottom: '16px' }}>Top Findings</div>
                {[
                  { label: 'Atypical Squamous Cells', count: 18, color: '#E63946' },
                  { label: 'LSIL', count: 12, color: '#DB2777' },
                  { label: 'HSIL', count: 5, color: '#8b5cf6' },
                  { label: 'Negative', count: 1247, color: '#22c55e' },
                ].map((row, i, arr) => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < arr.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <span style={{ fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: row.color, fontSize: '9px' }}>●</span>
                      {row.label}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#0a0b1a' }}>{row.count.toLocaleString()}</span>
                  </div>
                ))}
                <button style={{ width: '100%', marginTop: '14px', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', background: 'white', fontSize: '13px', color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 500 }}>
                  View Full Results →
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

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

      {/* WORKFLOW — interactive animated pipeline */}
      <WorkflowSection />

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
