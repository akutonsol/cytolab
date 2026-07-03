'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, MoreHorizontal, Pencil, RotateCcw, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { ResultSheetModal } from '@/components/ResultSheetModal';
import { RecordFormDrawer } from '@/components/RecordFormDrawer';
import type { FormType } from '@/lib/specimen-types';

interface Rec {
  id: string;
  labNumber?: string | null;
  formType?: string | null;
  status: string;
  urgent: boolean;
  specimenDate?: string | null;
  createdAt: string;
  patient?: { firstName: string; lastName: string; registrationNo?: string | null } | null;
  client?: { id?: string; firstName: string; lastName: string; officeName?: string | null; accountNo?: string | null } | null;
  specimens?: Array<{ id: string; type: string }>;
  resultSheets?: Array<{ id: string; authorized: boolean }>;
}

// Status → reference badge classes. OnHold uses a detector-safe amber.
const STATUS_BADGE: Record<string, string> = {
  Pending: 'bg-surface-container text-secondary',
  Submitted: 'bg-surface-container text-secondary',
  Processing: 'bg-primary-fixed text-primary',
  Partial: 'bg-primary-fixed text-primary',
  Completed: 'bg-status-sage/10 text-status-sage',
  Resulted: 'bg-primary-fixed text-primary',
  Approved: 'bg-status-sage/10 text-status-sage',
  Billed: 'bg-primary-fixed text-primary',
  Paid: 'bg-status-sage/10 text-status-sage',
  OnHold: 'bg-[#FEF3C7] text-[#92400E]',
  Disabled: 'bg-surface-container text-secondary',
  Failed: 'bg-error-container text-error',
  Viewed: 'bg-status-sage/10 text-status-sage',
};
const LOCKED = ['Completed', 'Resulted', 'Approved', 'Billed', 'Paid', 'Viewed'];
const ALL_STATUSES = Object.keys(STATUS_BADGE);
// Frontend mirror of the pre-Completed transitions (Change Status is disabled once locked).
const NEXT_STATUS: Record<string, string[]> = {
  Pending: ['Submitted', 'OnHold', 'Disabled'],
  Submitted: ['Processing', 'OnHold', 'Disabled'],
  Processing: ['Partial', 'Completed', 'OnHold', 'Disabled', 'Failed'],
  Partial: ['Completed', 'OnHold', 'Disabled', 'Failed'],
  OnHold: ['Submitted', 'Processing', 'Disabled'],
};

type Tab = 'overview' | 'requisition' | 'recent' | 'authorized';
const TABS: [Tab, string][] = [
  ['overview', 'Overview'], ['requisition', 'Requisition'], ['recent', 'Recent'], ['authorized', 'Authorized'],
];

const BADGE = 'inline-flex items-center rounded-full px-3 py-1 font-label-sm text-label-sm';
const CHIP = 'inline-flex items-center rounded-md bg-surface-container px-2 py-0.5 font-label-sm text-label-sm text-secondary';
const SELECT = 'rounded-xl border border-outline-variant/40 bg-white px-3 py-2 font-body-sm text-body-sm text-on-surface outline-none focus:border-primary';
const CELL = 'px-4 py-3 font-body-sm text-body-sm text-on-surface align-top';
const TH = 'px-4 py-3 text-left font-label-sm text-label-sm text-secondary uppercase tracking-wider whitespace-nowrap';
const MENU_ITEM = 'w-full rounded-lg px-3 py-2 text-left font-body-sm text-body-sm text-on-surface hover:bg-surface-container-low disabled:opacity-40 disabled:hover:bg-transparent';

function StatusBadge({ status }: { status: string }) {
  return <span className={`${BADGE} ${STATUS_BADGE[status] ?? 'bg-surface-container text-secondary'}`}>{status}</span>;
}

