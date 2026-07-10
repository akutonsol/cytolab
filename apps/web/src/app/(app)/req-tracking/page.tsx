'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, PackageSearch, ScanLine, X } from 'lucide-react';
import { App as AntdApp } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFeatures } from '@/lib/feature-context';
import {
  NEXT_ACTION, PIPELINE, STAGE_META, timeInStage,
  type TrackingCard, type TrackingDetail, type TrackingStats,
} from '@/lib/req-tracking';
import { PrintLabelsModal } from '@/components/PrintLabelsModal';
import { IconAction, EmptyState } from '@/components/ui';

function StageBadge({ stage }: { stage: keyof typeof STAGE_META }) {
  const m = STAGE_META[stage];
  return <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold" style={{ background: m.bg, color: m.fg }}>{m.label}</span>;
}

// ─── Detail drawer (timeline + stage actions) ────────────────────────────────
function DetailDrawer({ requisitionId, onClose }: { requisitionId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const { can } = useAuth();
  const canEdit = can('requisition:change');
  const [fileLocation, setFileLocation] = useState('');
  const [notes, setNotes] = useState('');

  const { data } = useQuery<TrackingDetail>({ queryKey: ['req-tracking', requisitionId], queryFn: () => api.get(`/req-tracking/${requisitionId}`).then((r) => r.data) });

  const act = useMutation({
    mutationFn: ({ endpoint, body }: { endpoint: string; body?: any }) => api.post(`/req-tracking/${requisitionId}/${endpoint}`, body ?? {}).then((r) => r.data),
    onSuccess: () => { message.success('Stage updated'); ['req-tracking', 'req-tracking-list', 'req-tracking-stats'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); setNotes(''); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Action failed'),
  });

  const next = data ? NEXT_ACTION[data.currentStage] : undefined;

  return createPortal(
    <div className="fixed inset-0 flex justify-end" style={{ zIndex: 2100, background: 'rgba(15,23,42,0.55)' }} onClick={onClose}>
      <div className="flex h-full w-full max-w-[520px] flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-200 p-5">
          <div>
            <h3 className="text-[18px] font-bold text-[#0F172A]">Requisition {data?.referenceNo ?? ''}</h3>
            <p className="mt-0.5 text-[13px] text-[#475569]">{data ? `${data.clientName} · ${data.patientName}` : 'Loading…'}</p>
          </div>
          <IconAction icon={<X size={16} />} tone="strong" onClick={onClose} />
        </div>

        {data && (
          <div className="flex-1 overflow-y-auto p-5">
            <div className="flex items-center gap-2"><StageBadge stage={data.currentStage} /><span className="text-[12px] text-[#475569]">in stage {timeInStage(data.stageEnteredAt).label}</span></div>
            {data.detail.fileLocation && <div className="mt-2 text-[13px] text-[#334155]">Filed at: <span className="font-semibold">{data.detail.fileLocation}</span></div>}

            {/* Actions */}
            {canEdit && data.currentStage !== 'Filed' && data.currentStage !== 'Rejected' && (
              <div className="mt-4 rounded-xl border border-[#E2E8F0] p-3">
                <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[#475569]">Advance Stage</div>
                {data.currentStage === 'Verified' ? (
                  <div className="flex gap-2">
                    <input value={fileLocation} onChange={(e) => setFileLocation(e.target.value)} placeholder="File location, e.g. Cabinet A, Drawer 3" className="h-9 flex-1 rounded-lg border border-[#E2E8F0] px-2.5 text-[13px] outline-none focus:border-[#4F46E5]" />
                    <button disabled={!fileLocation.trim()} onClick={() => act.mutate({ endpoint: 'file', body: { fileLocation } })} className="rounded-lg bg-[#4F46E5] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-40">File</button>
                  </div>
                ) : next ? (
                  <button onClick={() => act.mutate({ endpoint: next.endpoint, body: next.endpoint === 'verify' && notes ? { verificationNotes: notes } : {} })} className="flex items-center gap-1.5 rounded-lg bg-[#4F46E5] px-3.5 py-2 text-[13px] font-semibold text-white">
                    <ArrowRight size={15} /> {next.label}
                  </button>
                ) : null}
                <div className="mt-3">
                  <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reject reason (optional note)" className="h-9 w-full rounded-lg border border-[#E2E8F0] px-2.5 text-[13px] outline-none focus:border-[#4F46E5]" />
                  <button disabled={!notes.trim()} onClick={() => act.mutate({ endpoint: 'reject', body: { notes } })} className="mt-2 rounded-lg px-3 py-1.5 text-[13px] font-semibold disabled:opacity-40" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>Reject</button>
                </div>
              </div>
            )}

            {/* Timeline */}
            <div className="mt-5">
              <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[#475569]">Custody Timeline</div>
              {data.events.length === 0 ? (
                <div className="text-[13px] text-[#475569]">No events yet.</div>
              ) : (
                <div className="flex flex-col gap-3">
                  {data.events.map((e) => (
                    <div key={e.id} className="flex items-start gap-3">
                      <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STAGE_META[e.stage].fg }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <StageBadge stage={e.stage} />
                          <span className="text-[11px] text-[#475569]">{new Date(e.performedAt).toLocaleString()}</span>
                        </div>
                        <div className="mt-1 text-[12px] text-[#475569]">{e.performedBy ? `${e.performedBy.firstName} ${e.performedBy.lastName}` : '—'}{e.notes ? ` · ${e.notes}` : ''}{e.scannedBarcode ? ` · 🔖 ${e.scannedBarcode}` : ''}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ─── Barcode scanner modal ───────────────────────────────────────────────────
function ScannerModal({ onClose, onOpenDetail }: { onClose: () => void; onOpenDetail: (id: string) => void }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [result, setResult] = useState<any>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const scan = useMutation({
    mutationFn: (v: string) => api.post('/req-tracking/scan', { barcodeValue: v }).then((r) => r.data),
    onSuccess: (r) => setResult(r),
    onError: () => message.error('Scan failed'),
  });
  const advance = useMutation({
    mutationFn: ({ id, endpoint }: { id: string; endpoint: string }) => api.post(`/req-tracking/${id}/${endpoint}`, {}).then((r) => r.data),
    onSuccess: () => { message.success('Stage advanced'); ['req-tracking-list', 'req-tracking-stats'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); onClose(); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Could not advance'),
  });

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 2200, background: 'rgba(15,23,42,0.55)' }} onClick={onClose}>
      <div className="w-full max-w-[460px] rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-[18px] font-bold text-[#0F172A]"><ScanLine size={20} className="text-[#4F46E5]" /> Scan Barcode</h3>
          <IconAction icon={<X size={16} />} tone="strong" onClick={onClose} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (value.trim()) scan.mutate(value.trim()); }}>
          <input ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)} placeholder="Scan or type barcode / req number…"
            className="h-12 w-full rounded-xl border-2 border-[#E2E8F0] px-4 text-[16px] outline-none focus:border-[#4F46E5]" />
          <p className="mt-2 text-[12px] text-[#475569]">Position the scanner and press Enter, or type the requisition number.</p>
        </form>
        {result && (result.found ? (
          <div className="mt-4 rounded-xl border border-[#C7D2FE] bg-[#EEF2FF] p-4">
            <div className="flex items-center justify-between"><span className="text-[14px] font-bold text-[#0F172A]">Requisition {result.referenceNo}</span><StageBadge stage={result.currentStage} /></div>
            <div className="mt-1 text-[13px] text-[#475569]">{result.clientName} · {result.patientName}</div>
            <div className="mt-3 flex gap-2">
              {result.nextAction && result.nextAction.endpoint !== 'file' && (
                <button onClick={() => advance.mutate({ id: result.requisitionId, endpoint: result.nextAction.endpoint })} className="flex items-center gap-1.5 rounded-lg bg-[#4F46E5] px-3.5 py-2 text-[13px] font-semibold text-white">
                  <ArrowRight size={15} /> {result.nextAction.label}
                </button>
              )}
              <button onClick={() => { onOpenDetail(result.requisitionId); onClose(); }} className="rounded-lg border border-[#E2E8F0] px-3.5 py-2 text-[13px] font-semibold text-[#475569]">Open Details</button>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border px-4 py-3 text-[14px] font-semibold" style={{ background: '#FEF2F2', borderColor: '#FECACA', color: '#B91C1C' }}>Requisition not found.</div>
        ))}
      </div>
    </div>,
    document.body,
  );
}

function Kpi({ label, value, fg, bg }: { label: string; value: number; fg: string; bg: string }) {
  return (
    <div className="rounded-2xl border border-[#EEF2F7] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
      <div className="text-[24px] font-bold leading-none" style={{ color: fg }}>{value}</div>
      <div className="mt-1.5 flex items-center gap-1.5 text-[13px] text-[#475569]"><span className="h-2 w-2 rounded-full" style={{ background: bg }} />{label}</div>
    </div>
  );
}

export default function ReqTrackingPage() {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const { can } = useAuth();
  const { isEnabled } = useFeatures();
  const enabled = isEnabled('REQUISITION_TRACKING');
  const canEdit = can('requisition:change');
  const [search, setSearch] = useState('');
  const [scanner, setScanner] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: stats } = useQuery<TrackingStats>({ queryKey: ['req-tracking-stats'], queryFn: () => api.get('/req-tracking/stats').then((r) => r.data), enabled });
  const { data: cards = [] } = useQuery<TrackingCard[]>({
    queryKey: ['req-tracking-list', search],
    queryFn: () => api.get('/req-tracking', { params: { ...(search && { search }) } }).then((r) => r.data),
    enabled, refetchInterval: 60_000,
  });

  const labelsEnabled = isEnabled('SLIDE_LABEL_PRINTING');
  const [benchPromptReq, setBenchPromptReq] = useState<string | null>(null);
  const [printRecordIds, setPrintRecordIds] = useState<string[] | null>(null);

  const quickAdvance = useMutation({
    mutationFn: ({ id, endpoint }: { id: string; endpoint: string }) => api.post(`/req-tracking/${id}/${endpoint}`, {}).then((r) => r.data),
    onSuccess: (_d, vars) => {
      ['req-tracking-list', 'req-tracking-stats'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      // Natural workflow: specimen arrives at bench → offer to print slide labels.
      if (vars.endpoint === 'receive-bench' && labelsEnabled) setBenchPromptReq(vars.id);
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Could not advance'),
  });

  // On "Yes", resolve the requisition's linked records and open the print modal.
  const openLabelsForRequisition = async (requisitionId: string) => {
    setBenchPromptReq(null);
    try {
      const res = await api.get('/specimens/requisition', { params: { requisitionId } });
      const ids = (res.data?.data ?? []).map((r: any) => r.id).filter(Boolean);
      if (ids.length === 0) { message.info('No records linked to this requisition yet.'); return; }
      setPrintRecordIds(ids);
    } catch { message.error('Could not load records for label printing.'); }
  };

  const byStage = useMemo(() => {
    const m: Record<string, TrackingCard[]> = { Pending: [], FormReceived: [], BenchReceived: [], Verified: [], Filed: [] };
    cards.forEach((c) => { if (m[c.currentStage]) m[c.currentStage].push(c); });
    return m;
  }, [cards]);
  const rejected = cards.filter((c) => c.currentStage === 'Rejected');

  if (!enabled) {
    return (
      <div className="min-h-full pt-4" style={{ background: '#F8FAFC' }}>
        <EmptyState className="mt-16"
              icon={<PackageSearch size={28} />}
              title={<>Feature not enabled</>}
              description={<>Requisition Tracking is disabled for this lab.</>}
            />
      </div>
    );
  }

  return (
    <div className="min-h-full pb-10 pt-4" style={{ background: '#F8FAFC' }}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-[#0F172A]">Requisition Tracking</h1>
          <p className="mt-1.5 text-[15px] text-[#6B7280]">Track the paper requisition form from receipt to filing.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setScanner(true)} className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 py-2.5 text-[14px] font-semibold text-[#334155]"><ScanLine size={16} /> Scan Barcode</button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <Kpi label="Pending" value={stats?.pendingCount ?? 0} fg={STAGE_META.Pending.fg} bg={STAGE_META.Pending.fg} />
        <Kpi label="Form Received" value={stats?.formReceivedCount ?? 0} fg={STAGE_META.FormReceived.fg} bg={STAGE_META.FormReceived.fg} />
        <Kpi label="At Bench" value={stats?.benchReceivedCount ?? 0} fg={STAGE_META.BenchReceived.fg} bg={STAGE_META.BenchReceived.fg} />
        <Kpi label="Verified" value={stats?.verifiedCount ?? 0} fg={STAGE_META.Verified.fg} bg={STAGE_META.Verified.fg} />
        <Kpi label="Filed Today" value={stats?.filedToday ?? 0} fg={STAGE_META.Filed.fg} bg={STAGE_META.Filed.fg} />
      </div>

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search req# or patient…" className="h-10 w-64 rounded-lg border border-[#E2E8F0] bg-white px-3 text-[14px] outline-none focus:border-[#4F46E5]" />
        {stats && stats.rejectedCount > 0 && <span className="rounded-full px-3 py-1.5 text-[13px] font-semibold" style={{ background: STAGE_META.Rejected.bg, color: STAGE_META.Rejected.fg }}>{stats.rejectedCount} rejected</span>}
      </div>

      {/* Kanban */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {PIPELINE.map((stage) => {
          const m = STAGE_META[stage];
          const list = byStage[stage] ?? [];
          return (
            <div key={stage} className="rounded-2xl border border-[#E2E8F0] bg-white">
              <div className="flex items-center justify-between border-b border-[#EEF2F7] px-3 py-2.5">
                <span className="text-[13px] font-bold text-[#0F172A]">{m.label}</span>
                <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: m.bg, color: m.fg }}>{list.length}</span>
              </div>
              <div className="flex max-h-[62vh] flex-col gap-2 overflow-y-auto p-2">
                {list.length === 0 ? (
                  <div className="py-6 text-center text-[12px] text-[#CBD5E1]">Empty</div>
                ) : list.map((c) => {
                  const tis = timeInStage(c.stageEnteredAt);
                  const next = NEXT_ACTION[c.currentStage];
                  return (
                    <div key={c.requisitionId} onClick={() => setDetailId(c.requisitionId)}
                      className="cursor-pointer rounded-xl border border-[#EEF2F7] bg-white p-2.5 shadow-[0_1px_4px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-md">
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-bold text-[#0F172A]">{c.referenceNo}</span>
                        <span className="text-[11px] font-semibold" style={{ color: tis.over24h ? '#B91C1C' : '#475569' }}>{tis.label}</span>
                      </div>
                      <div className="mt-0.5 truncate text-[12px] text-[#334155]">{c.patientName}</div>
                      <div className="truncate text-[11px] text-[#475569]">{c.clientName}</div>
                      {canEdit && next && next.endpoint !== 'file' && (
                        <button onClick={(e) => { e.stopPropagation(); quickAdvance.mutate({ id: c.requisitionId, endpoint: next.endpoint }); }}
                          className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg bg-[#EEF2FF] px-2 py-1 text-[11px] font-semibold text-[#4F46E5]">
                          {next.label} <ArrowRight size={12} />
                        </button>
                      )}
                      {canEdit && c.currentStage === 'Verified' && (
                        <button onClick={(e) => { e.stopPropagation(); setDetailId(c.requisitionId); }}
                          className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg bg-[#EEF2FF] px-2 py-1 text-[11px] font-semibold text-[#4F46E5]">File… <ArrowRight size={12} /></button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {rejected.length > 0 && (
        <div className="mt-4 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-3">
          <div className="mb-2 text-[13px] font-bold" style={{ color: '#B91C1C' }}>Rejected ({rejected.length})</div>
          <div className="flex flex-wrap gap-2">
            {rejected.map((c) => (
              <button key={c.requisitionId} onClick={() => setDetailId(c.requisitionId)} className="rounded-lg bg-white px-3 py-1.5 text-[12px] font-semibold text-[#334155]" style={{ border: '1px solid #FECACA' }}>{c.referenceNo} · {c.patientName}</button>
            ))}
          </div>
        </div>
      )}

      {scanner && <ScannerModal onClose={() => setScanner(false)} onOpenDetail={(id) => setDetailId(id)} />}
      {detailId && <DetailDrawer requisitionId={detailId} onClose={() => setDetailId(null)} />}

      {/* Bench-received → offer to print slide labels (natural workflow). */}
      {benchPromptReq && createPortal(
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 2200, background: 'rgba(15,23,42,0.55)' }} onClick={() => setBenchPromptReq(null)}>
          <div className="w-full max-w-[380px] rounded-2xl bg-white p-6 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-[17px] font-bold text-[#0F172A]">Specimen received at bench</div>
            <p className="mt-1.5 text-[14px] text-[#475569]">Print slide labels now?</p>
            <div className="mt-5 flex justify-center gap-2">
              <button onClick={() => setBenchPromptReq(null)} className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-[14px] font-semibold text-[#475569]">Not now</button>
              <button onClick={() => openLabelsForRequisition(benchPromptReq)} className="rounded-lg bg-[#4F46E5] px-4 py-2 text-[14px] font-semibold text-white">Print Labels</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
      {printRecordIds && <PrintLabelsModal recordIds={printRecordIds} onClose={() => setPrintRecordIds(null)} />}
    </div>
  );
}
