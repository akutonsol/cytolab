'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, BarChart3, BellRing, ClipboardList, Clock, FileText, FlaskConical, GitCompare,
  GraduationCap, History, ListChecks, Lock, type LucideIcon, Mic, Network, PackageSearch, Printer,
  ScanEye, ShieldCheck, Shield, Sparkles, Tags, Video,
} from 'lucide-react';
import { App as AntdApp } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { FEATURES, TIER_META, type FeatureKey } from '@/lib/features';

// ─── Types (mirror the API's FeatureRow) ─────────────────────────────────────
interface FeatureRow {
  featureKey: FeatureKey;
  tier: number;
  isEnabled: boolean;
  enabledAt: string | null;
  enabledByName: string | null;
  notes: string | null;
}
interface LabFeatures { labId: string; labName: string; features: FeatureRow[] }

// ─── Icon + tier color maps ──────────────────────────────────────────────────
const ICONS: Record<string, LucideIcon> = {
  Clock, History, ClipboardList, AlertTriangle, ShieldCheck, Mic, FileText, ListChecks,
  PackageSearch, Printer, BarChart3, GitCompare, GraduationCap, FlaskConical, BellRing,
  ScanEye, Sparkles, Video, Tags, Network,
};
const TIER_COLOR: Record<number, string> = { 1: '#64748B', 2: '#4F46E5', 3: '#3B82F6', 4: '#8B5CF6', 5: '#9333EA' };
const TIER_TINT: Record<number, string> = { 1: '#F1F5F9', 2: '#EEF2FF', 3: '#EFF6FF', 4: '#F5F3FF', 5: '#FAF5FF' };
const TIERS = [2, 3, 4, 5];

// ─── Toggle switch ───────────────────────────────────────────────────────────
function Toggle({ on, disabled, onChange }: { on: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onChange}
      title={disabled ? 'Not yet available' : on ? 'Disable' : 'Enable'}
      className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      style={{ background: on ? '#4F46E5' : '#CBD5E1' }}
    >
      <span className="inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform" style={{ transform: on ? 'translateX(22px)' : 'translateX(2px)' }} />
    </button>
  );
}