export default function SpecimenOverviewPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('overview');
  const [formType, setFormType] = useState<string | undefined>();
  const [status, setStatus] = useState<string | undefined>();
  const [groupByClient, setGroupByClient] = useState(false);
  const [sheetFor, setSheetFor] = useState<Rec | null>(null);
  const [viewRec, setViewRec] = useState<Rec | null>(null);
  const [statusRec, setStatusRec] = useState<Rec | null>(null);
  const [editRec, setEditRec] = useState<Rec | null>(null);
  const [nextStatus, setNextStatus] = useState<string>();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ type: 'ok' | 'err' | 'info'; msg: string } | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; content: string; okText: string; danger?: boolean; onOk: () => void } | null>(null);
  const notify = (type: 'ok' | 'err' | 'info', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3000); };

  const { data, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['records', tab, formType, status],
    queryFn: () => {
      if (tab === 'recent') return api.get('/specimens/recent').then((r) => r.data);
      const params: any = { pageSize: 100 };
      if (formType) params.formType = formType;
      if (status) params.status = status;
      if (tab === 'authorized') params.authorized = true;
      return api.get<Paginated<Rec>>('/specimens', { params }).then((r) => r.data);
    },
  });
  const rows: Rec[] = data?.data ?? [];

  const changeStatus = useMutation({
    mutationFn: (v: { id: string; status: string }) => api.patch(`/specimen/status/${v.id}`, { status: v.status }),
    onSuccess: () => { notify('ok', 'Status updated'); qc.invalidateQueries({ queryKey: ['records'] }); setStatusRec(null); },
    onError: (e: any) => notify('err', e?.response?.data?.message ?? 'Failed'),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/specimen/delete/${id}`),
    onSuccess: () => { notify('ok', 'Record deleted'); qc.invalidateQueries({ queryKey: ['records'] }); },
    onError: (e: any) => notify('err', e?.response?.data?.message ?? 'Delete failed'),
  });

  const isLocked = (r: Rec) => LOCKED.includes(r.status);

  const confirmEdit = (r: Rec) =>
    setConfirm({ title: 'Edit this record?', content: `Editing ${r.labNumber ?? 'this record'} changes clinical form data.`, okText: 'Edit', onOk: () => setEditRec(r) });
  const confirmDelete = (r: Rec) =>
    setConfirm({ title: 'Delete this record?', content: `${r.labNumber ?? 'This record'} will be permanently deleted.`, okText: 'Delete', danger: true, onOk: () => del.mutate(r.id) });

  const urgentCount = rows.filter((r) => r.urgent).length;
  const clientGroups = useMemo(() => {
    const map = new Map<string, Rec[]>();
    for (const r of rows) {
      const key = r.client ? (r.client.officeName || `${r.client.firstName} ${r.client.lastName}`) : 'Unassigned';
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return Array.from(map.entries());
  }, [rows]);

  const patientCell = (r: Rec) => r.patient ? (
    <div>
      <div>{r.patient.firstName} {r.patient.lastName}</div>
      {r.patient.registrationNo && <div className="font-body-sm text-body-sm text-secondary">Reg {r.patient.registrationNo}</div>}
    </div>
  ) : '—';
  const clientCell = (r: Rec) => r.client ? (
    <div>
      <div>{r.client.officeName || `${r.client.firstName} ${r.client.lastName}`}</div>
      {r.client.accountNo && <div className="font-body-sm text-body-sm text-secondary">AC# {r.client.accountNo}</div>}
    </div>
  ) : '—';

  const renderTable = (recs: Rec[]) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-outline-variant/20">
            {['LAB# / SP', 'Patient', 'Client', 'Form', 'Status', 'Urgent', 'Date', ''].map((h, i) => (
              <th key={i} className={TH}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {recs.length === 0 && !isFetching && (
            <tr><td colSpan={8} className="px-4 py-10 text-center font-body-sm text-body-sm text-secondary">No records found.</td></tr>
          )}
          {recs.map((r) => (
            <tr key={r.id} className="border-b border-outline-variant/10 transition-colors hover:bg-surface-container-low/60">
              <td className={CELL}>
                <div>{r.labNumber ?? '—'}</div>
                {(r.specimens ?? []).length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">{(r.specimens ?? []).map((s) => <span key={s.id} className={CHIP}>{s.type}</span>)}</div>
                )}
              </td>
              <td className={CELL}>{patientCell(r)}</td>
              <td className={CELL}>{clientCell(r)}</td>
              <td className={CELL}>{r.formType ? <span className={CHIP}>{r.formType === 'Gynecology' ? 'GYN' : 'NON-GYN'}</span> : '—'}</td>
              <td className={CELL}><StatusBadge status={r.status} /></td>
              <td className={CELL}>{r.urgent ? <span className={`${BADGE} bg-error-container text-error`}>Urgent</span> : ''}</td>
              <td className={`${CELL} whitespace-nowrap`}>{new Date(r.specimenDate ?? r.createdAt).toLocaleDateString()}</td>
              <td className={CELL}>
                <div className="flex items-center justify-end gap-1.5">
                  <button title="Edit" disabled={isLocked(r)} onClick={() => confirmEdit(r)}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-outline-variant/30 text-secondary transition-colors hover:bg-surface-container-low disabled:opacity-40 disabled:hover:bg-transparent">
                    <Pencil size={14} />
                  </button>
                  <div className="relative">
                    <button title="More" onClick={() => setOpenMenu(openMenu === r.id ? null : r.id)}
                      className="grid h-8 w-8 place-items-center rounded-lg border border-outline-variant/30 text-secondary transition-colors hover:bg-surface-container-low">
                      <MoreHorizontal size={16} />
                    </button>
                    {openMenu === r.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
                        <div className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-outline-variant/30 bg-white p-1 shadow-lg">
                          <button className={MENU_ITEM} onClick={() => { setOpenMenu(null); setViewRec(r); }}>View Details</button>
                          <button className={MENU_ITEM} disabled={isLocked(r)} onClick={() => { setOpenMenu(null); setStatusRec(r); setNextStatus(undefined); }}>Change Status</button>
                          <button className={MENU_ITEM} onClick={() => { setOpenMenu(null); setSheetFor(r); }}>Add Result Sheet</button>
                          <button className={MENU_ITEM} onClick={() => { setOpenMenu(null); notify('info', 'File upload arrives with Phase 6 file storage.'); }}>Attach File</button>
                          <div className="my-1 border-t border-outline-variant/20" />
                          <button className={`${MENU_ITEM} text-error hover:bg-error-container`} disabled={isLocked(r)} onClick={() => { setOpenMenu(null); confirmDelete(r); }}>Delete</button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1400px]">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-headline-md text-headline-md text-charcoal-heading">Result Sheets</h2>
          <p className="font-body-sm text-body-sm text-secondary">Review and manage cytology result sheets.</p>
        </div>
        <div className="flex items-center gap-4">
          {urgentCount > 0 && <span className={`${BADGE} bg-error-container text-error`}>{urgentCount} urgent</span>}
          <div className="flex items-center gap-2">
            <span className="font-body-sm text-body-sm text-secondary">Client folders</span>
            <button role="switch" aria-checked={groupByClient} onClick={() => setGroupByClient((v) => !v)}
              className="relative h-6 w-11 rounded-full transition-colors" style={{ background: groupByClient ? '#4F46E5' : '#c7c4d8' }}>
              <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all" style={{ left: groupByClient ? 22 : 2 }} />
            </button>
          </div>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-6">
        {/* Filters */}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-xl bg-surface-container-low p-1">
            {TABS.map(([v, l]) => (
              <button key={v} onClick={() => setTab(v)}
                className={`rounded-lg px-4 py-2 font-label-md text-label-md transition-colors ${tab === v ? 'bg-white text-primary shadow-sm' : 'text-secondary hover:text-on-surface'}`}>
                {l}
              </button>
            ))}
          </div>
          <select className={SELECT} value={formType ?? ''} onChange={(e) => setFormType(e.target.value || undefined)}>
            <option value="">All Forms</option>
            <option value="Gynecology">Gynecology</option>
            <option value="NonGynecology">Non-Gynecology</option>
          </select>
          <select className={SELECT} value={status ?? ''} onChange={(e) => setStatus(e.target.value || undefined)}>
            <option value="">All Statuses</option>
            {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {isFetching && <span className="font-body-sm text-body-sm text-secondary">Loading…</span>}
        </div>

        {isError && (
          <div className="mb-4 rounded-xl border border-error/20 bg-error-container p-4">
            <div className="font-label-md text-label-md text-error">Failed to load</div>
            <div className="font-body-sm text-body-sm text-on-error-container">{(error as any)?.response?.data?.message ?? 'Could not load specimens.'}</div>
            <button className="btn-secondary mt-3" onClick={() => refetch()}><RotateCcw size={14} /> Retry</button>
          </div>
        )}

        {groupByClient ? (
          <div>
            {clientGroups.map(([name, recs]) => {
              const open = !collapsed.has(name);
              return (
                <div key={name} className="mb-3 overflow-hidden rounded-xl border border-outline-variant/20">
                  <button onClick={() => setCollapsed((prev) => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; })}
                    className="flex w-full items-center justify-between bg-surface-container-low px-4 py-3 text-left">
                    <span className="flex items-center gap-2 font-label-md text-label-md text-on-surface">
                      <b>{name}</b><span className={CHIP}>{recs.length}</span>
                    </span>
                    <ChevronDown size={16} className={`text-secondary transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                  {open && renderTable(recs)}
                </div>
              );
            })}
          </div>
        ) : (
          renderTable(rows)
        )}
      </div>

      <ResultSheetModal open={!!sheetFor} onClose={() => setSheetFor(null)} record={sheetFor} />

      <RecordFormDrawer
        open={!!editRec}
        onClose={() => setEditRec(null)}
        formType={(editRec?.formType as FormType) ?? 'Gynecology'}
        recordId={editRec?.id}
      />

      {/* View details */}
      {viewRec && (
        <Overlay onClose={() => setViewRec(null)}>
          <div className="mb-5 flex items-center justify-between">
            <h3 className="font-headline-sm text-headline-sm text-charcoal-heading">Record details</h3>
            <button onClick={() => setViewRec(null)} className="grid h-8 w-8 place-items-center rounded-lg text-secondary hover:bg-surface-container-low"><X size={16} /></button>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Field label="Lab No." value={viewRec.labNumber ?? '—'} />
            <Field label="Status"><StatusBadge status={viewRec.status} /></Field>
            <Field label="Form" value={viewRec.formType ?? '—'} />
            <Field label="Urgent" value={viewRec.urgent ? 'Yes' : 'No'} />
            <Field label="Patient" span>{viewRec.patient ? `${viewRec.patient.firstName} ${viewRec.patient.lastName}` : '—'}</Field>
            <Field label="Client" span>{viewRec.client ? (viewRec.client.officeName || `${viewRec.client.firstName} ${viewRec.client.lastName}`) : '—'}</Field>
            <Field label="Specimens" span>
              <div className="flex flex-wrap gap-1">{(viewRec.specimens ?? []).map((s) => <span key={s.id} className={CHIP}>{s.type}</span>)}</div>
            </Field>
          </dl>
        </Overlay>
      )}

      {/* Change status */}
      {statusRec && (
        <Overlay onClose={() => setStatusRec(null)}>
          <div className="mb-5 flex items-center justify-between">
            <h3 className="font-headline-sm text-headline-sm text-charcoal-heading">Change Status — {statusRec.labNumber ?? ''}</h3>
            <button onClick={() => setStatusRec(null)} className="grid h-8 w-8 place-items-center rounded-lg text-secondary hover:bg-surface-container-low"><X size={16} /></button>
          </div>
          <div className="mb-3 flex items-center gap-2 font-body-sm text-body-sm text-on-surface">
            <span>Current:</span><StatusBadge status={statusRec.status} />
          </div>
          <select className={`${SELECT} w-full`} value={nextStatus ?? ''} onChange={(e) => setNextStatus(e.target.value || undefined)}>
            <option value="">Next status</option>
            {(NEXT_STATUS[statusRec.status] ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="mt-6 flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setStatusRec(null)}>Cancel</button>
            <button className="btn-primary" disabled={!nextStatus || changeStatus.isPending} style={{ opacity: !nextStatus || changeStatus.isPending ? 0.5 : 1 }}
              onClick={() => statusRec && nextStatus && changeStatus.mutate({ id: statusRec.id, status: nextStatus })}>
              {changeStatus.isPending ? 'Updating…' : 'Update'}
            </button>
          </div>
        </Overlay>
      )}

      {/* Confirm */}
      {confirm && (
        <Overlay onClose={() => setConfirm(null)} maxW={440}>
          <h3 className="font-headline-sm text-headline-sm text-charcoal-heading">{confirm.title}</h3>
          <p className="mt-2 font-body-sm text-body-sm text-secondary">{confirm.content}</p>
          <div className="mt-6 flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setConfirm(null)}>Cancel</button>
            <button className="btn-primary" style={confirm.danger ? { background: '#DC2626', boxShadow: '0 4px 12px rgba(220,38,38,0.2)' } : undefined}
              onClick={() => { confirm.onOk(); setConfirm(null); }}>{confirm.okText}</button>
          </div>
        </Overlay>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-[120] rounded-xl px-4 py-3 font-label-md text-label-md text-white shadow-lg"
          style={{ background: toast.type === 'ok' ? '#16A34A' : toast.type === 'err' ? '#DC2626' : '#4F46E5' }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function Overlay({ onClose, children, maxW = 620 }: { onClose: () => void; children: React.ReactNode; maxW?: number }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="w-full rounded-2xl bg-white p-6 shadow-xl" style={{ maxWidth: maxW }} onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

function Field({ label, value, children, span }: { label: string; value?: React.ReactNode; children?: React.ReactNode; span?: boolean }) {
  return (
    <div className={span ? 'col-span-2' : ''}>
      <dt className="mb-1 font-label-sm text-label-sm text-secondary uppercase tracking-wider">{label}</dt>
      <dd className="font-body-sm text-body-sm text-on-surface">{children ?? value}</dd>
    </div>
  );
}
