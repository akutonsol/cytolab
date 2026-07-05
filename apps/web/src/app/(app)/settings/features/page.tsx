'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, ShieldCheck, X } from 'lucide-react';
import { App as AntdApp } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { FEATURES, isBuilt, type FeatureKey } from '@/lib/features';

// Per-lab feature row from GET /lab-features (superuser).
interface FeatureRow {
  featureKey: FeatureKey;
  tier: number;
  isEnabled: boolean;
  enabledAt: string | null;
  enabledByName: string | null;
  notes: string | null;
}

// The modules each feature surfaces — shown as chips on the card.
const AFFECTED: Partial<Record<FeatureKey, string[]>> = {
  WORKFORCE_MANAGEMENT: ['Attendance', 'Timesheets', 'Scheduling', 'Leave', 'Overtime', 'Payroll Engine', 'Productivity', 'Performance'],
  QC_MODULE: ['Quality Control', 'Equipment'],
  WSI_VIEWER: ['Digital Slides / WSI'],
  HL7_FHIR: ['FHIR / EMR Integration'],
  REAGENT_TRACKING: ['Reagents & Inventory'],
  AI_SCREENING: ['AI Cytology Screening'],
  TELECONSULTATION: ['Teleconsultation'],
  REPORT_CENTER: ['Report Center'],
  PROFICIENCY_TESTING: ['Proficiency Testing'],
  CORRELATION_TRACKING: ['Correlation Tracking'],
  BETHESDA_ANALYTICS: ['Bethesda Analytics'],
  PATIENT_RECALL: ['Patient Recall'],
  APPOINTMENTS: ['Appointments'],
};

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null);

