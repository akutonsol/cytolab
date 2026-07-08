'use client';

import Link from 'next/link';
import {
  Lock, KeyRound, ScrollText, Server, DatabaseBackup, ShieldCheck,
  Users, Globe2, EyeOff, FileCheck2, ArrowRight, Check,
} from 'lucide-react';
import { MarketingPage } from '@/components/landing/marketing-chrome';
import { RED, INK, GREEN, INDIGO, VIOLET, Card, IconTile, CheckItem, Section } from '@/components/landing/marketing-ui';

const PILLARS: { Icon: typeof Lock; tint: string; title: string; desc: string; points: string[] }[] = [
  {
    Icon: Lock, tint: RED, title: 'Encryption everywhere',
    desc: 'Patient data is protected in transit and at rest with industry-standard cryptography.',
    points: ['TLS 1.2+ for all traffic', 'AES-256 encryption at rest', 'Encrypted database + object storage', 'Key rotation & managed secrets'],
  },
  {
    Icon: Users, tint: INDIGO, title: 'Role-based access control',
    desc: 'Granular permissions ensure every user sees only what their role allows.',
    points: ['Fine-grained RBAC permission matrix', 'Least-privilege by default', 'SSO / SAML on Enterprise', 'MFA & TOTP enforcement'],
  },
  {
    Icon: ScrollText, tint: VIOLET, title: 'Immutable audit logging',
    desc: 'Every access and change is recorded for a complete, tamper-evident trail.',
    points: ['Full access & change history', 'Who / what / when on every action', 'Exportable for inspections', 'Retention aligned to policy'],
  },
  {
    Icon: Globe2, tint: GREEN, title: 'Tenant isolation & residency',
    desc: 'Each lab’s data is strictly isolated, with residency options for regulated regions.',
    points: ['Per-lab logical isolation', 'Enforced tenancy on every query', 'Regional data residency options', 'No cross-tenant data access'],
  },
  {
    Icon: DatabaseBackup, tint: RED, title: 'Backups & disaster recovery',
    desc: 'Automated backups and tested recovery keep your lab running through any event.',
    points: ['Automated encrypted backups', 'Point-in-time recovery', 'Defined RPO / RTO targets', 'Regular restore testing'],
  },
  {
    Icon: EyeOff, tint: INDIGO, title: 'Responsible AI data handling',
    desc: 'AI screening runs with redaction and strict boundaries around protected data.',
    points: ['PHI redaction before processing', 'No training on your patient data', 'Graceful degradation, never blocking', 'Scoped, auditable AI access'],
  },
];

const CERTS: { label: string; sub: string }[] = [
  { label: 'HIPAA', sub: 'Compliant' },
  { label: 'SOC 2', sub: 'Type II' },
  { label: 'CAP / CLIA', sub: 'Validated workflows' },
  { label: 'GDPR', sub: 'Ready' },
];

