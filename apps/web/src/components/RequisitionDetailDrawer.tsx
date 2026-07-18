'use client';

import { useState } from 'react';
import { Drawer, Input, InputNumber, Radio, Switch, Tooltip } from 'antd';
import { Check, Circle, Copy, ExternalLink, FileText, Plus, Printer } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DS } from '@/lib/drawer-styles';
import { DrawerHeader, PremiumFormStyles } from '@/components/DrawerChrome';
import { RecordFormDrawer } from '@/components/RecordFormDrawer';
import { notify } from '@/lib/notify';
import type { FormType } from '@/lib/specimen-types';

// ── Types (mirror the requisitionSelect shape from the API) ──────────────────
interface LineRecord { id: string; labNumber?: string | null; status?: string | null }
interface Line {
  id: string;
  referenceNo?: string | null;
  formType: FormType;
  isUrgent: boolean;
  isCompleted: boolean;
  notes?: string | null;
  amount: number; // cents
  recordId?: string | null;
  record?: LineRecord | null;
}
interface Requisition {
  id: string;
  referenceNo?: string | null;
  status: string;
  amount: number; // cents
  client?: { firstName: string; lastName: string; officeName?: string | null; accountNo?: string | null; email?: string | null } | null;
  dateReceived?: string | null;
  createdAt: string;
  lines: Line[];
}

interface Props {
  requisitionId: string | null;
  open: boolean;
  onClose: () => void;
  /** Whether the current user can edit lines / accession forms. */
  canEdit?: boolean;
}

