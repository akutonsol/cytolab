'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, AlertCircle, Clock, MoreVertical, Pencil, Plus, RotateCcw, Search, User, Users } from 'lucide-react';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';
import { PatientFormDrawer, type PatientRecord } from '@/components/PatientFormDrawer';

// The list endpoint enriches each patient with these two computed fields.
type PatientListRow = PatientRecord & {
  activeCases?: number;
  lastActivityAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

const BADGE = 'inline-flex items-center rounded-full px-3 py-1 text-sm font-medium';
const PILL = 'inline-flex items-center rounded-full px-3 py-1 text-sm';
const TH = 'px-8 py-4 text-left text-sm font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap';
const CELL = 'px-8 py-5 text-base text-slate-700 align-middle';

const fullName = (p: PatientListRow) => `${p.firstName} ${p.lastName}`.trim();

const ageFrom = (dob?: string | null): number | null => {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(+d)) return null;
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 86_400_000));
};

const relDate = (d?: string | null): string => {
  if (!d) return '—';
  const t = new Date(d).getTime();
  if (Number.isNaN(t)) return '—';
  const s = (Date.now() - t) / 1000;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 30 * 86_400) return `${Math.floor(s / 86_400)}d ago`;
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

// Deterministic avatar colour from the patient name (sum of char codes % palette).
const AVATAR_COLORS = ['bg-indigo-500', 'bg-violet-500', 'bg-blue-500', 'bg-teal-500', 'bg-green-500', 'bg-purple-500'];
function PatientAvatar({ name }: { name: string }) {
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

// Male (blue) vs Female (pink) ring, computed from the loaded patients.
function GenderDonut({ male, female, size = 76 }: { male: number; female: number; size?: number }) {
  const total = male + female;
  const sw = 12;
  const r = size / 2 - sw / 2 - 1;
  const circ = 2 * Math.PI * r;
  const gap = male > 0 && female > 0 ? 4 : 0;
  const maleDash = total ? (male / total) * circ : 0;
  const femaleDash = total ? (female / total) * circ : 0;
  const c = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={c} cy={c} r={r} fill="none" stroke="#EEF2F7" strokeWidth={sw} />
      {total > 0 && (
        <>
          <circle cx={c} cy={c} r={r} fill="none" stroke="#2563EB" strokeWidth={sw}
            strokeDasharray={`${Math.max(0, maleDash - gap)} ${circ - Math.max(0, maleDash - gap)}`}
            transform={`rotate(-90 ${c} ${c})`} />
          <circle cx={c} cy={c} r={r} fill="none" stroke="#DB2777" strokeWidth={sw}
            strokeDasharray={`${Math.max(0, femaleDash - gap)} ${circ - Math.max(0, femaleDash - gap)}`}
            strokeDashoffset={-maleDash} transform={`rotate(-90 ${c} ${c})`} />
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

export default function PatientsPage() {
  const router = useRouter();
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<PatientRecord | null>(null);

  // Filters flow through the fetchFn deps: changing `q` gives a new fetchFn, which
  // reloads the list from page 1 automatically (see useInfiniteScroll).
  const fetchFn = useCallback(
    (page: number, pageSize: number) =>
      api
        .get<Paginated<PatientListRow>>('/patients', { params: { page, pageSize, q: q || undefined } })
        .then((r) => r.data),
    [q],
  );
  const { items: rows, loading, initialLoading, error, hasMore, sentinelRef, total, reset } =
    useInfiniteScroll<PatientListRow>({ fetchFn, pageSize: 20 });

  const openCreate = () => { setEditing(null); setDrawerOpen(true); };
  const openEdit = (p: PatientRecord) => { setEditing(p); setDrawerOpen(true); };
  const runSearch = () => { setQ(term.trim()); };

  const isError = !!error && rows.length === 0;
  const hasEdit = can('patient:change');
  const colCount = hasEdit ? 8 : 7;

  // KPI + gender breakdown from the loaded patients (no extra API call).
  const loaded = rows.length;
  const maleCount = rows.filter((p) => p.gender === 'Male').length;
  const femaleCount = rows.filter((p) => p.gender === 'Female').length;
  const activeCasesTotal = rows.reduce((s, p) => s + (p.activeCases ?? 0), 0);
  const withCases = rows.filter((p) => (p.activeCases ?? 0) > 0).length;
  const monthAgo = Date.now() - 30 * 86_400_000;
  const newThisMonth = rows.filter((p) => p.createdAt && new Date(p.createdAt).getTime() >= monthAgo).length;
  const pctOfLoaded = (n: number) => (loaded ? Math.round((n / loaded) * 100) : 0);
  const genderTotal = maleCount + femaleCount;
  const malePct = genderTotal ? Math.round((maleCount / genderTotal) * 100) : 0;
  const femalePct = genderTotal ? 100 - malePct : 0;

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-headline-md text-headline-md text-charcoal-heading">Patients</h2>
          <p className="font-body-sm text-body-sm text-secondary">Manage patient records and cytology history.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-[360px] items-center gap-2 rounded-xl border border-outline-variant/40 bg-white px-4 text-secondary">
            <Search size={18} />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
              placeholder="Search name, reg no, email, phone"
              className="w-full border-none bg-transparent font-body-sm text-body-sm text-on-surface outline-none placeholder:text-outline"
            />
          </div>
          {can('patient:create') && (
            <button className="btn-primary" onClick={openCreate}><Plus size={16} /> New Patient</button>
          )}
        </div>
      </div>

      {/* KPI strip — computed from the loaded patients (no extra API call) */}
      <div className="mb-6 grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          icon={<Users size={24} />} iconClass="bg-indigo-50 text-indigo-600"
          label="Total Patients" value={total} sub="All patients" />
        <KpiCard
          icon={<User size={24} />} iconClass="bg-blue-50 text-blue-600"
          label="Male" value={maleCount} sub={`${pctOfLoaded(maleCount)}% of total`}
          barClass="bg-blue-500" barPct={pctOfLoaded(maleCount)} />
        <KpiCard
          icon={<User size={24} />} iconClass="bg-pink-50 text-pink-600"
          label="Female" value={femaleCount} sub={`${pctOfLoaded(femaleCount)}% of total`}
          barClass="bg-pink-500" barPct={pctOfLoaded(femaleCount)} />
        <KpiCard
          icon={<Activity size={24} />} iconClass="bg-violet-50 text-violet-600"
          label="Active Cases" value={activeCasesTotal} sub={`across ${withCases} patient${withCases === 1 ? '' : 's'}`} />
        <KpiCard
          icon={<Clock size={24} />} iconClass="bg-teal-50 text-teal-600"
          label="New This Month" value={newThisMonth} sub={`${pctOfLoaded(newThisMonth)}% of total`}
          barClass="bg-teal-500" barPct={pctOfLoaded(newThisMonth)} />
        {/* Gender ring */}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="text-center">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Male</div>
            <div className="text-3xl font-bold text-charcoal-heading">{maleCount}</div>
            <div className="text-sm font-semibold" style={{ color: '#2563EB' }}>{malePct}%</div>
          </div>
          <GenderDonut male={maleCount} female={femaleCount} />
          <div className="text-center">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Female</div>
            <div className="text-3xl font-bold text-charcoal-heading">{femaleCount}</div>
            <div className="text-sm font-semibold" style={{ color: '#DB2777' }}>{femalePct}%</div>
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
              <button className="btn-secondary mt-3" onClick={() => reset()}><RotateCcw size={14} /> Retry</button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-100">
                <th className={TH}>Patient</th>
                <th className={TH}>Gender</th>
                <th className={TH}>Age</th>
                <th className={TH}>Phone</th>
                <th className={TH}>Client</th>
                <th className={TH}>Active Cases</th>
                <th className={TH}>Last Activity</th>
                {hasEdit && <th className={TH}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {initialLoading && !isError && (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td colSpan={colCount} className="px-8 py-5"><div className="h-5 w-full animate-pulse rounded-md bg-surface-container" /></td>
                  </tr>
                ))
              )}
              {!initialLoading && rows.length === 0 && !isError && (
                <tr><td colSpan={colCount} className="px-8 py-10 text-center font-body-sm text-body-sm text-secondary">No patients found.</td></tr>
              )}
              {rows.map((p) => {
                const name = fullName(p);
                const age = ageFrom(p.dateOfBirth);
                const isMale = p.gender === 'Male';
                const isFemale = p.gender === 'Female';
                const cases = p.activeCases ?? 0;
                const clientName = p.client?.officeName || `${p.client?.firstName ?? ''} ${p.client?.lastName ?? ''}`.trim();
                return (
                  <tr key={p.id} onClick={() => router.push(`/patients/${p.id}`)}
                    className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50">
                    <td className={CELL}>
                      <div className="flex items-center gap-4">
                        <PatientAvatar name={name} />
                        <div className="min-w-0">
                          <div className="text-base font-semibold text-on-surface">{name || '—'}</div>
                          <div className="text-sm text-slate-500">Reg: {p.registrationNo || p.id.slice(0, 8)}</div>
                        </div>
                      </div>
                    </td>
                    <td className={CELL}>
                      {isMale
                        ? <span className={`${PILL} border border-blue-200 bg-blue-50 text-blue-600`}>Male</span>
                        : isFemale
                          ? <span className={`${PILL} border border-pink-200 bg-pink-50 text-pink-600`}>Female</span>
                          : <span className={`${PILL} border border-slate-200 bg-slate-100 text-slate-500`}>—</span>}
                    </td>
                    <td className={CELL}>{age != null ? `${age} yrs` : '—'}</td>
                    <td className={CELL}>{p.phoneNumber || '—'}</td>
                    <td className={CELL}>{clientName || '—'}</td>
                    <td className={CELL}>
                      {cases > 0
                        ? <span className={`${PILL} bg-indigo-100 text-indigo-700`}>{cases} active</span>
                        : <span className={`${PILL} bg-slate-100 text-slate-500`}>None</span>}
                    </td>
                    <td className={CELL}><span className="text-slate-500">{relDate(p.lastActivityAt)}</span></td>
                    {hasEdit && (
                      <td className={CELL}>
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => openEdit(p)} className="btn-secondary"><Pencil size={14} /> Edit</button>
                          <button aria-label="More actions" className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-600"><MoreVertical size={16} /></button>
                        </div>
                      </td>
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

      <PatientFormDrawer open={drawerOpen} onClose={() => { setDrawerOpen(false); reset(); }} patient={editing} />
    </div>
  );
}