export default function SecurityPage() {
  return (
    <MarketingPage active="compliance">
      {/* HERO */}
      <section style={{ background: 'linear-gradient(180deg, #0d0d1a 0%, #14102a 55%, #0d0d1a 100%)', padding: '96px 64px 84px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -60, left: '50%', transform: 'translateX(-50%)', width: 600, height: 320, background: 'radial-gradient(ellipse, rgba(120,60,200,0.35) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 1120, margin: '0 auto', position: 'relative', display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 56, alignItems: 'center' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 20, padding: '6px 14px', marginBottom: 24 }}>
              <ShieldCheck size={13} color="#a78bfa" />
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: 600, letterSpacing: '0.12em' }}>SECURITY & COMPLIANCE</span>
            </div>
            <h1 style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.03em', color: '#fff', margin: '0 0 18px' }}>
              Enterprise security,<br />built for <em style={{ fontStyle: 'italic', color: '#fb7185' }}>patient data.</em>
            </h1>
            <p style={{ fontSize: 18, lineHeight: 1.65, color: 'rgba(255,255,255,0.7)', maxWidth: 520, marginBottom: 32 }}>
              CYTOLAB is engineered for the trust a diagnostic lab demands — encryption at every layer,
              strict access control, complete audit trails, and compliance you can hand to your board.
            </p>
            <div style={{ display: 'flex', gap: 14 }}>
              <Link href="/book-demo" style={{ background: RED, color: '#fff', padding: '14px 26px', borderRadius: 11, fontWeight: 700, fontSize: 15, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                Request a security review <ArrowRight size={16} />
              </Link>
              <Link href="/contact" style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', padding: '14px 26px', borderRadius: 11, fontWeight: 700, fontSize: 15, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.2)' }}>
                Contact sales
              </Link>
            </div>
          </div>
          {/* Cert badges */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {CERTS.map((c) => (
              <div key={c.label} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '22px 20px', backdropFilter: 'blur(10px)' }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                  <Check size={17} color={GREEN} strokeWidth={3} />
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>{c.label}</div>
                <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{c.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PILLARS */}
      <Section eyebrow="Defense in depth" title="Security at every layer of the stack" sub="From the network edge to the AI pipeline, CYTOLAB is designed so protected health information is safeguarded by default — not as an afterthought.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {PILLARS.map(({ Icon, tint, title, desc, points }) => (
            <Card key={title} style={{ padding: 26 }}>
              <IconTile tint={tint}><Icon size={22} /></IconTile>
              <div style={{ fontSize: 18, fontWeight: 800, color: INK, margin: '16px 0 6px' }}>{title}</div>
              <div style={{ fontSize: 13.5, color: '#64748b', lineHeight: 1.55, marginBottom: 14 }}>{desc}</div>
              <div style={{ borderTop: '1px solid #f1f1f7', paddingTop: 10 }}>
                {points.map((p) => <CheckItem key={p}>{p}</CheckItem>)}
              </div>
            </Card>
          ))}
        </div>
      </Section>

      {/* INFRA / OPERATIONS STRIP */}
      <Section bg="#f8f7ff" eyebrow="Operational trust" title="Hardened infrastructure, transparent operations">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {[
            { Icon: Server, title: 'Resilient infrastructure', desc: 'Cloud infrastructure with isolated environments, managed patching, and monitored uptime targets of 99.9%.' },
            { Icon: KeyRound, title: 'Secrets & key management', desc: 'Application secrets are managed centrally with enforced minimum-strength requirements and rotation.' },
            { Icon: FileCheck2, title: 'Documented policies', desc: 'Security, access, retention, and incident-response policies available to prospects under NDA.' },
          ].map(({ Icon, title, desc }) => (
            <div key={title} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <IconTile tint={INDIGO}><Icon size={20} /></IconTile>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: INK }}>{title}</div>
                <div style={{ fontSize: 13.5, color: '#64748b', marginTop: 4, lineHeight: 1.55 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* CTA */}
      <section style={{ background: '#fff', padding: '20px 64px 96px' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', background: 'linear-gradient(135deg, #0d0d1a 0%, #191033 60%, #0d0d1a 100%)', borderRadius: 24, padding: '52px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 40, flexWrap: 'wrap' }}>
          <div style={{ maxWidth: 560 }}>
            <h2 style={{ fontSize: 30, fontWeight: 800, color: '#fff', margin: '0 0 10px', letterSpacing: '-0.02em' }}>Need our security documentation?</h2>
            <p style={{ fontSize: 15.5, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, margin: 0 }}>We&apos;ll walk your security and compliance teams through our controls and share our SOC 2 report and policies under NDA.</p>
          </div>
          <Link href="/contact" style={{ background: RED, color: '#fff', padding: '15px 30px', borderRadius: 12, fontWeight: 700, fontSize: 15, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
            Talk to our security team <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </MarketingPage>
  );
}