export default function FeaturesPage() {
  const router = useRouter();
  const { claims } = useAuth();
  const { message, modal } = AntdApp.useApp();
  const qc = useQueryClient();
  const isSuper = claims?.isSuperRole === true;

  // Access control — redirect non-superusers to the dashboard.
  useEffect(() => {
    if (claims && !isSuper) router.replace('/dashboard');
  }, [claims, isSuper, router]);

  const [tab, setTab] = useState<number | 'all'>('all');
  const [labId, setLabId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<LabFeatures[]>({
    queryKey: ['lab-features-all'],
    queryFn: () => api.get('/lab-features/all-labs').then((r) => r.data),
    enabled: isSuper,
  });

  // Default the selected lab to the superuser's own lab once data lands.
  useEffect(() => {
    if (!data || labId) return;
    const own = data.find((l) => l.labId === claims?.labId);
    setLabId(own?.labId ?? data[0]?.labId ?? null);
  }, [data, labId, claims?.labId]);

  const currentLab = data?.find((l) => l.labId === labId) ?? null;
  const rows = currentLab?.features ?? [];
  const rowByKey = useMemo(() => new Map(rows.map((r) => [r.featureKey, r])), [rows]);

  const toggle = useMutation({
    mutationFn: (vars: { featureKey: FeatureKey; isEnabled: boolean }) =>
      api.patch(`/lab-features/${vars.featureKey}`, { labId, isEnabled: vars.isEnabled }).then((r) => r.data),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ['lab-features-all'] });
      const prev = qc.getQueryData<LabFeatures[]>(['lab-features-all']);
      qc.setQueryData<LabFeatures[]>(['lab-features-all'], (old) =>
        (old ?? []).map((l) =>
          l.labId !== labId ? l : { ...l, features: l.features.map((f) => (f.featureKey === vars.featureKey ? { ...f, isEnabled: vars.isEnabled } : f)) },
        ),
      );
      return { prev };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['lab-features-all'], ctx.prev);
      message.error('Could not update feature — reverted.');
    },
    onSuccess: (_d, vars) => {
      message.success(`${FEATURES[vars.featureKey].name} ${vars.isEnabled ? 'enabled' : 'disabled'}.`);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['lab-features-all'] });
      qc.invalidateQueries({ queryKey: ['lab-features-enabled'] });
    },
  });

  const onToggle = (key: FeatureKey, currentlyOn: boolean) => {
    const def = FEATURES[key];
    if (currentlyOn) {
      modal.confirm({
        title: `Disable ${def.name}?`,
        content: `Disabling ${def.name} will hide it from all lab users immediately. Any data created by this feature will be preserved. Are you sure?`,
        okText: 'Disable feature',
        okButtonProps: { danger: true },
        cancelText: 'Keep enabled',
        onOk: () => toggle.mutate({ featureKey: key, isEnabled: false }),
      });
    } else {
      toggle.mutate({ featureKey: key, isEnabled: true });
    }
  };

  if (!claims || !isSuper) {
    return (
      <div className="min-h-full pt-4" style={{ background: '#F8FAFC' }}>
        <div className="mx-auto mt-16 max-w-md rounded-2xl border border-[#EEF2F7] bg-white p-8 text-center shadow-sm">
          <Shield size={28} className="mx-auto text-[#9CA3AF]" />
          <div className="mt-3 text-[18px] font-bold text-[#0F172A]">Access restricted</div>
          <div className="mt-1 text-[14px] text-[#6B7280]">Feature Management is available to superusers only.</div>
        </div>
      </div>
    );
  }

  // Stats: enabled totals per tier (built features only count toward togglable).
  const enabledCount = rows.filter((r) => r.isEnabled).length;
  const tierEnabled = (t: number) => rows.filter((r) => r.tier === t && r.isEnabled).length;
  const tierTotal = (t: number) => rows.filter((r) => r.tier === t).length;

  const visibleTiers = tab === 'all' ? TIERS : [tab as number];

  return (
    <div className="min-h-full pb-10 pt-4" style={{ background: '#F8FAFC' }}>
      {/* ── Header ── */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-[#0F172A]">Feature Management</h1>
          <p className="mt-1.5 text-[15px] text-[#6B7280]">Enable or disable features per lab. Tier 1 (Standard) features are always enabled.</p>
        </div>
        {data && data.length > 1 && (
          <label className="flex items-center gap-2 text-[13px] text-[#6B7280]">
            Lab
            <select
              value={labId ?? ''}
              onChange={(e) => setLabId(e.target.value)}
              className="h-10 rounded-lg border border-[#E2E8F0] bg-white px-3 text-[14px] font-medium text-[#0F172A] outline-none focus:border-[#4F46E5]"
            >
              {data.map((l) => <option key={l.labId} value={l.labId}>{l.labName}</option>)}
            </select>
          </label>
        )}
      </div>

      {/* ── Stats bar ── */}
      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <span className="rounded-full bg-[#4F46E5] px-3.5 py-1.5 text-[13px] font-semibold text-white">{enabledCount} features enabled</span>
        {TIERS.map((t) => (
          <span key={t} className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium" style={{ borderColor: TIER_COLOR[t] + '55', color: TIER_COLOR[t], background: '#fff' }}>
            <span className="h-2 w-2 rounded-full" style={{ background: TIER_COLOR[t] }} /> Tier {t} · {tierEnabled(t)}/{tierTotal(t)}
          </span>
        ))}
      </div>

      {/* ── Tier 1 note ── */}
      {tab === 'all' && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-[#E2E8F0] bg-white px-4 py-3">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: TIER_TINT[1], color: TIER_COLOR[1] }}><Lock size={16} /></span>
          <div>
            <div className="text-[14px] font-semibold text-[#0F172A]">Tier 1 · Standard</div>
            <div className="text-[13px] text-[#6B7280]">{TIER_META[1].description}</div>
          </div>
        </div>
      )}

      {/* ── Tier tabs ── */}
      <div className="mb-6 flex flex-wrap gap-2">
        {(['all', ...TIERS] as (number | 'all')[]).map((t) => {
          const active = tab === t;
          const label = t === 'all' ? 'All' : `Tier ${t} ${TIER_META[t as number].name}`;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="rounded-full px-4 py-2 text-[13px] font-semibold transition-colors"
              style={active
                ? { background: '#4F46E5', color: '#fff' }
                : { background: '#fff', color: '#475569', border: '1px solid #E2E8F0' }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {isLoading && <div className="py-16 text-center text-[14px] text-[#94A3B8]">Loading features…</div>}

      {/* ── Tier sections ── */}
      {!isLoading && visibleTiers.map((t) => {
        const meta = TIER_META[t];
        const tierRows = rows.filter((r) => r.tier === t);
        return (
          <section key={t} className="mb-8">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="rounded-md px-2.5 py-1 text-[12px] font-bold text-white" style={{ background: TIER_COLOR[t] }}>Tier {t}</span>
              <span className="text-[16px] font-bold text-[#0F172A]">{meta.name}</span>
              <span className="text-[13px] text-[#94A3B8]">— {meta.description}</span>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {tierRows.map((r) => {
                const def = FEATURES[r.featureKey];
                const Icon = ICONS[def.icon] ?? FileText;
                const built = !def.comingSoon;
                const on = r.isEnabled;
                return (
                  <div
                    key={r.featureKey}
                    className="flex flex-col rounded-2xl border p-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)] transition-shadow hover:shadow-md"
                    style={{ borderColor: on ? '#C7D2FE' : '#E2E8F0', background: on ? '#EEF2FF' : '#fff' }}
                  >
                    <div className="flex items-start gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: TIER_TINT[t], color: TIER_COLOR[t] }}><Icon size={20} /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[15px] font-bold text-[#0F172A]">{def.name}</span>
                          <span className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold" style={{ background: TIER_TINT[t], color: TIER_COLOR[t] }}>T{t}</span>
                        </div>
                      </div>
                    </div>
                    <p className="mt-2.5 line-clamp-2 min-h-[40px] text-[13px] leading-[1.45] text-[#64748B]">{def.description}</p>
                    <div className="mt-3 flex items-center justify-between border-t border-[#EEF2F7] pt-3">
                      {built ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold" style={on ? { background: '#DCFCE7', color: '#16A34A' } : { background: '#F1F5F9', color: '#64748B' }}>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: on ? '#16A34A' : '#94A3B8' }} />
                          {on ? 'Active' : 'Inactive'}
                        </span>
                      ) : (
                        <span className="rounded-full border border-[#A5B4FC] bg-white px-2.5 py-1 text-[12px] font-semibold text-[#4F46E5]">Coming Soon</span>
                      )}
                      {built ? (
                        <Toggle on={on} onChange={() => onToggle(r.featureKey, on)} />
                      ) : (
                        <Toggle on={false} disabled onChange={() => {}} />
                      )}
                    </div>
                    {built && on && r.enabledByName && (
                      <div className="mt-2 text-[11px] text-[#94A3B8]">Enabled by {r.enabledByName}{r.enabledAt ? ` · ${new Date(r.enabledAt).toLocaleDateString()}` : ''}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