export default function ModuleManagementPage() {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const { claims } = useAuth();
  const [pending, setPending] = useState<{ key: FeatureKey; next: boolean } | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ['lab-features-list'],
    queryFn: () => api.get<FeatureRow[]>('/lab-features').then((r) => r.data),
  });

  const modules = useMemo(
    () =>
      data
        .map((row) => ({ row, def: FEATURES[row.featureKey] }))
        .filter((m) => m.def)
        .sort((a, b) => a.def.tier - b.def.tier || a.def.name.localeCompare(b.def.name)),
    [data],
  );

  const toggle = useMutation({
    mutationFn: ({ key, next }: { key: FeatureKey; next: boolean }) =>
      api.patch(`/lab-features/${key}`, { labId: claims?.labId, isEnabled: next }),
    onMutate: async ({ key, next }) => {
      await qc.cancelQueries({ queryKey: ['lab-features-list'] });
      const prev = qc.getQueryData<FeatureRow[]>(['lab-features-list']);
      qc.setQueryData<FeatureRow[]>(['lab-features-list'], (old) =>
        (old ?? []).map((r) => (r.featureKey === key ? { ...r, isEnabled: next, enabledAt: new Date().toISOString() } : r)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['lab-features-list'], ctx.prev);
      message.error('Could not update the module — please try again.');
    },
    onSuccess: (_d, v) => message.success(`${FEATURES[v.key].name} ${v.next ? 'enabled' : 'disabled'}.`),
    // Refresh the app-wide feature context so nav/UI gating updates immediately.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['lab-features-list'] });
      qc.invalidateQueries({ queryKey: ['lab-features-enabled'] });
    },
  });

  const confirm = () => {
    if (!pending) return;
    toggle.mutate(pending);
    setPending(null);
  };
  const pendingDef = pending ? FEATURES[pending.key] : null;

  return (
    <div className="min-h-full pb-10 pt-4" style={{ background: '#F8FAFC' }}>
      <div className="mb-4">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-[#0F172A]">Module Management</h1>
        <p className="mt-1.5 max-w-3xl text-[15px] text-[#6B7280]">
          Enable or disable modules for your lab. Disabling a module hides it from all users and blocks API access,
          but never deletes any data. You can re-enable at any time.
        </p>
      </div>

      {/* Warning banner (amber — not orange) */}
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
        <AlertTriangle size={18} className="mt-0.5 shrink-0" />
        <p className="text-[13px] font-medium">Changes take effect immediately for all users. Disabled modules retain all their data.</p>
      </div>

      {isLoading && <div className="rounded-2xl border border-[#EEF2F7] bg-white p-8 text-center text-[14px] text-[#475569]">Loading modules…</div>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {modules.map(({ row, def }) => {
          const chips = AFFECTED[row.featureKey] ?? [def.name];
          const stamp = fmtDate(row.enabledAt);
          return (
            <div key={row.featureKey} className="rounded-2xl border border-[#EEF2F7] bg-white p-5 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[16px] font-bold text-[#0F172A]">{def.name}</span>
                    <span className="rounded-full bg-[#EEF2FF] px-2.5 py-0.5 text-[11px] font-bold text-[#4F46E5]">Tier {def.tier}</span>
                    {!isBuilt(row.featureKey) && <span className="rounded-full bg-[#F1F5F9] px-2.5 py-0.5 text-[11px] font-semibold text-[#475569]">Coming soon</span>}
                  </div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-[#475569]">{def.description}</p>
                </div>
                {/* Toggle switch */}
                <button
                  role="switch"
                  aria-checked={row.isEnabled}
                  aria-label={`${row.isEnabled ? 'Disable' : 'Enable'} ${def.name}`}
                  onClick={() => setPending({ key: row.featureKey, next: !row.isEnabled })}
                  className="relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-0 transition-colors"
                  style={{ background: row.isEnabled ? '#16A34A' : '#CBD5E1' }}
                >
                  <span className="inline-block h-5 w-5 rounded-full bg-white shadow transition-transform" style={{ transform: row.isEnabled ? 'translateX(22px)' : 'translateX(3px)' }} />
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {chips.map((c) => (
                  <span key={c} className="rounded-full bg-[#F1F5F9] px-2.5 py-1 text-[11px] font-semibold text-[#475569]">{c}</span>
                ))}
              </div>

              {/* Payroll safety note — Workforce card only */}
              {row.featureKey === 'WORKFORCE_MANAGEMENT' && (
                <div className="mt-3 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-2 text-[12px] text-[#1D4ED8]">
                  Disabling Workforce Management does not affect Payroll. Previously processed payroll runs, entries and
                  history remain fully accessible under the Payroll module.
                </div>
              )}

              <div className="mt-3 flex items-center justify-between text-[11px] text-[#475569]">
                <span style={{ color: row.isEnabled ? '#16A34A' : '#475569', fontWeight: 600 }}>{row.isEnabled ? 'Enabled' : 'Disabled'}</span>
                {stamp && <span>Last changed {stamp}{row.enabledByName ? ` · ${row.enabledByName}` : ''}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirmation modal */}
      {pending && pendingDef && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setPending(null)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-[18px] font-bold text-[#0F172A]">{pending.next ? 'Enable' : 'Disable'} {pendingDef.name}?</h2>
              <button onClick={() => setPending(null)} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full text-[#475569] hover:bg-[#F1F5F9]"><X size={18} /></button>
            </div>
            <p className="mt-2 text-[14px] leading-relaxed text-[#475569]">
              {pending.next
                ? `This will make ${pendingDef.name} visible and accessible to all users with the appropriate permissions.`
                : `The module will be hidden from all users immediately. All ${pendingDef.name} data is preserved and will be available if you re-enable.`}
            </p>
            {!pending.next && pending.key === 'WORKFORCE_MANAGEMENT' && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-2 text-[12px] text-[#1D4ED8]">
                <ShieldCheck size={15} className="mt-0.5 shrink-0" /> Payroll is unaffected — processed runs, entries and history stay accessible.
              </div>
            )}
            <div className="mt-6 flex items-center justify-end gap-3">
              <button onClick={() => setPending(null)} className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm font-semibold text-[#475569] hover:bg-[#F8FAFC]">Cancel</button>
              <button
                onClick={confirm}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
                style={{ background: pending.next ? '#16A34A' : '#DC2626' }}
              >
                {pending.next ? 'Enable module' : 'Disable module'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
