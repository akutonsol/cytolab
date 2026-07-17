'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity, AlertTriangle, ArrowRight, CheckCircle, CheckCircle2, Clock, Cloud, Cpu, Database,
  ExternalLink, Loader2, RefreshCw, Server, Shield, Wrench, XCircle,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Line, LineChart, ResponsiveContainer } from 'recharts';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Card, PageHeader } from '@/components/ui';
import { notify } from '@/lib/notify';

// ─── Types ───────────────────────────────────────────────────────────────────
type Status = 'ok' | 'warn' | 'error';
interface Check { status: Status; value?: number | string | null; message?: string | null; trend?: number[] }
interface Report {
  generatedAt: string;
  overall: Status;
  infrastructure: { dbPing: Check; apiUptime: Check; memoryUsage: Check; nodeVersion: Check };
  dataIntegrity: { stuckRecords: Check; orphanedSpecimens: Check; missingLabNumbers: Check; unpaidBills: Check; unfiledRecords: Check; portalUsersInactive: Check };
  businessHealth: { authorizationRate: Check; avgTat: Check; pendingChangeRequests: Check; failedRecords: Check };
  security: { usersWithNoRole: Check; recentFailedLogins: Check };
  maintenanceLog: { id: string; ranAt: string; ranBy: string | null; duration: number; results: any; notes: string | null }[];
  backup: { configured: boolean; sheetId: string | null };
}

interface BackupResult {
  skipped?: boolean;
  reason?: string;
  success?: boolean;
  timestamp?: string;
  counts?: Record<string, number>;
  durationMs?: number;
}

type DiagCategory = 'api' | 'email' | 'storage' | 'pdf' | 'fhir' | 'scheduler' | 'database' | 'features';
interface DiagnosticCheck {
  name: string;
  category: DiagCategory;
  status: Status;
  responseTimeMs?: number;
  message: string;
  detail?: string;
}
interface DeepCheckResult {
  ranAt: string;
  durationMs: number;
  overall: Status;
  checks: DiagnosticCheck[];
}

// Grouped display order + human labels for the diagnostic categories.
const DIAG_GROUPS: { category: DiagCategory; label: string }[] = [
  { category: 'api', label: 'API Routes' },
  { category: 'email', label: 'Email' },
  { category: 'storage', label: 'Storage' },
  { category: 'pdf', label: 'PDF Generation' },
  { category: 'fhir', label: 'FHIR' },
  { category: 'scheduler', label: 'Scheduler' },
  { category: 'database', label: 'Database' },
  { category: 'features', label: 'Feature Gates' },
];
// Deep-diagnostics warn colour — dark amber #A16207 (detector-safe, never orange).
const DEEP_WARN = '#A16207';
const DEEP_DOT: Record<Status, string> = { ok: '#22C55E', warn: DEEP_WARN, error: '#EF4444' };
const DEEP_BANNER: Record<Status, { bg: string; border: string; color: string; Icon: any; text: string }> = {
  ok: { bg: '#F0FDF4', border: '#BBF7D0', color: '#16A34A', Icon: CheckCircle, text: 'All systems functional' },
  warn: { bg: '#FEFCE8', border: '#FDE68A', color: DEEP_WARN, Icon: AlertTriangle, text: 'Some checks need attention' },
  error: { bg: '#FEF2F2', border: '#FECACA', color: '#EF4444', Icon: XCircle, text: 'Critical issues detected' },
};

// ─── Style tokens ────────────────────────────────────────────────────────────
// Status semantics: ok green, error red. Warn uses --color-warning (#A16207); the
// old #B45309 anti-aliased into the trip box. (reads as
// yellow-brown, detector-safe) per the System Health spec.
const DOT: Record<Status, string> = { ok: '#22C55E', warn: 'var(--color-warning)', error: '#EF4444' };
const BANNER: Record<Status, { bg: string; border: string; color: string; Icon: any; text: string }> = {
  ok: { bg: '#F0FDF4', border: '#BBF7D0', color: '#16A34A', Icon: CheckCircle, text: 'All systems operational' },
  warn: { bg: '#FFFBEB', border: '#FDE68A', color: 'var(--color-warning)', Icon: AlertTriangle, text: 'Some checks need attention' },
  error: { bg: '#FEF2F2', border: '#FECACA', color: '#EF4444', Icon: XCircle, text: 'Critical issues detected' },
};

