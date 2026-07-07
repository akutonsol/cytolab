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

const HeroVial = dynamic(() => import('@/components/landing/HeroVial'), {
  ssr: false,
  loading: () => <div style={{ width: 600, height: 700 }} />,
});

// Floating live AI-telemetry panels overlaying the hero vial (canvas + parallax).
const HeroStatCards = dynamic(() => import('@/components/landing/HeroStatCards'), { ssr: false });

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

  const pipeline: PipelineStep[] = [
    { Icon: FlaskConical, label: 'Collect', desc: 'Seamless specimen intake and tracking' },
    { Icon: Cog, label: 'Process', desc: 'Automated preparation and digital imaging' },
    { Icon: BrainCircuit, label: 'AI Analyze', desc: 'AI-powered screening with high accuracy', active: true },
    { Icon: Eye, label: 'Review', desc: 'Pathologist review and quality control' },
    { Icon: FileText, label: 'Report', desc: 'Structured reporting and delivery' },
  ];

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
        minHeight: '100vh', paddingTop: 78,
        background: 'radial-gradient(circle at 62% 48%, #ffffff 0%, #f6f7fb 55%, #eceef4 100%)',
        display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center', overflow: 'hidden', position: 'relative',
      }}>
        <motion.div
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: 'easeOut' }}
          style={{ padding: '80px 64px' }}
        >
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'rgba(230,57,70,0.1)', border: '1px solid rgba(230,57,70,0.2)',
            borderRadius: 20, padding: '6px 14px', marginBottom: 24,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: RED }} />
            <span style={{ fontSize: 12, color: RED, fontWeight: 600, letterSpacing: '0.04em' }}>ARTIFICIAL INTELLIGENCE · PATHOLOGY</span>
          </div>
          <h1 style={{ fontSize: 64, fontWeight: 900, lineHeight: 1.05, color: INK, margin: '0 0 16px', letterSpacing: '-0.02em' }}>
            Unified pathology.<br />One platform.<br />
            <em style={{ color: RED, fontStyle: 'italic' }}>Cellular level.</em>
          </h1>
          <p style={{ fontSize: 16, color: '#6B7280', lineHeight: 1.7, maxWidth: 400, marginBottom: 32 }}>
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

        <div style={{ position: 'relative', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 600, height: 700, position: 'relative', zIndex: 2 }}>
            <HeroVial />
          </div>
          <div style={{ position: 'absolute', top: '50%', right: 32, transform: 'translateY(-50%)', zIndex: 3 }}>
            <HeroStatCards />
          </div>
        </div>
      </section>

      {/* TRUSTED BY */}
      <section style={{ background: '#fff', padding: '32px 64px', borderBottom: '1px solid #F3F4F6' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600, letterSpacing: '0.1em', textAlign: 'center', marginBottom: 24, textTransform: 'uppercase' }}>
            Trusted by leading institutions
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.5 }}>
            {['Mayo Clinic', 'Quest Diagnostics', 'LabCorp', 'ARUP Laboratories', 'Sonic Healthcare', 'Cleveland Clinic'].map((name) => (
              <div key={name} style={{ fontSize: 14, fontWeight: 700, color: '#374151', letterSpacing: '0.02em' }}>{name}</div>
            ))}
          </div>
        </div>
      </section>

      {/* WORKFLOW PIPELINE (dark) */}
      <section id="solutions" style={{ background: INK, padding: '80px 64px' }}>
        <Reveal>
          <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 64, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, color: RED, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>ONE SYSTEM. END TO END.</div>
              <h2 style={{ fontSize: 48, fontWeight: 900, color: '#fff', lineHeight: 1.1, margin: '0 0 16px' }}>
                Built for the way pathology labs <em style={{ color: RED, fontStyle: 'italic' }}>work.</em>
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15, lineHeight: 1.7 }}>
                From collection to diagnosis, CYTOLAB connects every step in a seamless, intelligent workflow.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
              {pipeline.map(({ Icon, label, desc, active }, i, arr) => (
                <div key={label} style={{ display: 'flex', alignItems: 'flex-start', flex: 1 }}>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{
                      width: 64, height: 64, borderRadius: '50%',
                      background: active ? RED : 'rgba(255,255,255,0.08)',
                      border: `2px solid ${active ? RED : 'rgba(255,255,255,0.15)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
                      boxShadow: active ? '0 0 30px rgba(230,57,70,0.4)' : 'none',
                    }}>
                      <Icon size={24} color="#fff" strokeWidth={1.75} />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: active ? RED : '#fff', marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.4, padding: '0 6px' }}>{desc}</div>
                  </div>
                  {i < arr.length - 1 && (
                    <div style={{ width: 32, height: 2, background: 'rgba(255,255,255,0.15)', flexShrink: 0, margin: '31px 4px 0', position: 'relative' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: RED, position: 'absolute', right: 0, top: -3 }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* PRODUCT PREVIEW */}
      <section id="resources" style={{ background: '#fff', padding: '80px 64px' }}>
        <Reveal>
          <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 64, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>SMARTER INSIGHTS. REAL RESULTS.</div>
              <h2 style={{ fontSize: 48, fontWeight: 900, lineHeight: 1.1, margin: '0 0 24px' }}>
                Everything you need. All in <em style={{ color: RED, fontStyle: 'italic' }}>one platform.</em>
              </h2>
              <p style={{ color: '#6B7280', fontSize: 15, lineHeight: 1.7, marginBottom: 32 }}>
                Advanced AI. Real-time data. Intuitive tools. Designed for pathologists and built for performance.
              </p>
              {features.map(({ Icon, label, desc, badge }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 0', borderBottom: '1px solid #F3F4F6', cursor: 'pointer' }}>
                  <div style={{ width: 40, height: 40, background: 'rgba(230,57,70,0.08)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={18} color={RED} strokeWidth={2} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: INK }}>{label}</span>
                      {badge && <span style={{ fontSize: 10, background: RED, color: '#fff', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>{badge}</span>}
                    </div>
                    <div style={{ fontSize: 13, color: '#9CA3AF' }}>{desc}</div>
                  </div>
                  <ChevronRight size={18} color="#D1D5DB" />
                </div>
              ))}
              <a href="#features" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: RED, fontWeight: 600, fontSize: 14, textDecoration: 'none', marginTop: 24 }}>
                Explore all features <ArrowRight size={14} />
              </a>
            </div>

            <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #E5E7EB', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.12)' }}>
              <div style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 20, height: 20, background: RED, borderRadius: 4 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>CYTOLAB</span>
                </div>
                <div style={{ fontSize: 11, color: '#9CA3AF' }}>This Week ▾</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', borderBottom: '1px solid #F3F4F6', padding: '16px 20px' }}>
                {kpis.map(({ label, value, trend, up }) => (
                  <div key={label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#9CA3AF', marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: INK }}>{value}</div>
                    <div style={{ fontSize: 10, color: up ? GREEN : RED, fontWeight: 600 }}>{up ? '↑' : '↓'} {trend}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, padding: '16px 20px' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 12 }}>AI Screening Overview</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ width: 80, height: 80, borderRadius: '50%', background: `conic-gradient(${RED} 0% 42%, ${INDIGO} 42% 68%, #9CA3AF 68% 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: 55, height: 55, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: 900, color: INK }}>98.4%</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 11 }}>
                      {([['High Confidence', RED], ['Medium Confidence', INDIGO], ['Low Confidence', '#9CA3AF']] as [string, string][]).map(([lbl, c]) => (
                        <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                          <div style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
                          <span style={{ color: '#374151' }}>{lbl}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Recent Records</div>
                  {recentRecords.map(({ id, type, status, color }) => (
                    <div key={id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #F9FAFB' }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>{id}</div>
                        <div style={{ fontSize: 10, color: '#9CA3AF' }}>{type}</div>
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 700, color, background: `${color}15`, padding: '2px 6px', borderRadius: 4 }}>{status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* STATS BAR */}
      <section style={{ background: '#F8F8FA', padding: 64, borderTop: '1px solid #E5E7EB', borderBottom: '1px solid #E5E7EB' }}>
        <Reveal>
          <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 32 }}>
            {bigStats.map(({ Icon, value, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 48, height: 48, background: 'rgba(230,57,70,0.08)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={20} color={RED} strokeWidth={2} />
                </div>
                <div>
                  <div style={{ fontSize: 36, fontWeight: 900, color: INK, lineHeight: 1 }}>{value}</div>
                  <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>{label}</div>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
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
      <section id="demo" style={{ background: `linear-gradient(135deg, #C41E3A 0%, ${RED} 50%, #B71C1C 100%)`, padding: '80px 64px', position: 'relative', overflow: 'hidden' }}>
        {footerCells.map((cell, i) => (
          <div key={i} style={{ position: 'absolute', width: cell.size, height: cell.size, borderRadius: '50%', background: 'rgba(255,255,255,0.3)', top: cell.top, right: cell.right, bottom: cell.bottom, opacity: cell.opacity }} />
        ))}
        <Reveal>
          <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center', position: 'relative', zIndex: 1 }}>
            <div>
              <h2 style={{ fontSize: 52, fontWeight: 900, color: '#fff', lineHeight: 1.1, margin: '0 0 16px' }}>
                The arterial operating system your pathology lab deserves.
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15, marginBottom: 32 }}>Join 500+ labs transforming diagnostic excellence with CYTOLAB.</p>
              <div style={{ display: 'flex', gap: 12 }}>
                <a href="#demo" style={{ background: '#fff', color: RED, padding: '14px 28px', borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  Schedule Live Demo <ArrowRight size={16} />
                </a>
                <a href="#support" style={{ background: 'transparent', color: '#fff', padding: '14px 28px', borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none', border: '2px solid rgba(255,255,255,0.4)' }}>Contact Sales</a>
              </div>
            </div>
            <div id="compliance" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {['HIPAA COMPLIANT', 'SOC 2 TYPE II CERTIFIED', 'ENTERPRISE READY'].map((item) => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Check size={14} color="#fff" strokeWidth={3} />
                  </div>
                  <span style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600, fontSize: 14, letterSpacing: '0.05em' }}>{item}</span>
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
