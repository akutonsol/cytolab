'use client';

import Link from 'next/link';
import {
  Microscope, Building2, Network, TrendingUp, BrainCircuit, Workflow,
  BarChart3, Users, Share2, ArrowRight,
} from 'lucide-react';
import { MarketingPage } from '@/components/landing/marketing-chrome';
import { RED, INK, INDIGO, VIOLET, GREEN, Card, IconTile, CheckItem, Section, PageHero } from '@/components/landing/marketing-ui';

const CAPABILITIES: { Icon: typeof BrainCircuit; tint: string; title: string; desc: string }[] = [
  { Icon: BrainCircuit, tint: RED, title: 'AI-assisted screening', desc: 'Prioritize abnormal cases and cut routine workload with models trained on 50M+ cells.' },
  { Icon: Workflow, tint: INDIGO, title: 'Workflow automation', desc: 'Standardize intake, accessioning, review, and sign-out into one connected pipeline.' },
  { Icon: BarChart3, tint: VIOLET, title: 'Analytics & QA', desc: 'Bethesda distributions, turnaround times, and correlation surfaced in real time.' },
  { Icon: Users, tint: GREEN, title: 'Client & referral portal', desc: 'Give referring clinicians secure access to results, requisitions, and reports.' },
  { Icon: Share2, tint: RED, title: 'LIS & FHIR integration', desc: 'Interoperate with existing lab systems and export structured, standards-based results.' },
  { Icon: TrendingUp, tint: INDIGO, title: 'Throughput at scale', desc: 'Handle rising case volume without adding headcount — up to 40% faster turnaround.' },
];

const AUDIENCES: { Icon: typeof Microscope; title: string; desc: string; points: string[] }[] = [
  {
    Icon: Microscope, title: 'Cytology labs',
    desc: 'Gyn and non-gyn cytology, screened and reported on one platform.',
    points: ['AI pre-screening for Pap & non-gyn', 'Bethesda-structured reporting', 'Focus-mode slide review'],
  },
  {
    Icon: Building2, title: 'Hospital pathology departments',
    desc: 'Fit CYTOLAB into hospital operations with the controls IT expects.',
    points: ['SSO & enterprise RBAC', 'Audit-ready compliance', 'LIS interoperability'],
  },
  {
    Icon: Network, title: 'Reference & high-volume labs',
    desc: 'Scale throughput and multi-site operations without losing consistency.',
    points: ['Multi-tenant isolation', 'Batch authorization', 'Workload analytics & TAT'],
  },
  {
    Icon: TrendingUp, title: 'Independent & growing labs',
    desc: 'Enterprise-grade tooling at a footprint that fits a lean team.',
    points: ['Fast onboarding', 'Unlimited AI screening', 'Predictable pricing'],
  },
];

export default function SolutionsPage() {
  return (
    <MarketingPage active="solutions">
      <PageHero
        eyebrow="Solutions"
        title="One platform, tailored to how"
        accent="your lab works."
        sub="Whether you run a focused cytology practice or a multi-site reference lab, CYTOLAB adapts to your workflow — bringing AI screening, automation, and analytics into a single system."
      >
        <div style={{ display: 'flex', gap: 14 }}>
          <Link href="/book-demo" style={{ background: RED, color: '#fff', padding: '14px 26px', borderRadius: 11, fontWeight: 700, fontSize: 15, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            Book a demo <ArrowRight size={16} />
          </Link>
          <Link href="/#resources" style={{ background: '#fff', color: INK, padding: '14px 26px', borderRadius: 11, fontWeight: 700, fontSize: 15, textDecoration: 'none', border: '1px solid #E5E7EB' }}>
            Explore the platform
          </Link>
        </div>
      </PageHero>

      {/* CAPABILITIES */}
      <Section eyebrow="Capabilities" title="Everything a modern pathology lab needs" sub="Modular by design — adopt what you need today and grow into the rest.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {CAPABILITIES.map(({ Icon, tint, title, desc }) => (
            <Card key={title}>
              <IconTile tint={tint}><Icon size={22} /></IconTile>
              <div style={{ fontSize: 17, fontWeight: 800, color: INK, margin: '16px 0 6px' }}>{title}</div>
              <div style={{ fontSize: 13.5, color: '#64748b', lineHeight: 1.55 }}>{desc}</div>
            </Card>
          ))}
        </div>
      </Section>

      {/* BY AUDIENCE */}
      <Section bg="#f8f7ff" eyebrow="Built for your lab" title="Solutions by lab type">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
          {AUDIENCES.map(({ Icon, title, desc, points }) => (
            <Card key={title} style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
              <IconTile tint={RED}><Icon size={22} /></IconTile>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: INK, marginBottom: 4 }}>{title}</div>
                <div style={{ fontSize: 13.5, color: '#64748b', lineHeight: 1.55, marginBottom: 12 }}>{desc}</div>
                {points.map((p) => <CheckItem key={p}>{p}</CheckItem>)}
              </div>
            </Card>
          ))}
        </div>
      </Section>

      {/* CTA */}
      <section style={{ background: '#fff', padding: '20px 64px 96px' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', background: 'linear-gradient(135deg, #E63946 0%, #C1121F 100%)', borderRadius: 24, padding: '52px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 40, flexWrap: 'wrap' }}>
          <div style={{ maxWidth: 560 }}>
            <h2 style={{ fontSize: 30, fontWeight: 800, color: '#fff', margin: '0 0 10px', letterSpacing: '-0.02em' }}>See it on your workflow</h2>
            <p style={{ fontSize: 15.5, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, margin: 0 }}>Book a 30-minute walkthrough and we&apos;ll map CYTOLAB to your lab&apos;s exact process.</p>
          </div>
          <Link href="/book-demo" style={{ background: '#fff', color: RED, padding: '15px 30px', borderRadius: 12, fontWeight: 700, fontSize: 15, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
            Book a demo <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </MarketingPage>
  );
}