const relTime = (iso: string) => {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleString();
};

function Dot({ status }: { status: Status }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: DOT[status] }} />;
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function SystemHealthPage() {
  const router = useRouter();
  const { can } = useAuth();
  const allowed = can('system:health');
  const qc = useQueryClient();

  const { data, isLoading, isError, isFetching, refetch } = useQuery<Report>({
    queryKey: ['system-health'],
    queryFn: () => api.get('/system/health').then((r) => r.data),
    enabled: allowed,
    refetchInterval: 60_000,
    staleTime: 60_000,
  });

  const runMaint = useMutation({
    mutationFn: () => api.post('/system/maintenance').then((r) => r.data),
    onSuccess: (d: any) => {
      notify.success(`Maintenance complete — flagged ${d.flagged}, closed ${d.missedClosed} missed, archived ${d.archived}`);
      qc.invalidateQueries({ queryKey: ['system-health'] });
    },
    onError: (e: any) => notify.error(e?.response?.data?.message ?? 'Maintenance failed'),
  });

  // Deep Diagnostics — expensive; runs only on explicit click, result persists in state.
  const [deepResult, setDeepResult] = useState<DeepCheckResult | null>(null);
  const deepCheck = useMutation({
    mutationFn: () => api.post('/system/health/deep-check', undefined, { timeout: 60_000 }).then((r) => r.data as DeepCheckResult),
    onSuccess: (d) => setDeepResult(d),
    onError: (e: any) => notify.error(e?.response?.data?.message ?? 'Deep check failed'),
  });

  const [lastBackup, setLastBackup] = useState<BackupResult | null>(null);
  const backupMutation = useMutation({
    mutationFn: () => api.post('/system/backup').then((r) => r.data as BackupResult),
    onSuccess: (d) => {
      setLastBackup(d);
      notify.success(d.skipped ? 'Backup skipped — BACKUP_SHEET_ID not configured' : 'Backup completed successfully');
    },
    onError: () => notify.error('Backup failed'),
  });

  if (!allowed) {
    return (
      <div className="min-h-full pt-4" style={{ background: '#F8FAFC' }}>
        <Card radius="md" elevation="raised" border="hairline" className="mx-auto mt-16 max-w-md p-8 text-center">
          <Shield size={28} className="mx-auto text-[#9CA3AF]" />
          <div className="mt-3 text-[18px] font-bold text-charcoal-heading">Access restricted</div>
          <div className="mt-1 text-[14px] text-[#6B7280]">System Health is available to superusers only.</div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-full pb-8 pt-4" style={{ background: '#F8FAFC' }}>
      {/* ── Header ── */}
      <PageHeader
        title="System Health"
        description="Internal maintenance and infrastructure monitoring"
        actions={
          <>
          {data && <span className="text-[13px] text-[#9CA3AF]">Last checked: {relTime(data.generatedAt)}</span>}
          <button onClick={() => refetch()} disabled={isFetching}
            className="flex h-10 items-center gap-2 rounded-lg bg-[#4F46E5] px-4 text-[14px] font-semibold text-white transition-colors hover:bg-[#4338CA] disabled:opacity-60">
            <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} /> Run check now
          </button>
          <button onClick={() => runMaint.mutate()} disabled={runMaint.isPending}
            className="flex h-10 items-center gap-2 rounded-lg border border-[#4F46E5] px-4 text-[14px] font-semibold text-[#4F46E5] transition-colors hover:bg-[#EEF3FF] disabled:opacity-60">
            <Wrench size={15} /> {runMaint.isPending ? 'Running…' : 'Run maintenance'}
          </button>
          </>
        }
      />

      {isError ? (
        <div className="rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-5 text-center">
          <div className="text-[15px] font-semibold text-[#991B1B]">Could not load health data</div>
          <button onClick={() => refetch()} className="mt-3 rounded-lg bg-[#EF4444] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#DC2626]">Retry</button>
        </div>
      ) : isLoading || !data ? (
        <Skeleton />
      ) : (
        <>
          {/* ── Overall banner ── */}
          <Banner status={data.overall} />

          {/* ── Card 1: Infrastructure ── */}
          <Section title="Infrastructure" icon={Server}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <InfraTile check={data.infrastructure.dbPing} label="Database" render={(c) => (
                <>
                  <div className="text-[22px] font-bold text-charcoal-heading">{c.value} ms</div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#F1F3F7]">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(Number(c.value) / 5, 100)}%`, background: DOT[c.status] }} />
                  </div>
                </>
              )} />
              <InfraTile check={data.infrastructure.apiUptime} label="Uptime" render={(c) => <div className="text-[22px] font-bold text-charcoal-heading">{c.value}</div>} />
              <InfraTile check={data.infrastructure.memoryUsage} label="Memory" render={(c) => (
                <>
                  <div className="text-[22px] font-bold text-charcoal-heading">{c.value}%</div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#F1F3F7]">
                    <div className="h-full rounded-full" style={{ width: `${c.value}%`, background: DOT[c.status] }} />
                  </div>
                </>
              )} />
              <InfraTile check={data.infrastructure.nodeVersion} label="Runtime" render={(c) => <div className="text-[22px] font-bold text-charcoal-heading">{c.value}</div>} />
            </div>
          </Section>

          {/* ── Card 2: Data Integrity ── */}
          <Section title="Data Integrity" icon={Database}>
            <div>
              <DataRow check={data.dataIntegrity.stuckRecords} label="Stuck records" onView={() => router.push('/records')} />
              <DataRow check={data.dataIntegrity.orphanedSpecimens} label="Orphaned specimens" />
              <DataRow check={data.dataIntegrity.missingLabNumbers} label="Missing lab numbers" onView={() => router.push('/records')} />
              <DataRow check={data.dataIntegrity.unpaidBills} label="Unpaid bills (30d+)" onView={() => router.push('/billing')} />
              <DataRow check={data.dataIntegrity.unfiledRecords} label="Unfiled records (14d+)" onView={() => router.push('/cabinets')} />
              <DataRow check={data.dataIntegrity.portalUsersInactive} label="Inactive portal users" onView={() => router.push('/users')} last />
            </div>
          </Section>

          {/* ── Card 3: Business Health ── */}
          <Section title="Business Health" icon={Activity}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-[#F3F4F6] p-4">
                <div className="flex items-center gap-2"><Dot status={data.businessHealth.authorizationRate.status} /><span className="text-[13px] text-[#6B7280]">Authorization rate</span></div>
                <div className="mt-1 flex items-end justify-between">
                  <div className="text-[32px] font-bold leading-none text-charcoal-heading">{data.businessHealth.authorizationRate.value}%</div>
                  {Array.isArray(data.businessHealth.authorizationRate.trend) && (
                    <div className="h-10 w-24">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={(data.businessHealth.authorizationRate.trend ?? []).map((v, i) => ({ i, v }))}>
                          <Line type="monotone" dataKey="v" stroke="#4F46E5" strokeWidth={2} dot={false} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
                <div className="mt-1.5 text-[12px] text-[#9CA3AF]">{data.businessHealth.authorizationRate.message}</div>
              </div>
              <BusinessTile check={data.businessHealth.avgTat} label="Avg turnaround" unit="days avg TAT" />
              <BusinessTile check={data.businessHealth.pendingChangeRequests} label="Pending change requests" unit="awaiting > 7 days" />
              <BusinessTile check={data.businessHealth.failedRecords} label="Failed records" unit="last 30 days" />
            </div>
          </Section>

          {/* ── Card 4: Security ── */}
          <Section title="Security" icon={Shield}>
            <div>
              <DataRow check={data.security.usersWithNoRole} label="Users with no role" onView={() => router.push('/users')} />
              <DataRow check={data.security.recentFailedLogins} label="Recent failed logins" last />
            </div>
          </Section>

          {/* ── Maintenance Log ── */}
          <Card radius="md" elevation="raised" border="hairline" className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <Clock size={18} className="text-[#4F46E5]" />
              <h2 className="text-[18px] font-bold text-charcoal-heading">Maintenance Log</h2>
              <span className="text-[13px] text-[#9CA3AF]">Last 10 runs</span>
            </div>
            {data.maintenanceLog.length === 0 ? (
              <div className="py-8 text-center text-[13px] text-[#9CA3AF]">No maintenance runs yet — click Run maintenance to start</div>
            ) : (
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="text-[12px] font-medium uppercase tracking-wide text-[#9CA3AF]">
                    <th className="pb-3 font-medium">Ran At</th><th className="pb-3 font-medium">Ran By</th>
                    <th className="pb-3 font-medium">Duration</th><th className="pb-3 font-medium">Flagged</th>
                    <th className="pb-3 font-medium">Archived</th><th className="pb-3 font-medium">Closed</th>
                    <th className="pb-3 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {data.maintenanceLog.map((l) => (
                    <tr key={l.id} className="border-t border-[#F3F4F6]">
                      <td className="py-3 text-[13px] text-charcoal-heading">{new Date(l.ranAt).toLocaleString()}</td>
                      <td className="py-3">
                        {l.ranBy === 'system'
                          ? <span className="rounded-md bg-[#EEF3FF] px-2 py-0.5 text-[12px] font-semibold text-[#4F46E5]">system</span>
                          : <span className="rounded-md bg-[#F3F4F6] px-2 py-0.5 text-[12px] font-semibold text-[#6B7280]">manual</span>}
                      </td>
                      <td className="py-3 text-[13px] text-[#6B7280]">{l.duration} ms</td>
                      <td className="py-3 text-[13px] text-charcoal-heading">{l.results?.flagged ?? 0}</td>
                      <td className="py-3 text-[13px] text-charcoal-heading">{l.results?.archived ?? 0}</td>
                      <td className="py-3 text-[13px] text-charcoal-heading">{l.results?.missedClosed ?? 0}</td>
                      <td className="py-3 text-[13px] text-[#6B7280]">{l.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {/* ── Data Backup ── */}
          <div className="glass-card mt-6 rounded-2xl p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-headline-sm text-headline-sm text-charcoal-heading">Google Sheets Backup</h3>
                <p className="mt-1 font-body-sm text-body-sm text-secondary">
                  Daily automated backup to Google Sheets at 2:30 AM. Appends new data — full history preserved.
                </p>
              </div>
              <Button onClick={() => backupMutation.mutate()}
                disabled={backupMutation.isPending}
                className="flex items-center gap-2">
                {backupMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Cloud size={15} />}
                Run Backup Now
              </Button>
            </div>

            {/* Config status */}
            <div className="flex items-center gap-3 rounded-xl border border-outline-variant/20 bg-surface-container-low p-4">
              {data.backup.configured ? (
                <>
                  <CheckCircle2 size={18} className="text-status-sage" />
                  <div>
                    <p className="font-label-md text-label-md text-on-surface">Connected to Google Sheets</p>
                    <p className="font-body-sm text-body-sm text-secondary">Sheet ID: {data.backup.sheetId}</p>
                  </div>
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${data.backup.sheetId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto flex items-center gap-1 font-label-md text-label-md text-primary hover:underline">
                    Open Sheet <ExternalLink size={13} />
                  </a>
                </>
              ) : (
                <>
                  {/* --color-warning (#A16207). #B45309 and #D97706 both trip the zero-orange rule. */}
                  <AlertTriangle size={18} style={{ color: 'var(--color-warning)' }} />
                  <div>
                    <p className="font-label-md text-label-md text-on-surface">Not configured</p>
                    <p className="font-body-sm text-body-sm text-secondary">Set BACKUP_SHEET_ID environment variable to enable.</p>
                  </div>
                </>
              )}
            </div>

            {/* Last backup result */}
            {lastBackup?.counts && (
              <div className="mt-4 rounded-xl bg-surface-container-low p-4">
                <p className="mb-2 font-label-sm text-label-sm uppercase tracking-wider text-secondary">Last Backup</p>
                <div className="grid grid-cols-5 gap-4">
                  {Object.entries(lastBackup.counts).map(([k, v]) => (
                    <div key={k}>
                      <p className="font-display text-[24px] leading-none text-charcoal-heading">{v as number}</p>
                      <p className="font-label-sm text-label-sm capitalize text-secondary">{k}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Deep Diagnostics ── */}
          <Card radius="md" elevation="raised" border="hairline" className="mt-6 p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Cpu size={18} className="text-[#4F46E5]" />
                <h2 className="text-[18px] font-bold text-charcoal-heading">Deep Diagnostics</h2>
                <span className="text-[13px] text-[#9CA3AF]">Active subsystem probes — runs on demand</span>
              </div>
              <div className="flex items-center gap-3">
                {deepResult && <span className="text-[13px] text-[#9CA3AF]">Last run: {relTime(deepResult.ranAt)}</span>}
                <button
                  onClick={() => deepCheck.mutate()}
                  disabled={deepCheck.isPending}
                  className="flex h-10 items-center gap-2 rounded-lg border border-[#4F46E5] px-4 text-[14px] font-semibold text-[#4F46E5] transition-colors hover:bg-[#EEF3FF] disabled:opacity-60">
                  {deepCheck.isPending ? <Loader2 size={15} className="animate-spin" /> : <Activity size={15} />}
                  {deepCheck.isPending ? 'Running…' : 'Run Deep Check'}
                </button>
              </div>
            </div>

            {deepCheck.isPending ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <Loader2 size={26} className="animate-spin text-[#4F46E5]" />
                <div className="text-[14px] font-medium text-[#6B7280]">Probing subsystems… this can take 5–15 seconds</div>
              </div>
            ) : !deepResult ? (
              <div className="py-10 text-center text-[13px] text-[#9CA3AF]">
                No deep check has been run yet — click Run Deep Check to probe every subsystem.
              </div>
            ) : (
              <DeepResults result={deepResult} />
            )}
          </Card>
        </>
      )}

      
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────
function Banner({ status }: { status: Status }) {
  const b = BANNER[status];
  return (
    <div className="mb-6 flex items-center gap-3 rounded-2xl border p-5" style={{ background: b.bg, borderColor: b.border }}>
      <b.Icon size={22} style={{ color: b.color }} />
      <span className="text-[16px] font-semibold" style={{ color: b.color }}>{b.text}</span>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <Card radius="md" elevation="raised" border="hairline" className="mb-5 p-6">
      <div className="mb-4 flex items-center gap-2">
        <Icon size={18} className="text-[#4F46E5]" />
        <h2 className="text-[18px] font-bold text-charcoal-heading">{title}</h2>
      </div>
      {children}
    </Card>
  );
}

function InfraTile({ check, label, render }: { check: Check; label: string; render: (c: Check) => React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#F3F4F6] p-4">
      <div className="mb-1.5 flex items-center gap-2">
        <Dot status={check.status} /><span className="text-[13px] text-[#6B7280]">{label}</span>
      </div>
      {render(check)}
      {check.message && <div className="mt-1.5 text-[12px] text-[#9CA3AF]">{check.message}</div>}
    </div>
  );
}

function DataRow({ check, label, onView, last }: { check: Check; label: string; onView?: () => void; last?: boolean }) {
  const count = Number(check.value) || 0;
  return (
    <div className={`flex items-center justify-between py-3 ${last ? '' : 'border-b border-[#F9FAFB]'}`}>
      <div className="flex items-center gap-2.5"><Dot status={check.status} /><span className="text-[14px] font-medium text-charcoal-heading">{label}</span></div>
      <div className="flex items-center gap-3">
        <span className="text-[13px] text-[#6B7280]">{check.message ?? check.value}</span>
        {onView && count > 0 && (
          <button onClick={onView} className="flex items-center gap-1 text-[13px] font-semibold text-[#4F46E5] hover:underline">View <ArrowRight size={13} /></button>
        )}
      </div>
    </div>
  );
}

function BusinessTile({ check, label, unit }: { check: Check; label: string; unit: string }) {
  return (
    <div className="rounded-xl border border-[#F3F4F6] p-4">
      <div className="flex items-center gap-2"><Dot status={check.status} /><span className="text-[13px] text-[#6B7280]">{label}</span></div>
      <div className="mt-1 text-[32px] font-bold leading-none text-charcoal-heading">{check.value}</div>
      <div className="mt-1.5 text-[12px] text-[#9CA3AF]">{unit}</div>
    </div>
  );
}

function DeepResults({ result }: { result: DeepCheckResult }) {
  const b = DEEP_BANNER[result.overall];
  const groups = DIAG_GROUPS
    .map((g) => ({ ...g, checks: result.checks.filter((c) => c.category === g.category) }))
    .filter((g) => g.checks.length > 0);
  return (
    <div>
      {/* Overall banner */}
      <div className="mb-5 flex items-center gap-3 rounded-xl border p-4" style={{ background: b.bg, borderColor: b.border }}>
        <b.Icon size={20} style={{ color: b.color }} />
        <span className="text-[15px] font-semibold" style={{ color: b.color }}>{b.text}</span>
        <span className="ml-auto text-[12px] text-[#9CA3AF]">Completed in {result.durationMs} ms</span>
      </div>

      {groups.map((g) => (
        <div key={g.category} className="mb-5 last:mb-0">
          <div className="mb-2.5 text-[12px] font-semibold uppercase tracking-wide text-[#9CA3AF]">{g.label}</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.checks.map((c, i) => <DeepCheckCard key={`${c.name}-${i}`} check={c} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function DeepCheckCard({ check }: { check: DiagnosticCheck }) {
  const [open, setOpen] = useState(false);
  const longDetail = !!check.detail && check.detail.length > 48;
  return (
    <div className="rounded-xl border border-[#F3F4F6] p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: DEEP_DOT[check.status] }} />
          <span className="text-[14px] font-semibold text-charcoal-heading">{check.name}</span>
        </div>
        {typeof check.responseTimeMs === 'number' && (
          <span className="shrink-0 rounded-md bg-[#F3F4F6] px-1.5 py-0.5 text-[11px] font-medium text-[#6B7280]">{check.responseTimeMs} ms</span>
        )}
      </div>
      <div className="mt-1.5 text-[13px] text-[#6B7280]">{check.message}</div>
      {check.detail && (
        longDetail ? (
          <div className="mt-1.5">
            <button onClick={() => setOpen((v) => !v)} className="text-[12px] font-semibold text-[#4F46E5] hover:underline">
              {open ? 'Hide detail' : 'Show detail'}
            </button>
            {open && <div className="mt-1 break-words text-[12px] text-[#9CA3AF]">{check.detail}</div>}
          </div>
        ) : (
          <div className="mt-1 break-words text-[12px] text-[#9CA3AF]">{check.detail}</div>
        )
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-16 rounded-2xl bg-[#EEF2F7]" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="mb-5 rounded-2xl border border-[#EEF2F7] bg-white p-6">
          <div className="mb-4 h-5 w-40 rounded bg-[#EEF2F7]" />
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((j) => <div key={j} className="h-20 rounded-xl bg-[#F3F4F6]" />)}
          </div>
        </div>
      ))}
    </div>
  );
}
