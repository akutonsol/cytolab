'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, FlaskConical, Monitor, Pencil, Plus, RotateCcw, Search, Stethoscope, Users } from 'lucide-react';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';
import { ClientFormDrawer, type ClientRecord } from '@/components/ClientFormDrawer';
import { Th, Td, Badge, Button } from '@/components/ui';


// Deterministic avatar colour from the client name (sum of char codes % palette).
const AVATAR_COLORS = ['bg-indigo-500', 'bg-violet-500', 'bg-blue-500', 'bg-teal-500', 'bg-green-500', 'bg-purple-500'];
function ClientAvatar({ name }: { name: string }) {
  const initials = name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  const color = AVATAR_COLORS[sum % AVATAR_COLORS.length];
  return (
    <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full text-base font-semibold text-white ${color}`}>
      {initials}
    </span>
  );
}

// Labs (indigo) vs Doctors (violet) ring, computed from the loaded clients.
function TypeDonut({ labs, doctors, size = 76 }: { labs: number; doctors: number; size?: number }) {
  const total = labs + doctors;
  const sw = 12;
  const r = size / 2 - sw / 2 - 1;
  const circ = 2 * Math.PI * r;
  const gap = labs > 0 && doctors > 0 ? 4 : 0;
  const labsDash = total ? (labs / total) * circ : 0;
  const docDash = total ? (doctors / total) * circ : 0;
  const c = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={c} cy={c} r={r} fill="none" stroke="#EEF2F7" strokeWidth={sw} />
      {total > 0 && (
        <>
          <circle cx={c} cy={c} r={r} fill="none" stroke="#4F46E5" strokeWidth={sw}
            strokeDasharray={`${Math.max(0, labsDash - gap)} ${circ - Math.max(0, labsDash - gap)}`}
            transform={`rotate(-90 ${c} ${c})`} />
          <circle cx={c} cy={c} r={r} fill="none" stroke="#7C3AED" strokeWidth={sw}
            strokeDasharray={`${Math.max(0, docDash - gap)} ${circ - Math.max(0, docDash - gap)}`}
            strokeDashoffset={-labsDash} transform={`rotate(-90 ${c} ${c})`} />
        </>
      )}
    </svg>
  );
}

// One KPI card: icon + label + value, with an optional %-of-total progress bar.
function KpiCard({ icon, iconClass, label, value, sub, barClass, barPct }: {
  icon: ReactNode; iconClass: string; label: string; value: ReactNode;
  sub: string; barClass?: string; barPct?: number;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${iconClass}`}>{icon}</span>
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
          <div className="mt-1 text-4xl font-bold leading-tight text-charcoal-heading">{value}</div>
          <div className="mt-1 text-sm text-slate-500">{sub}</div>
        </div>
      </div>
      {barClass && (
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${barClass}`} style={{ width: `${barPct ?? 0}%` }} />
        </div>
      )}
    </div>
  );
}

export default function ClientsPage() {
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ClientRecord | null>(null);

  // Filters flow through the fetchFn deps: changing `q` reloads from page 1.
  const fetchFn = useCallback(
    (page: number, pageSize: number) =>
      api
        .get<Paginated<ClientRecord>>('/clients', { params: { page, pageSize, q: q || undefined } })
        .then((r) => r.data),
    [q],
  );
  const { items: rows, loading, initialLoading, error, hasMore, sentinelRef, total, reset } =
    useInfiniteScroll<ClientRecord>({ fetchFn, pageSize: 20 });

  const openCreate = () => { setEditing(null); setDrawerOpen(true); };
  const openEdit = (c: ClientRecord) => { setEditing(c); setDrawerOpen(true); };
  const runSearch = () => { setQ(term.trim()); };

  const isError = !!error && rows.length === 0;
  const hasEdit = can('client:change');
  const colCount = hasEdit ? 8 : 7;

  // KPI + Labs/Doctors breakdown from the loaded clients (no extra API call).
  const totalClients = rows.length;
  const activeCount = rows.filter((r) => r.active && !r.blocked).length;
  const portalCount = rows.filter((r) => r.portalUsers && r.portalUsers.length > 0).length;
  const labsCount = rows.filter((r) => /lab/i.test(r.clientType?.type ?? '')).length;
  const doctorsCount = rows.filter((r) => /doctor/i.test(r.clientType?.type ?? '')).length;
  const pctOfTotal = (n: number) => (totalClients ? Math.round((n / totalClients) * 100) : 0);
  const typedTotal = labsCount + doctorsCount;
  const labsPct = typedTotal ? Math.round((labsCount / typedTotal) * 100) : 0;
  const doctorsPct = typedTotal ? 100 - labsPct : 0;

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-headline-md text-headline-md text-charcoal-heading">Clients</h2>
          <p className="font-body-sm text-body-sm text-secondary">Manage referring clients and portal access.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-[360px] items-center gap-2 rounded-xl border border-outline-variant/40 bg-white px-4 text-secondary">
            <Search size={18} />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
              placeholder="Search name, office, email, phone"
              className="w-full border-none bg-transparent font-body-sm text-body-sm text-on-surface outline-none placeholder:text-outline"
            />
          </div>
          {can('client:create') && (
            <Button onClick={openCreate}><Plus size={16} /> New Client</Button>
          )}
        </div>
      </div>

      {/* KPI strip — computed from the loaded clients (no extra API call) */}
      <div className="mb-6 grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          icon={<Users size={24} />} iconClass="bg-indigo-50 text-indigo-600"
          label="Total Clients" value={total} sub="All clients" />
        <KpiCard
          icon={<CheckCircle2 size={24} />} iconClass="bg-green-50 text-green-700"
          label="Active Clients" value={activeCount} sub={`${pctOfTotal(activeCount)}% of total`}
          barClass="bg-green-500" barPct={pctOfTotal(activeCount)} />
        <KpiCard
          icon={<Stethoscope size={24} />} iconClass="bg-indigo-50 text-indigo-600"
          label="Doctors" value={doctorsCount} sub={`${pctOfTotal(doctorsCount)}% of total`}
          barClass="bg-indigo-500" barPct={pctOfTotal(doctorsCount)} />
        <KpiCard
          icon={<FlaskConical size={24} />} iconClass="bg-blue-50 text-blue-600"
          label="Laboratories" value={labsCount} sub={`${pctOfTotal(labsCount)}% of total`}
          barClass="bg-blue-500" barPct={pctOfTotal(labsCount)} />
        <KpiCard
          icon={<Monitor size={24} />} iconClass="bg-violet-50 text-violet-600"
          label="Portal Enabled" value={portalCount} sub={`${pctOfTotal(portalCount)}% of total`}
          barClass="bg-violet-500" barPct={pctOfTotal(portalCount)} />
        {/* Labs vs Doctors ring */}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="text-center">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Labs</div>
            <div className="text-3xl font-bold text-charcoal-heading">{labsCount}</div>
            <div className="text-sm font-semibold" style={{ color: '#4F46E5' }}>{labsPct}%</div>
          </div>
          <TypeDonut labs={labsCount} doctors={doctorsCount} />
          <div className="text-center">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Doctors</div>
            <div className="text-3xl font-bold text-charcoal-heading">{doctorsCount}</div>
            <div className="text-sm font-semibold" style={{ color: '#7C3AED' }}>{doctorsPct}%</div>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-white p-0 shadow-sm">
        {isError && (
          <div className="mx-6 mt-6 flex items-start gap-3 rounded-xl border border-error/20 bg-error-container p-4">
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-error" />
            <div className="flex-1">
              <div className="font-label-md text-label-md text-error">Failed to load</div>
              <div className="font-body-sm text-body-sm text-on-error-container">{error}</div>
              <Button variant="secondary" className="mt-3" onClick={() => reset()}><RotateCcw size={14} /> Retry</Button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-100">
                <Th density="roomy">Client</Th>
                <Th density="roomy">Office</Th>
                <Th density="roomy">Type</Th>
                <Th density="roomy">Phone</Th>
                <Th density="roomy">Email</Th>
                <Th density="roomy">Status</Th>
                <Th density="roomy">Portal Access</Th>
                {hasEdit && <Th density="roomy">Actions</Th>}
              </tr>
            </thead>
            <tbody>
              {initialLoading && !isError && (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <Td colSpan={colCount} className="px-6 py-4"><div className="h-5 w-full animate-pulse rounded-md bg-surface-container" /></Td>
                  </tr>
                ))
              )}
              {!initialLoading && rows.length === 0 && !isError && (
                <tr><Td colSpan={colCount} className="px-6 py-10 text-center font-body-sm text-body-sm text-secondary">No clients found.</Td></tr>
              )}
              {rows.map((r) => {
                const name = `${r.firstName} ${r.lastName}`.trim();
                const isLab = /lab/i.test(r.clientType?.type ?? '');
                const hasPortal = !!(r.portalUsers && r.portalUsers.length > 0);
                return (
                <tr key={r.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50">
                  <Td density="roomy" className="text-base">
                    <div className="flex items-center gap-4">
                      <ClientAvatar name={name} />
                      <div className="min-w-0">
                        <div className="text-base font-semibold text-on-surface">{name || '—'}</div>
                        <div className="text-sm text-slate-500">Client ID: {r.id.slice(0, 8)}</div>
                      </div>
                    </div>
                  </Td>
                  <Td density="roomy" className="text-base">{r.officeName || '—'}</Td>
                  <Td density="roomy" className="text-base">
                    {r.clientType
                      ? <Badge size="lg" weight="normal" className={`border ${isLab ? 'border-slate-200 bg-slate-100 text-slate-600' : 'border-indigo-200 bg-indigo-50 text-indigo-600'}`}>{r.clientType.type}</Badge>
                      : '—'}
                  </Td>
                  <Td density="roomy" className="text-base">{r.phoneNumber || '—'}</Td>
                  <Td density="roomy" className="text-base">{r.email || '—'}</Td>
                  <Td density="roomy" className="text-base">
                    {r.blocked
                      ? <Badge size="lg" weight="medium" className="bg-error-container text-error">Blocked</Badge>
                      : r.active
                        ? <Badge size="lg" weight="medium" className="bg-status-sage/10 text-status-sage">Active</Badge>
                        : <Badge size="lg" weight="medium" className="bg-surface-container text-secondary">Inactive</Badge>}
                  </Td>
                  <Td density="roomy" className="text-base">
                    {hasPortal
                      ? <Badge size="lg" weight="normal" className="bg-indigo-100 text-indigo-700">Portal Access</Badge>
                      : <Badge size="lg" weight="normal" className="bg-slate-100 text-slate-500">No Access</Badge>}
                  </Td>
                  {hasEdit && (
                    <Td density="roomy" className="text-base">
                      <div className="flex items-center gap-2">
                        <Button variant="secondary" onClick={() => openEdit(r)}><Pencil size={14} /> Edit</Button>
                      </div>
                    </Td>
                  )}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Infinite scroll: auto-loads the next page as the sentinel scrolls into view. */}
        {!isError && rows.length > 0 && (
          <ScrollSentinel ref={sentinelRef} loading={loading && !initialLoading} hasMore={hasMore} error={error} onRetry={reset} />
        )}
      </div>

      <ClientFormDrawer open={drawerOpen} onClose={() => { setDrawerOpen(false); reset(); }} client={editing} />
    </div>
  );
}
