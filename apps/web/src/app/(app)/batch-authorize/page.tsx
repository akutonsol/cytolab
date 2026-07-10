'use client';

import { Fragment, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCheck, CheckCircle2, ChevronDown, ChevronRight, ListChecks, X } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { useFeatures } from '@/lib/feature-context';
import { PRIORITY_META, type TatPriority } from '@/lib/workload';
import { SPECIMEN_LABELS } from '@/lib/specimen-types';
import { IconAction, EmptyState } from '@/components/ui';
import { notify } from '@/lib/notify';

interface BatchCase {
  id: string; labNo: string; patientName: string; formType: string | null; specimenType: string | null;
  narrativePreview: string; narrative: string; assignedTo: string | null; tatPriority: TatPriority; hasEscalation: boolean;
}
interface PreviewResp { total: number; gyn: number; nonGyn: number; cases: BatchCase[] }
interface BatchResult { authorized: number; skipped: number; errors: number; skippedRecords: { recordId: string; labNo: string; reason: string }[] }

const SPEC_TYPES = Object.keys(SPECIMEN_LABELS);

function PriorityBadge({ p }: { p: TatPriority }) {
  const m = PRIORITY_META[p];
  return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: m.bg, color: m.fg }}>{m.label}</span>;
}

export default function BatchAuthorizePage() {
  const router = useRouter();
  const params = useSearchParams();
  const { isEnabled } = useFeatures();
  const enabled = isEnabled('BATCH_AUTHORIZATION');

  // Filters
  const [specimenTypes, setSpecimenTypes] = useState<string[]>([]);
  const [formType, setFormType] = useState('');
  const [clientId, setClientId] = useState('');
  const [assignedToId, setAssignedToId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [appliedFilters, setAppliedFilters] = useState<Record<string, string> | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [batchNote, setBatchNote] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<BatchResult | null>(null);

  const preselect = params.get('recordIds');

  const { data: clientsPage } = useQuery<Paginated<any>>({ queryKey: ['batch-clients'], queryFn: () => api.get('/clients', { params: { pageSize: 200 } }).then((r) => r.data), enabled });
  const { data: reviewers = [] } = useQuery<{ userId: string; userName: string }[]>({ queryKey: ['workload-summary'], queryFn: () => api.get('/workload/summary').then((r) => r.data), enabled });

  const { data: preview, isFetching, refetch } = useQuery<PreviewResp>({
    queryKey: ['batch-preview', appliedFilters],
    queryFn: () => api.get('/records/batch-preview', { params: appliedFilters ?? {} }).then((r) => r.data),
    enabled: enabled && appliedFilters !== null,
    refetchInterval: 60_000,
  });

  // Auto-run an initial preview (so pre-selected records resolve too).
  useEffect(() => { if (enabled && appliedFilters === null) setAppliedFilters({}); }, [enabled, appliedFilters]);
  // Apply pre-selected record ids once the preview arrives.
  useEffect(() => {
    if (preselect && preview) {
      const ids = new Set(preselect.split(',').filter(Boolean));
      setSelected(new Set(preview.cases.filter((c) => ids.has(c.id)).map((c) => c.id)));
    }
  }, [preselect, preview]);

  const cases = preview?.cases ?? [];
  const applyFilters = () => {
    setAppliedFilters({
      ...(specimenTypes.length && { specimenType: specimenTypes.join(',') }),
      ...(formType && { formType }),
      ...(clientId && { clientId }),
      ...(assignedToId && { assignedToId }),
      ...(dateFrom && { dateFrom }),
      ...(dateTo && { dateTo }),
    });
    setSelected(new Set());
  };

  const allSelected = cases.length > 0 && cases.every((c) => selected.has(c.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(cases.slice(0, 50).map((c) => c.id)));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const selectedCases = cases.filter((c) => selected.has(c.id));
  const escalatedSelected = selectedCases.filter((c) => c.hasEscalation).length;

  const authorize = useMutation({
    mutationFn: () => api.post('/records/batch-authorize', { recordIds: Array.from(selected), batchNote: batchNote || undefined }).then((r) => r.data as BatchResult),
    onSuccess: (r) => { setResult(r); setConfirmOpen(false); refetch(); },
    onError: (e: any) => { setConfirmOpen(false); notify.error(e?.response?.data?.message ?? 'Batch authorization failed'); },
  });

  if (!enabled) {
    return (
      <div className="min-h-full pt-4" style={{ background: '#F8FAFC' }}>
        <EmptyState className="mt-16"
              icon={<ListChecks size={28} />}
              title={<>Feature not enabled</>}
              description={<>Batch Authorization is disabled for this lab.</>}
            />
      </div>
    );
  }

  // ── Results screen ──
  if (result) {
    return (
      <div className="min-h-full pb-10 pt-4" style={{ background: '#F8FAFC' }}>
        <div className="mx-auto mt-8 max-w-2xl">
          <div className="rounded-2xl border p-8 text-center" style={{ background: '#F0FDF4', borderColor: '#BBF7D0' }}>
            <CheckCircle2 size={56} className="mx-auto text-[#16A34A]" />
            <h1 className="mt-4 text-[24px] font-bold text-[#0F172A]">Batch Authorization Complete</h1>
            <div className="mt-4 flex flex-col items-center gap-1 text-[15px]">
              <div className="font-semibold text-[#16A34A]">✓ {result.authorized} case{result.authorized === 1 ? '' : 's'} authorized successfully</div>
              {(result.skipped + result.errors) > 0 && <div className="font-semibold text-[#854D0E]">⚠ {result.skipped + result.errors} case{result.skipped + result.errors === 1 ? '' : 's'} skipped</div>}
            </div>
          </div>
          {result.skippedRecords.length > 0 && (
            <div className="mt-4 rounded-2xl border border-[#EEF2F7] bg-white p-4">
              <div className="mb-2 text-[14px] font-bold text-[#0F172A]">Skipped records</div>
              <div className="flex flex-col gap-2">
                {result.skippedRecords.map((s) => (
                  <div key={s.recordId} className="rounded-lg px-3 py-2 text-[13px]" style={{ background: '#F8FAFC' }}>
                    <span className="font-semibold text-[#334155]">{s.labNo}</span> <span className="text-[#475569]">— {s.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="mt-5 flex justify-center gap-3">
            <button onClick={() => router.push('/authorizer?tab=approved')} className="rounded-lg bg-[#4F46E5] px-4 py-2.5 text-[14px] font-semibold text-white">View Authorized Records</button>
            <button onClick={() => { setResult(null); setSelected(new Set()); setBatchNote(''); refetch(); }} className="rounded-lg border border-[#E2E8F0] px-4 py-2.5 text-[14px] font-semibold text-[#475569]">Run Another Batch</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full pb-28 pt-4" style={{ background: '#F8FAFC' }}>
      <div className="mb-5">
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-[#0F172A]">Batch Authorization</h1>
        <p className="mt-1.5 text-[15px] text-[#6B7280]">Review and authorize multiple cases simultaneously. Only cases with complete result sheets are eligible.</p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[35fr_65fr]">
        {/* Filters */}
        <div className="rounded-2xl border border-[#EEF2F7] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)] lg:sticky lg:top-4 lg:self-start">
          <div className="mb-3 text-[15px] font-bold text-[#0F172A]">Filter &amp; Preview</div>
          <L label="Specimen Type">
            <div className="max-h-32 overflow-y-auto rounded-lg border border-[#E2E8F0] p-2">
              {SPEC_TYPES.map((t) => (
                <label key={t} className="flex items-center gap-2 py-0.5 text-[13px] text-[#334155]">
                  <input type="checkbox" checked={specimenTypes.includes(t)} onChange={() => setSpecimenTypes((s) => s.includes(t) ? s.filter((x) => x !== t) : [...s, t])} style={{ accentColor: '#4F46E5' }} />
                  {SPECIMEN_LABELS[t]}
                </label>
              ))}
            </div>
          </L>
          <L label="Form Type"><select value={formType} onChange={(e) => setFormType(e.target.value)} className={inp}><option value="">Both</option><option value="Gynecology">GYN</option><option value="NonGynecology">NON-GYN</option></select></L>
          <L label="Client"><select value={clientId} onChange={(e) => setClientId(e.target.value)} className={inp}><option value="">All clients</option>{(clientsPage?.data ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.officeName || `${c.firstName} ${c.lastName}`}</option>)}</select></L>
          <L label="Assigned To"><select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)} className={inp}><option value="">Anyone</option>{reviewers.map((r) => <option key={r.userId} value={r.userId}>{r.userName}</option>)}</select></L>
          <div className="grid grid-cols-2 gap-2">
            <L label="From"><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inp} /></L>
            <L label="To"><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inp} /></L>
          </div>
          <button onClick={applyFilters} className="mt-1 w-full rounded-lg bg-[#4F46E5] px-4 py-2.5 text-[14px] font-semibold text-white">Preview Cases</button>

          {preview && (
            <div className="mt-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-[13px]">
              <div className="font-bold text-[#0F172A]">{preview.total} eligible case{preview.total === 1 ? '' : 's'} found</div>
              <div className="mt-1 text-[#475569]">{preview.gyn} GYN · {preview.nonGyn} NON-GYN</div>
              {preview.total > 50 && <div className="mt-2 rounded-lg px-2 py-1.5 text-[12px] font-semibold" style={{ background: '#FEFCE8', color: '#854D0E' }}>Only first 50 will be authorized per batch.</div>}
            </div>
          )}
        </div>

        {/* Review table */}
        <div className="rounded-2xl border border-[#EEF2F7] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-[#EEF2F7] text-[11px] uppercase tracking-wide text-[#475569]">
                  <th className="px-3 py-2.5"><input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ accentColor: '#4F46E5' }} /></th>
                  <th className="px-3 py-2.5 font-semibold">Lab#</th><th className="px-3 py-2.5 font-semibold">Patient</th>
                  <th className="px-3 py-2.5 font-semibold">Form</th><th className="px-3 py-2.5 font-semibold">Specimen</th>
                  <th className="px-3 py-2.5 font-semibold">Priority</th><th className="px-3 py-2.5 font-semibold">Narrative</th><th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {isFetching ? (
                  <tr><td colSpan={8} className="px-3 py-12 text-center text-[#475569]">Loading…</td></tr>
                ) : cases.length === 0 ? (
                  <tr><td colSpan={8} className="px-3 py-12 text-center text-[#475569]">No eligible cases. Adjust filters and preview.</td></tr>
                ) : cases.map((c) => (
                  <Fragment key={c.id}>
                    <tr className="border-b border-[#F1F5F9]" style={selected.has(c.id) ? { background: '#EEF2FF' } : undefined}>
                      <td className="px-3 py-2.5"><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} style={{ accentColor: '#4F46E5' }} /></td>
                      <td className="px-3 py-2.5 font-semibold text-[#0F172A]">
                        <span className="inline-flex items-center gap-1.5">
                          {c.hasEscalation && <AlertTriangle size={13} style={{ color: '#B91C1C' }} />}
                          {c.labNo}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-[#334155]">{c.patientName}</td>
                      <td className="px-3 py-2.5"><span className="rounded px-1.5 py-0.5 text-[11px] font-bold" style={c.formType === 'Gynecology' ? { background: '#EEF3FF', color: '#4F46E5' } : { background: '#F0FDF4', color: '#16A34A' }}>{c.formType === 'Gynecology' ? 'GYN' : 'NON-GYN'}</span></td>
                      <td className="px-3 py-2.5 text-[#475569]">{c.specimenType ? SPECIMEN_LABELS[c.specimenType] ?? c.specimenType : '—'}</td>
                      <td className="px-3 py-2.5"><PriorityBadge p={c.tatPriority} /></td>
                      <td className="px-3 py-2.5 text-[#475569]">{c.narrativePreview.slice(0, 80)}{c.narrative.length > 80 ? '…' : ''}</td>
                      <td className="px-3 py-2.5"><button onClick={() => setExpanded(expanded === c.id ? null : c.id)} className="text-[#475569]">{expanded === c.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button></td>
                    </tr>
                    {expanded === c.id && (
                      <tr style={{ background: '#F8FAFC' }}>
                        <td colSpan={8} className="px-6 py-3 text-[13px] leading-relaxed text-[#475569] whitespace-pre-wrap">{c.narrative || 'No narrative.'}</td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {cases.length > 0 && (
            <div className="border-t border-[#EEF2F7] p-4">
              <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-[#475569]">Batch Note</label>
              <textarea value={batchNote} onChange={(e) => setBatchNote(e.target.value)} rows={2} placeholder="Add a note to all authorized records (optional)" className={inp} />
            </div>
          )}
        </div>
      </div>

      {/* Sticky action bar */}
      {cases.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#E2E8F0] bg-white px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
          {escalatedSelected > 0 && (
            <div className="mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold" style={{ background: '#FEFCE8', border: '1px solid #FEF08A', color: '#854D0E' }}>
              <AlertTriangle size={15} /> {escalatedSelected} selected record{escalatedSelected === 1 ? ' has' : 's have'} abnormal findings. Review carefully before batch authorizing.
            </div>
          )}
          <div className="flex items-center justify-between gap-4">
            <span className="text-[14px] font-semibold text-[#334155]">{selected.size} case{selected.size === 1 ? '' : 's'} selected</span>
            <button disabled={selected.size === 0} onClick={() => setConfirmOpen(true)} className="flex items-center gap-2 rounded-lg bg-[#4F46E5] px-5 py-2.5 text-[14px] font-semibold text-white disabled:opacity-40">
              <CheckCheck size={17} /> Authorize {selected.size} Case{selected.size === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      )}

      {/* Confirmation modal */}
      {confirmOpen && createPortal(
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 2200, background: 'rgba(15,23,42,0.55)' }} onClick={() => setConfirmOpen(false)}>
          <div className="w-full max-w-[460px] rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[18px] font-bold text-[#0F172A]">Authorize {selected.size} cases?</h3>
              <IconAction icon={<X size={16} />} tone="strong" onClick={() => setConfirmOpen(false)} />
            </div>
            <p className="text-[14px] text-[#475569]">You are about to authorize {selected.size} case{selected.size === 1 ? '' : 's'}.</p>
            <div className="mt-3 rounded-lg bg-[#F8FAFC] p-3 text-[13px] text-[#334155]">
              {selectedCases.slice(0, 5).map((c) => <div key={c.id}>{c.labNo}</div>)}
              {selected.size > 5 && <div className="text-[#475569]">and {selected.size - 5} more</div>}
            </div>
            {batchNote && <div className="mt-3 text-[13px]"><span className="font-semibold text-[#334155]">Batch note:</span> <span className="text-[#475569]">{batchNote}</span></div>}
            <div className="mt-3 text-[13px] font-semibold text-[#B91C1C]">This action cannot be undone.</div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirmOpen(false)} className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-[14px] font-semibold text-[#475569]">Cancel</button>
              <button disabled={authorize.isPending} onClick={() => authorize.mutate()} className="rounded-lg bg-[#4F46E5] px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-40">Authorize All</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

const inp = 'h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-[14px] text-[#0F172A] outline-none focus:border-[#4F46E5]';
const L = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="mb-3"><label className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-[#475569]">{label}</label>{children}</div>
);