const money = (cents?: number) => `$${((Number(cents) || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const clientName = (r?: Requisition['client']) => (r ? (r.officeName || `${r.firstName} ${r.lastName}`.trim()) : '—');
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');

// Status → badge (zero-orange; PARTIAL uses the amber-safe token pair).
const STATUS_UI: Record<string, { bg: string; fg: string; label: string }> = {
  Partial: { bg: 'var(--status-warning-soft-100)', fg: 'var(--status-warning-strong)', label: 'PARTIAL' },
  Completed: { bg: '#DCFCE7', fg: '#15803D', label: 'COMPLETE' },
  Active: { bg: '#DBEAFE', fg: '#1D4ED8', label: 'RECEIVED' },
  Pending: { bg: '#F1F5F9', fg: '#475569', label: 'PENDING' },
  Disabled: { bg: '#F1F5F9', fg: '#475569', label: 'DISABLED' },
};
const statusUI = (s: string) => STATUS_UI[s] ?? { bg: '#F1F5F9', fg: '#475569', label: s.toUpperCase() };

export function RequisitionDetailDrawer({ requisitionId, open, onClose, canEdit = false }: Props) {
  const qc = useQueryClient();
  // Which line's patient form is open, and in which mode.
  const [formLine, setFormLine] = useState<Line | null>(null);
  // Local, per-line pending edits for notes/cost (committed on blur).
  const [draft, setDraft] = useState<Record<string, { notes?: string; amount?: number }>>({});

  const { data: req, isLoading } = useQuery({
    queryKey: ['requisition', requisitionId],
    queryFn: () => api.get<Requisition>(`/requisitions/${requisitionId}`).then((r) => r.data),
    enabled: open && !!requisitionId,
  });

  const patch = useMutation({
    mutationFn: (v: { id: string; body: Record<string, unknown> }) => api.patch(`/requisition/line/${v.id}`, v.body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requisition', requisitionId] });
      qc.invalidateQueries({ queryKey: ['requisitions'] });
    },
    onError: (e: any) => notify.error(e?.response?.data?.message ?? 'Update failed'),
  });

  const saveField = (line: Line, body: Record<string, unknown>) => {
    if (!canEdit) return;
    patch.mutate({ id: line.id, body });
  };

  const lines = req?.lines ?? [];
  const ordered = lines.length;
  const fulfilled = lines.filter((l) => l.isCompleted).length;

  const copyRef = (ref?: string | null) => {
    if (!ref) return;
    navigator.clipboard?.writeText(ref).then(
      () => notify.success('Reference copied'),
      () => notify.error('Could not copy'),
    );
  };

  // Print a clean manifest of the fulfilled items in a new window.
  const printCompleted = () => {
    if (!req) return;
    const done = lines.filter((l) => l.isCompleted);
    const rows = done.map((l) => `
      <tr>
        <td>${l.referenceNo ?? '—'}</td>
        <td>${l.record?.labNumber ?? '—'}</td>
        <td>${l.formType === 'Gynecology' ? 'Gynecology' : 'Non-Gynecology'}</td>
        <td style="text-align:right">${money(l.amount)}</td>
      </tr>`).join('');
    const total = done.reduce((s, l) => s + (l.amount || 0), 0);
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Requisition #${req.referenceNo ?? ''} — Completed</title>
      <style>
        body{font-family:Inter,Arial,sans-serif;color:#0F172A;margin:40px;}
        h1{font-size:20px;margin:0 0 4px;color:#1E3A8A;}
        .meta{color:#475569;font-size:13px;margin-bottom:24px;}
        table{width:100%;border-collapse:collapse;font-size:13px;}
        th{text-align:left;text-transform:uppercase;font-size:11px;letter-spacing:.06em;color:#64748B;border-bottom:2px solid #E2E8F0;padding:8px 10px;}
        td{padding:8px 10px;border-bottom:1px solid #F1F5F9;}
        tfoot td{font-weight:700;border-top:2px solid #E2E8F0;border-bottom:none;}
        @media print{@page{margin:16mm;}}
      </style></head><body>
      <h1>Requisition #${req.referenceNo ?? ''} — Completed Items</h1>
      <div class="meta">${clientName(req.client)}${req.client?.accountNo ? ` · AC# ${req.client.accountNo}` : ''} · Received ${fmtDate(req.dateReceived ?? req.createdAt)} · ${done.length} of ${ordered} fulfilled</div>
      <table>
        <thead><tr><th>Reference #</th><th>Lab No.</th><th>Form</th><th style="text-align:right">Cost</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4" style="color:#94A3B8;padding:24px 10px">No completed items yet.</td></tr>'}</tbody>
        <tfoot><tr><td colspan="3">Total (completed)</td><td style="text-align:right">${money(total)}</td></tr></tfoot>
      </table>
      <script>window.onload=function(){window.print();}</script>
      </body></html>`;
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) { notify.error('Pop-up blocked — allow pop-ups to print'); return; }
    w.document.write(html);
    w.document.close();
  };

  const TH: React.CSSProperties = { textAlign: 'left', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#64748B', padding: '10px 12px', whiteSpace: 'nowrap' };
  const TD: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle', borderTop: '1px solid #F1F5F9' };

  const su = statusUI(req?.status ?? 'Pending');

  return (
    <>
      <Drawer
        width={DS.drawerWidth}
        open={open}
        onClose={onClose}
        destroyOnClose
        closable={false}
        styles={{ header: { display: 'none' }, body: { background: DS.drawerBg, padding: DS.drawerPadding }, content: { boxShadow: '-8px 0 40px rgba(0,0,0,0.12)' } }}
      >
        <PremiumFormStyles />
        <DrawerHeader
          title={`Requisition #${req?.referenceNo ?? ''}`}
          subtitle={req ? `${clientName(req.client)}${req.client?.email ? ` · ${req.client.email}` : ''}` : 'Loading…'}
          onClose={onClose}
          actions={
            <button type="button" style={DS.btnOutline} onClick={printCompleted} disabled={!req}>
              <Printer size={15} /> Print Completed
            </button>
          }
        />

        {/* Summary row */}
        <div style={{ ...DS.section, display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center', justifyContent: 'space-between' }}>
          <Info label="Client" value={clientName(req?.client)} sub={req?.client?.accountNo ? `AC# ${req.client.accountNo}` : undefined} />
          <Info label="Date Received" value={fmtDate(req?.dateReceived ?? req?.createdAt)} />
          <Info label="Items" value={`${ordered}`} sub={`Fulfilled ${fulfilled}/${ordered}`} />
          <Info label="Amount" value={money(req?.amount)} accent />
          <div>
            <div style={{ ...DS.label, marginBottom: 6 }}>Status</div>
            <span style={{ background: su.bg, color: su.fg, borderRadius: 999, padding: '4px 12px', fontSize: 11, fontWeight: 700 }}>{su.label}</span>
          </div>
        </div>

        <div style={DS.sectionLabel}>Items</div>

        <div style={{ ...DS.section, padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F8FAFC' }}>
                  <th style={TH}>Form</th>
                  <th style={TH}>Urgent</th>
                  <th style={{ ...TH, minWidth: 180 }}>Notes</th>
                  <th style={TH}>Cost</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Reference #</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td style={{ ...TD, color: '#94A3B8', padding: 24 }} colSpan={5}>Loading items…</td></tr>
                )}
                {!isLoading && lines.length === 0 && (
                  <tr><td style={{ ...TD, color: '#94A3B8', padding: 24 }} colSpan={5}>No items on this requisition.</td></tr>
                )}
                {lines.map((l) => {
                  const d = draft[l.id] ?? {};
                  const accessioned = !!l.record?.id;
                  return (
                    <tr key={l.id}>
                      {/* Form type */}
                      <td style={TD}>
                        {canEdit ? (
                          <Radio.Group
                            size="small" optionType="button" buttonStyle="solid" value={l.formType}
                            onChange={(e) => saveField(l, { formType: e.target.value })}
                          >
                            <Radio.Button value="Gynecology">Gyn</Radio.Button>
                            <Radio.Button value="NonGynecology">Non-Gyn</Radio.Button>
                          </Radio.Group>
                        ) : (
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{l.formType === 'Gynecology' ? 'Gynecology' : 'Non-Gynecology'}</span>
                        )}
                      </td>
                      {/* Urgent */}
                      <td style={TD}>
                        <Switch
                          size="small" checked={l.isUrgent} disabled={!canEdit}
                          onChange={(v) => saveField(l, { isUrgent: v })}
                        />
                        {l.isUrgent && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: '#E11D48' }}>URGENT</span>}
                      </td>
                      {/* Notes */}
                      <td style={TD}>
                        <Input
                          size="small" variant="borderless" placeholder="Type a note"
                          value={d.notes ?? l.notes ?? ''} readOnly={!canEdit}
                          onChange={(e) => setDraft((p) => ({ ...p, [l.id]: { ...p[l.id], notes: e.target.value } }))}
                          onBlur={() => { if (canEdit && (d.notes ?? '') !== (l.notes ?? '') && d.notes !== undefined) saveField(l, { notes: d.notes }); }}
                        />
                      </td>
                      {/* Cost */}
                      <td style={TD}>
                        <InputNumber
                          size="small" variant="borderless" min={0} precision={2} prefix="$" style={{ width: 110 }}
                          value={d.amount ?? l.amount / 100} readOnly={!canEdit}
                          onChange={(v) => setDraft((p) => ({ ...p, [l.id]: { ...p[l.id], amount: Number(v) || 0 } }))}
                          onBlur={() => { if (canEdit && d.amount !== undefined && Math.round(d.amount * 100) !== l.amount) saveField(l, { amount: Math.round(d.amount * 100) }); }}
                        />
                      </td>
                      {/* Reference # — clickable to the patient form */}
                      <td style={{ ...TD, textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                          <Tooltip title="Copy reference">
                            <button type="button" onClick={() => copyRef(l.referenceNo)} style={iconBtn} aria-label="Copy reference"><Copy size={13} /></button>
                          </Tooltip>
                          <button
                            type="button"
                            onClick={() => setFormLine(l)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#4F46E5', fontWeight: 700, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}
                            title={accessioned ? 'Open patient form' : 'Create patient form for this item'}
                          >
                            {l.referenceNo ?? '—'}
                            {accessioned ? <ExternalLink size={13} /> : <Plus size={13} />}
                          </button>
                          {l.isCompleted
                            ? <Tooltip title="Fulfilled"><Check size={18} style={{ color: '#22C55E' }} /></Tooltip>
                            : <Tooltip title={accessioned ? 'In progress' : 'Not accessioned'}><Circle size={16} style={{ color: '#CBD5E1' }} /></Tooltip>}
                        </div>
                        {l.record?.labNumber && (
                          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>Lab No. {l.record.labNumber}</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748B', fontSize: 12, marginTop: 4 }}>
          <FileText size={13} /> Click a reference number to open that item&apos;s patient form.
        </div>
      </Drawer>

      {/* Nested patient form: edit when accessioned, create (linked to the line) when not. */}
      {formLine && (
        <RecordFormDrawer
          open={!!formLine}
          onClose={() => setFormLine(null)}
          formType={formLine.formType}
          recordId={formLine.record?.id ?? undefined}
          requisitionLineId={formLine.record?.id ? undefined : formLine.id}
        />
      )}
    </>
  );
}

function Info({ label, value, sub, accent }: { label: string; value?: string; sub?: string; accent?: boolean }) {
  return (
    <div>
      <div style={{ ...DS.label, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: accent ? '#4F46E5' : '#0F172A' }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: 8,
  border: '1px solid #E2E8F0', background: '#FFFFFF', color: '#64748B', cursor: 'pointer',
};
