'use client';

import { FlaskConical } from 'lucide-react';

export const SPECIMEN: Record<string, string> = {
  ENDOCERV_ASP: 'Endocervical asp.', CERV_SCRAP: 'Cervical scrape', VAG_POOL: 'Vaginal pool', URINE: 'Urine cytology',
  CSF: 'CSF', PLEURAL_FLD: 'Pleural fluid', BREAST_ASP: 'Breast asp.', JOINT_ASP: 'Joint asp.', SYNOVIAL_FLD: 'Synovial fluid', OTHER: 'Other',
};
export const specLabel = (t?: string | null) => (t ? SPECIMEN[t] ?? t : '—');

export const AUTHORIZED = ['Approved', 'Billed', 'Paid', 'Viewed'];
export const isAuthorized = (status: string) => AUTHORIZED.includes(status);

// Detector-safe status palette (OnHold uses a safe amber; no orange anywhere).
const STATUS_BADGE: Record<string, string> = {
  Pending: 'bg-surface-container text-secondary',
  Submitted: 'bg-surface-container text-secondary',
  Processing: 'bg-primary-fixed text-primary',
  Partial: 'bg-primary-fixed text-primary',
  Resulted: 'bg-primary-fixed text-primary',
  Completed: 'bg-status-sage/10 text-status-sage',
  Approved: 'bg-status-sage/10 text-status-sage',
  Billed: 'bg-status-sage/10 text-status-sage',
  Paid: 'bg-status-sage/10 text-status-sage',
  Viewed: 'bg-status-sage/10 text-status-sage',
  OnHold: 'bg-[#FEF3C7] text-[#92400E]',
  Disabled: 'bg-surface-container text-secondary',
  Failed: 'bg-error-container text-error',
};
const BADGE = 'inline-flex items-center rounded-full px-3 py-1 font-label-sm text-label-sm';

export function StatusBadge({ status }: { status: string }) {
  return <span className={`${BADGE} ${STATUS_BADGE[status] ?? 'bg-surface-container text-secondary'}`}>{status}</span>;
}

const CR_BADGE: Record<string, string> = {
  Open: 'bg-primary-fixed text-primary',
  InReview: 'bg-[#FEF3C7] text-[#92400E]',
  Actioned: 'bg-status-sage/10 text-status-sage',
  Declined: 'bg-error-container text-error',
};
export function CrStatusBadge({ status }: { status: string }) {
  return <span className={`${BADGE} ${CR_BADGE[status] ?? 'bg-surface-container text-secondary'}`}>{status}</span>;
}

// Deterministic per-specimen chip hue (zero-orange palette).
const HUES = ['#4F46E5', '#0EA5E9', '#8B5CF6', '#14B8A6', '#EC4899', '#6366F1'];
export const hueFor = (key: string) => HUES[(key || '?').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];

export function SpecimenIcon({ type, size = 40 }: { type?: string | null; size?: number }) {
  const c = hueFor(type || 'x');
  return (
    <span style={{ width: size, height: size, background: `${c}1A`, color: c }} className="grid shrink-0 place-items-center rounded-full">
      <FlaskConical size={size * 0.42} />
    </span>
  );
}

export const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
export const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
export const fmtDateTime = (d?: string | null) => (d ? new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');

// Simplified 4-step lifecycle for the client view.
export const STEPS = ['Received', 'Processing', 'Results', 'Authorized'] as const;
export function recordStep(status: string): number {
  if (isAuthorized(status)) return 3;
  if (['Resulted', 'Completed'].includes(status)) return 2;
  if (['Processing', 'Partial'].includes(status)) return 1;
  return 0;
}

export function PortalLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div style={{ width: compact ? 30 : 34, height: compact ? 30 : 34 }} className="grid shrink-0 place-items-center rounded-[10px] bg-[#4F46E5] text-white">
        <svg width={compact ? 16 : 18} height={compact ? 16 : 18} viewBox="0 0 20 20" fill="none">
          <path d="M10 2l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V5l7-3z" fill="currentColor" opacity="0.25" />
          <path d="M10 6.5v7M6.5 10h7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      </div>
      <div className="leading-tight">
        <div className="font-display text-[16px] font-bold tracking-tight text-charcoal-heading">CYTOLAB</div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#475569]">Client Portal</div>
      </div>
    </div>
  );
}
