'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, ChevronDown, Folder, MoreHorizontal, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { ClientSelect } from '@/components/ClientSelect';

// The six folder swatches (keys mirror the backend CABINET_COLORS). Orange here is
// only a user-chosen folder colour swatch — never used for a status/accent.
const COLOR_HEX: Record<string, string> = {
  blue: '#4f7df9', green: '#16a34a', orange: '#f97316', purple: '#9333ea', red: '#dc2626', yellow: '#eab308',
};
const COLORS = Object.keys(COLOR_HEX);

const ALL_STATUSES = ['Pending', 'Submitted', 'Processing', 'Partial', 'Completed', 'Resulted', 'Approved', 'Billed', 'Paid', 'OnHold', 'Disabled', 'Failed', 'Viewed'];
const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const GREEN = ['Approved', 'Billed', 'Paid', 'Completed'];
const RED = ['Failed', 'Disabled'];
const PENDING = ['Pending', 'Submitted'];
const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

interface ClientLite { id: string; firstName: string; lastName: string; officeName?: string | null; accountNo?: string | null; }
interface Cabinet { id: string; label: string; color?: string | null; identifier?: string | null; client?: ClientLite | null; }
interface Rec {
  id: string; labNumber?: string | null; formType?: string | null; status: string; urgent: boolean;
  specimenDate?: string | null; createdAt: string;
  patient?: { firstName: string; lastName: string; registrationNo?: string | null } | null;
  client?: ClientLite | null; specimens?: Array<{ id: string; type: string }>;
}

const folderName = (c?: Cabinet | null) => c?.label || c?.client?.officeName || 'Untitled folder';
const patientName = (r: Rec) => (r.patient ? `${r.patient.firstName} ${r.patient.lastName}`.trim() : '—');
const clientName = (c?: ClientLite | null) => (c ? c.officeName || `${c.firstName} ${c.lastName}`.trim() : '—');

function StatusBadge({ status }: { status: string }) {
  const cls = GREEN.includes(status) ? 'bg-success-soft text-success' : RED.includes(status) ? 'bg-danger-soft text-danger' : 'bg-primary-soft text-primary';
  return <span className={`inline-flex items-center rounded-pill px-2.5 py-1 text-caption font-bold ${cls}`}>{status}</span>;
}

export default function CabinetsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const notify = (type: 'ok' | 'err', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3000); };
  const [selectedId, setSelectedId] = useState<string>();
  const [surname, setSurname] = useState<string>();
  const [formType, setFormType] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [q, setQ] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const { data: cabinets = [] } = useQuery<Cabinet[]>({
    queryKey: ['cabinets'],
    queryFn: () => api.get('/cabinets').then((r) => r.data),
  });
  const selected = cabinets.find((c) => c.id === selectedId) ?? cabinets[0];

  const { data: records, isFetching } = useQuery({
    queryKey: ['cabinet-records', selected?.id, surname, formType, status],
    enabled: !!selected,
    queryFn: () => {
      const params: any = { pageSize: 100 };
      if (surname) params.surname = surname;
      if (formType) params.formType = formType;
      if (status) params.status = status;
      return api.get<Paginated<Rec>>(`/cabinet/records/${selected!.id}`, { params }).then((r) => r.data);
    },
  });
  const rows: Rec[] = records?.data ?? [];

  const view = useMemo(() => {
    if (!q) return rows;
    const s = q.toLowerCase();
    return rows.filter((r) => (r.labNumber ?? '').toLowerCase().includes(s) || patientName(r).toLowerCase().includes(s) || clientName(r.client).toLowerCase().includes(s));
  }, [rows, q]);

  const urgentRows = rows.filter((r) => r.urgent);
  const pendingRows = rows.filter((r) => PENDING.includes(r.status));
  const authorizedRows = rows.filter((r) => GREEN.includes(r.status));

  return (
    <div className="flex flex-col gap-6 xl:flex-row">
      {/* ===== LEFT PANEL — folders ===== */}
      <aside className="flex w-full shrink-0 flex-col self-start rounded-card border border-card bg-gradient-to-b from-white to-[#f5f7fd] p-5 shadow-card xl:sticky xl:top-0 xl:w-[340px]">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[19px] font-extrabold tracking-tight text-text">Cabinets</div>
            <div className="mt-0.5 text-caption font-semibold text-text-tertiary">{cabinets.length} folder{cabinets.length === 1 ? '' : 's'}</div>
          </div>
          <button onClick={() => setModalOpen(true)} aria-label="New folder" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-white shadow-card transition-colors hover:bg-primary-hover"><Plus size={20} /></button>
        </div>

        {/* A–Z surname index */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          <LetterButton label="All" active={!surname} onClick={() => setSurname(undefined)} />
          {AZ.map((l) => <LetterButton key={l} label={l} active={surname === l} onClick={() => setSurname(l)} />)}
        </div>

        {/* Folder list */}
        <div className="mt-5 text-caption font-bold uppercase tracking-wide text-text-tertiary">Folders</div>
        <div className="premium-scroll mt-2 flex flex-col gap-1 overflow-y-auto pr-1" style={{ maxHeight: 520 }}>
          {cabinets.length === 0 && <div className="py-6 text-center text-small text-text-tertiary">No folders yet.</div>}
          {cabinets.map((c) => {
            const active = c.id === selected?.id;
            return (
              <button
                key={c.id}
                onClick={() => { setSelectedId(c.id); setSurname(undefined); }}
                className="relative flex items-center gap-3 rounded-control py-2.5 pl-4 pr-3 text-left transition-colors"
                style={{ background: active ? '#eef3ff' : 'transparent' }}
              >
                {active && <span className="absolute inset-y-2 left-0 w-1 rounded-pill bg-primary" />}
                <Folder size={18} fill={COLOR_HEX[c.color ?? 'blue'] ?? '#4f7df9'} color={COLOR_HEX[c.color ?? 'blue'] ?? '#4f7df9'} />
                <span className={`min-w-0 flex-1 truncate text-small ${active ? 'font-bold text-text' : 'font-semibold text-text-secondary'}`}>{folderName(c)}</span>
                {active && <span className="shrink-0 rounded-pill bg-white px-2 py-0.5 text-tiny font-bold text-text-secondary">{rows.length}</span>}
              </button>
            );
          })}
        </div>
      </aside>

      {/* ===== RIGHT SIDE ===== */}
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        {!selected ? (
          <div className="glass-card flex flex-col items-center justify-center rounded-2xl p-16 text-center">
            <Folder size={40} fill="#c7ccd6" color="#c7ccd6" />
            <div className="mt-3 font-headline-sm text-headline-sm text-charcoal-heading">No folder selected</div>
            <div className="mt-1 text-small font-medium text-text-secondary">Add a folder to start filing client records.</div>
            <button onClick={() => setModalOpen(true)} className="btn-primary mt-4"><Plus size={16} /> New folder</button>
          </div>
        ) : (
          <>
            {/* Hero row */}
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="text-[15px] font-semibold uppercase tracking-wide text-text-tertiary">Cabinet /</div>
                <div className="flex items-center gap-2.5">
                  <Folder size={26} fill={COLOR_HEX[selected.color ?? 'blue']} color={COLOR_HEX[selected.color ?? 'blue']} />
                  <span className="truncate text-[30px] font-extrabold leading-none tracking-tight text-text">{folderName(selected)}</span>
                </div>
                <div className="mt-1.5 text-small font-medium text-text-secondary">
                  {selected.client?.accountNo ? `AC# ${selected.client.accountNo}` : selected.identifier ? <span className="font-mono">{selected.identifier}</span> : 'No client linked'}
                </div>
              </div>
              <div className="flex items-center gap-5">
                <Kpi label="Total records" value={rows.length} />
                <Divider />
                <Kpi label="Pending" value={pendingRows.length} />
                <Divider />
                <Kpi label="Authorized" value={authorizedRows.length} />
                <div className="ml-1 flex items-center gap-2">
                  <button aria-label="Filters" className="grid h-11 w-11 place-items-center rounded-full border border-card bg-surface text-text-secondary hover:text-text"><SlidersHorizontal size={18} /></button>
                  <button onClick={() => router.push('/records')} aria-label="Open records" className="grid h-11 w-11 place-items-center rounded-full bg-text text-white hover:bg-text/90"><ArrowUpRight size={18} /></button>
                </div>
              </div>
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
              {/* Requires attention (~50%) */}
              <div className="relative col-span-1 overflow-hidden rounded-card bg-[#eef3ff] p-5 md:col-span-2">
                <span className="absolute inset-y-4 left-0 w-1 rounded-pill bg-primary" />
                <div className="pl-3">
                  <div className="flex items-center justify-between">
                    <div className="text-caption font-bold uppercase tracking-wide text-primary">Requires attention</div>
                    <span className="text-[26px] font-extrabold leading-none text-text">{urgentRows.length}</span>
                  </div>
                  {urgentRows.length ? (
                    <div className="mt-3 flex flex-col gap-1.5">
                      {urgentRows.slice(0, 2).map((r) => (
                        <div key={r.id} className="flex items-center gap-2 text-small">
                          <span className="font-bold text-text">{r.labNumber ?? '—'}</span>
                          <span className="truncate font-medium text-text-secondary">· {patientName(r)}</span>
                        </div>
                      ))}
                    </div>
                  ) : <div className="mt-2 text-small font-medium text-text-secondary">No urgent records in this folder.</div>}
                  <div className="mt-4 flex justify-end">
                    <button onClick={() => setStatus(undefined)} aria-label="Open" className="grid h-10 w-10 place-items-center rounded-full bg-text text-white hover:bg-text/90"><ArrowUpRight size={18} /></button>
                  </div>
                </div>
              </div>

              <StatBig tint="#eef3ff" label="Pending review" value={pendingRows.length} labelColor="text-primary" onClick={() => setStatus('Pending')} />
              <StatBig tint="#edfaf4" label="Authorized" value={authorizedRows.length} labelColor="text-success" onClick={() => setStatus('Approved')} />
            </div>

            {/* Records table */}
            <div className="glass-card flex flex-col rounded-2xl">
              <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6">
                <h2 className="font-headline-sm text-headline-sm text-charcoal-heading">{folderName(selected)} records · {view.length}</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex h-10 items-center gap-2 rounded-pill border border-card bg-surface px-3 text-text-tertiary">
                    <Search size={16} />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search records" className="w-36 border-none bg-transparent text-small text-text outline-none placeholder:text-text-tertiary" />
                  </div>
                  <FilterSelect value={formType} onChange={setFormType} placeholder="Form type"
                    options={[{ value: 'Gynecology', label: 'Gynecology' }, { value: 'NonGynecology', label: 'Non-Gynecology' }]} />
                  <FilterSelect value={status} onChange={setStatus} placeholder="Status" options={ALL_STATUSES.map((s) => ({ value: s, label: s }))} />
                  <button onClick={() => setModalOpen(true)} className="btn-primary"><Plus size={16} /> Add</button>
                </div>
              </div>

              <div className="overflow-x-auto px-2 pb-4 pt-3">
                <table className="w-full min-w-[820px] border-collapse">
                  <thead>
                    <tr className="border-b border-outline-variant/20">
                      <th className="px-4 py-3 text-left font-label-sm text-label-sm text-secondary uppercase tracking-wider">Lab#</th>
                      <th className="px-4 py-3 text-left font-label-sm text-label-sm text-secondary uppercase tracking-wider">Patient</th>
                      <th className="px-4 py-3 text-left font-label-sm text-label-sm text-secondary uppercase tracking-wider">Client</th>
                      <th className="px-4 py-3 text-left font-label-sm text-label-sm text-secondary uppercase tracking-wider">Form</th>
                      <th className="px-4 py-3 text-left font-label-sm text-label-sm text-secondary uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left font-label-sm text-label-sm text-secondary uppercase tracking-wider">Urgent</th>
                      <th className="px-4 py-3 text-left font-label-sm text-label-sm text-secondary uppercase tracking-wider">Date</th>
                      <th className="w-10 px-2 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {isFetching && view.length === 0 && (
                      <tr><td colSpan={8} className="px-4 py-10 text-center font-body-sm text-body-sm text-secondary">Loading records…</td></tr>
                    )}
                    {!isFetching && view.length === 0 && (
                      <tr><td colSpan={8} className="px-4 py-10 text-center font-body-sm text-body-sm text-secondary">{surname ? `No patients with surname “${surname}”` : 'No records filed here yet.'}</td></tr>
                    )}
                    {view.map((r) => (
                      <tr key={r.id} className="border-b border-outline-variant/10 transition-colors hover:bg-surface-container-low/60">
                        <td className="px-4 py-3">
                          <div className="text-small font-bold text-text">{r.labNumber ?? '—'}</div>
                          <div className="truncate text-tiny font-medium text-text-tertiary">{(r.specimens ?? []).map((s) => s.type).join(', ') || '—'}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-small font-semibold text-text">{patientName(r)}</div>
                          {r.patient?.registrationNo && <div className="text-tiny font-medium text-text-tertiary">Reg {r.patient.registrationNo}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="truncate text-small font-medium text-text-secondary">{clientName(r.client)}</div>
                          {r.client?.accountNo && <div className="text-tiny font-medium text-text-tertiary">AC# {r.client.accountNo}</div>}
                        </td>
                        <td className="px-4 py-3">
                          {r.formType
                            ? <span className="inline-flex items-center rounded-pill bg-lightgray px-2.5 py-1 text-caption font-bold text-text-secondary">{r.formType === 'Gynecology' ? 'GYN' : 'NON-GYN'}</span>
                            : <span className="text-small text-text-tertiary">—</span>}
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                        <td className="px-4 py-3">{r.urgent ? <span className="inline-flex items-center rounded-pill bg-danger-soft px-2.5 py-1 text-caption font-bold text-danger">Urgent</span> : <span className="text-small text-text-tertiary">—</span>}</td>
                        <td className="px-4 py-3"><span className="text-small font-medium text-text-secondary">{fmt(r.specimenDate ?? r.createdAt)}</span></td>
                        <td className="px-2 py-3"><button className="text-text-tertiary hover:text-text"><MoreHorizontal size={18} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      <CabinetFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(c) => { qc.invalidateQueries({ queryKey: ['cabinets'] }); setSelectedId(c.id); notify('ok', 'Folder created'); }}
        notify={notify}
      />

      {toast && (
        <div className="fixed bottom-6 right-6 z-[120] rounded-xl px-4 py-3 font-label-md text-label-md text-white shadow-lg"
          style={{ background: toast.type === 'ok' ? '#16A34A' : '#DC2626' }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="text-right">
      <div className="text-caption font-semibold text-text-tertiary">{label}</div>
      <div className="text-[26px] font-extrabold leading-tight tracking-tight text-text">{value}</div>
    </div>
  );
}
function Divider() { return <span className="h-9 w-px bg-border" />; }

function StatBig({ tint, label, value, labelColor, onClick }: { tint: string; label: string; value: number; labelColor: string; onClick?: () => void }) {
  return (
    <div className="col-span-1 flex flex-col justify-between rounded-card p-5" style={{ background: tint }}>
      <div className="flex items-start justify-between">
        <div className={`text-caption font-bold uppercase tracking-wide ${labelColor}`}>{label}</div>
        <button onClick={onClick} aria-label={label} className="grid h-9 w-9 place-items-center rounded-full bg-white/70 text-text-secondary hover:text-text"><ArrowUpRight size={16} /></button>
      </div>
      <div className="mt-6 text-[40px] font-extrabold leading-none tracking-tight text-text">{value}</div>
    </div>
  );
}

function LetterButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="grid h-7 place-items-center rounded-pill px-2 text-caption font-bold transition-colors"
      style={{ minWidth: 28, background: active ? '#4f7df9' : '#f6f8fc', color: active ? '#fff' : '#6b7280' }}
    >
      {label}
    </button>
  );
}

function FilterSelect({ value, onChange, placeholder, options }: { value?: string; onChange: (v?: string) => void; placeholder: string; options: { value: string; label: string }[] }) {
  return (
    <div className="relative">
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="select-bare h-10 appearance-none rounded-pill border border-card bg-surface pl-3.5 pr-9 text-small font-medium text-text outline-none focus:border-primary"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
    </div>
  );
}

function CabinetFormModal({ open, onClose, onCreated, notify }: { open: boolean; onClose: () => void; onCreated: (c: Cabinet) => void; notify: (type: 'ok' | 'err', msg: string) => void }) {
  const [label, setLabel] = useState('');
  const [clientId, setClientId] = useState<string | undefined>();
  const [color, setColor] = useState('blue');

  const reset = () => { setLabel(''); setClientId(undefined); setColor('blue'); };
  const save = useMutation({
    mutationFn: () => api.post('/cabinet/create', { label, color, clientId }).then((r) => r.data),
    onSuccess: (c: Cabinet) => { onCreated(c); reset(); onClose(); },
    onError: (e: any) => notify('err', e?.response?.data?.message ?? 'Could not create folder'),
  });

  if (!open) return null;

  const inputCls = 'h-11 w-full rounded-[10px] border border-[#e2e8f0] bg-white px-3.5 text-small text-text outline-none transition-colors focus:border-primary';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-card bg-white p-6 shadow-float" onClick={(e) => e.stopPropagation()}>
        <div className="text-[20px] font-extrabold tracking-tight text-text">Create cabinet</div>
        <div className="mt-0.5 text-small font-medium text-text-secondary">Group a client&apos;s specimen records into one folder.</div>

        <div className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-small font-bold text-text">Label</span>
            <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Microlabs" className={inputCls}
              onKeyDown={(e) => { if (e.key === 'Enter' && label.trim()) save.mutate(); }} />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-small font-bold text-text">Colour</span>
            <div className="flex items-center gap-2.5">
              {COLORS.map((k) => (
                <button key={k} type="button" onClick={() => setColor(k)} aria-label={k}
                  className="h-7 w-7 rounded-full transition-transform hover:scale-110"
                  style={{ background: COLOR_HEX[k], boxShadow: color === k ? '0 0 0 2px #fff, 0 0 0 4px #0f172a' : 'none' }} />
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-small font-bold text-text">Link client</span>
            <ClientSelect placeholder="Search a client to link" value={clientId} onChange={setClientId} />
            <span className="text-caption font-medium text-text-tertiary">Linking a client files all their specimen records here automatically.</span>
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2.5">
          <button onClick={onClose} className="h-11 rounded-[10px] border border-card px-5 text-small font-bold text-text-secondary hover:text-text">Cancel</button>
          <button onClick={() => label.trim() && save.mutate()} disabled={!label.trim() || save.isPending}
            className="h-11 rounded-[10px] bg-primary px-6 text-small font-bold text-white transition-colors hover:bg-primary-hover disabled:opacity-50">
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
