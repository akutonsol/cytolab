'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  App as AntdApp, Button, Drawer, Input, InputNumber, Switch, Table, Tag,
} from 'antd';
import { Plus, Receipt, Settings2, Trash2, Zap } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { notify } from '@/lib/notify';

// ── Types (mirror the platform-billing API) ──────────────────────────────────
interface ProfileItem { id?: string; description: string; quantity: number; unitPrice: number } // unitPrice in cents
interface Profile { active: boolean; billingDayOfMonth: number; dueDays: number; autoSend: boolean; currency: string; notes?: string | null; lastRunPeriod?: string | null; lastRunAt?: string | null; items: ProfileItem[] }
interface LabRow { labId: string; labName: string; slug: string; currency: string; isActive: boolean; profile: Profile | null; monthlyAmount: number; latestInvoice: { number: string; total: number; status: string; periodLabel: string } | null; outstandingTotal: number }
interface InvoiceLine { id: string; description: string; quantity: number; unitPrice: number; amount: number }
interface Invoice { id: string; number: string; periodLabel: string; status: string; currency: string; total: number; issueDate: string; dueDate?: string | null; generatedBy: string; lab?: { name: string } | null; lines: InvoiceLine[] }

const money = (cents: number, currency = 'JMD') => `${currency} ${((Number(cents) || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const ordinal = (n: number) => { const s = ['th', 'st', 'nd', 'rd']; const v = n % 100; return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]); };

// Zero-orange status palette (Overdue uses the amber-safe token pair).
const STATUS_UI: Record<string, { bg: string; fg: string }> = {
  Draft: { bg: '#F1F5F9', fg: '#475569' },
  Sent: { bg: '#DBEAFE', fg: '#1D4ED8' },
  Paid: { bg: '#DCFCE7', fg: '#15803D' },
  Overdue: { bg: 'var(--status-warning-soft-100)', fg: 'var(--status-warning-strong)' },
  Void: { bg: '#FEE2E2', fg: '#B91C1C' },
};
function StatusTag({ s }: { s: string }) {
  const u = STATUS_UI[s] ?? STATUS_UI.Draft;
  return <span className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase" style={{ background: u.bg, color: u.fg }}>{s}</span>;
}

export default function LabInvoicingPage() {
  const router = useRouter();
  const { claims } = useAuth();
  const { modal } = AntdApp.useApp();
  const qc = useQueryClient();
  const isSuper = claims?.isSuperRole === true;

  useEffect(() => { if (claims && !isSuper) router.replace('/dashboard'); }, [claims, isSuper, router]);

  const [tab, setTab] = useState<'setup' | 'invoices'>('setup');
  const [configLab, setConfigLab] = useState<LabRow | null>(null);

  const labs = useQuery<LabRow[]>({ queryKey: ['pb-labs'], queryFn: () => api.get('/platform-billing/labs').then((r) => r.data), enabled: isSuper });
  const invoices = useQuery<Invoice[]>({ queryKey: ['pb-invoices'], queryFn: () => api.get('/platform-billing/invoices').then((r) => r.data), enabled: isSuper && tab === 'invoices' });

  const generate = useMutation({
    mutationFn: (labId: string) => api.post(`/platform-billing/generate/${labId}`).then((r) => r.data),
    onSuccess: (d: any) => {
      notify[d?.created ? 'success' : 'info'](d?.created ? `Invoice ${d.invoice.number} generated${d.sent ? ' & sent' : ' (draft)'}.` : `Invoice already exists for this period (${d.invoice.number}).`);
      qc.invalidateQueries({ queryKey: ['pb-labs'] });
      qc.invalidateQueries({ queryKey: ['pb-invoices'] });
    },
    onError: (e: any) => notify.error(e?.response?.data?.message ?? 'Generation failed'),
  });

  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: string }) => api.patch(`/platform-billing/invoices/${v.id}/status`, { status: v.status }).then((r) => r.data),
    onSuccess: (_d, v) => { notify.success(`Invoice marked ${v.status}.`); qc.invalidateQueries({ queryKey: ['pb-invoices'] }); qc.invalidateQueries({ queryKey: ['pb-labs'] }); },
    onError: (e: any) => notify.error(e?.response?.data?.message ?? 'Update failed'),
  });

  const labColumns = [
    { title: 'Lab', dataIndex: 'labName', key: 'lab', render: (_: any, r: LabRow) => (<div><div className="font-semibold text-charcoal-heading">{r.labName}</div><div className="text-[11px] text-slate-500">{r.slug}</div></div>) },
    { title: 'Billing', key: 'billing', render: (_: any, r: LabRow) => r.profile ? (<div className="text-sm text-charcoal-heading">{r.profile.active ? <Tag color="blue">Active</Tag> : <Tag>Paused</Tag>}<div className="text-[11px] text-slate-500">Day {ordinal(r.profile.billingDayOfMonth)} · net {r.profile.dueDays}d · {r.profile.autoSend ? 'auto-send' : 'draft'}</div></div>) : <span className="text-slate-400">Not configured</span> },
    { title: 'Monthly', key: 'monthly', align: 'right' as const, render: (_: any, r: LabRow) => <span className="font-semibold text-charcoal-heading">{r.profile ? money(r.monthlyAmount, r.currency) : '—'}</span> },
    { title: 'Latest invoice', key: 'latest', render: (_: any, r: LabRow) => r.latestInvoice ? (<div className="text-sm"><div className="font-medium text-charcoal-heading">{r.latestInvoice.number}</div><div className="flex items-center gap-2 text-[11px] text-slate-500"><StatusTag s={r.latestInvoice.status} /> {r.latestInvoice.periodLabel}</div></div>) : <span className="text-slate-400">None yet</span> },
    { title: 'Outstanding', key: 'outstanding', align: 'right' as const, render: (_: any, r: LabRow) => r.outstandingTotal > 0 ? <span className="font-semibold" style={{ color: 'var(--status-warning-strong)' }}>{money(r.outstandingTotal, r.currency)}</span> : <span className="text-slate-400">—</span> },
    { title: '', key: 'actions', align: 'right' as const, render: (_: any, r: LabRow) => (<div className="flex justify-end gap-2"><Button size="small" icon={<Settings2 size={14} />} onClick={() => setConfigLab(r)}>Configure</Button><Button size="small" type="primary" icon={<Zap size={14} />} disabled={!r.profile?.items?.length || generate.isPending} loading={generate.isPending && generate.variables === r.labId} onClick={() => generate.mutate(r.labId)}>Generate</Button></div>) },
  ];

  const invoiceColumns = [
    { title: 'Invoice #', dataIndex: 'number', key: 'number', render: (v: string) => <span className="font-mono text-sm font-semibold text-charcoal-heading">{v}</span> },
    { title: 'Lab', key: 'lab', render: (_: any, r: Invoice) => <span className="text-sm text-charcoal-heading">{r.lab?.name ?? '—'}</span> },
    { title: 'Period', dataIndex: 'periodLabel', key: 'period', render: (v: string) => <span className="text-sm text-slate-600">{v}</span> },
    { title: 'Total', key: 'total', align: 'right' as const, render: (_: any, r: Invoice) => <span className="font-semibold text-charcoal-heading">{money(r.total, r.currency)}</span> },
    { title: 'Status', key: 'status', render: (_: any, r: Invoice) => <StatusTag s={r.status} /> },
    { title: 'Issued', key: 'issued', render: (_: any, r: Invoice) => <span className="text-sm text-slate-600">{fmtDate(r.issueDate)}</span> },
    { title: 'Due', key: 'due', render: (_: any, r: Invoice) => <span className="text-sm text-slate-600">{fmtDate(r.dueDate)}</span> },
    { title: '', key: 'actions', align: 'right' as const, render: (_: any, r: Invoice) => (<div className="flex justify-end gap-1">
      {r.status === 'Draft' && <Button size="small" onClick={() => setStatus.mutate({ id: r.id, status: 'Sent' })}>Send</Button>}
      {(r.status === 'Sent' || r.status === 'Overdue') && <Button size="small" type="primary" onClick={() => setStatus.mutate({ id: r.id, status: 'Paid' })}>Mark paid</Button>}
      {r.status !== 'Void' && r.status !== 'Paid' && <Button size="small" danger onClick={() => modal.confirm({ title: `Void ${r.number}?`, okText: 'Void', okButtonProps: { danger: true }, onOk: () => setStatus.mutate({ id: r.id, status: 'Void' }) })}>Void</Button>}
    </div>) },
  ];

  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="flex items-center gap-3 text-[38px] font-bold leading-tight tracking-tight text-charcoal-heading"><Receipt size={30} className="text-indigo-600" /> Lab Invoicing</h1>
        <p className="mt-1.5 text-base text-secondary">Configure recurring platform invoices per lab. Invoices auto-generate on each lab&apos;s billing day and notify the lab.</p>
      </div>

      <div className="mb-6 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
        {(['setup', 'invoices'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-4 py-2 text-sm font-semibold capitalize transition-colors ${tab === t ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{t === 'setup' ? 'Lab Setup' : 'Invoices'}</button>
        ))}
      </div>

      {tab === 'setup' ? (
        <Table rowKey="labId" loading={labs.isLoading} columns={labColumns} dataSource={labs.data ?? []} pagination={{ pageSize: 12, hideOnSinglePage: true }} />
      ) : (
        <Table rowKey="id" loading={invoices.isLoading} columns={invoiceColumns} dataSource={invoices.data ?? []} pagination={{ pageSize: 15, hideOnSinglePage: true }} locale={{ emptyText: 'No invoices generated yet.' }} />
      )}

      <ConfigDrawer lab={configLab} onClose={() => setConfigLab(null)} onSaved={() => { qc.invalidateQueries({ queryKey: ['pb-labs'] }); setConfigLab(null); }} />
    </div>
  );
}

// ── Configure drawer ─────────────────────────────────────────────────────────
function ConfigDrawer({ lab, onClose, onSaved }: { lab: LabRow | null; onClose: () => void; onSaved: () => void }) {
  const [active, setActive] = useState(false);
  const [autoSend, setAutoSend] = useState(true);
  const [day, setDay] = useState(1);
  const [dueDays, setDueDays] = useState(14);
  const [notes, setNotes] = useState('');
  // Line items with unitPrice in DOLLARS for editing.
  const [items, setItems] = useState<Array<{ description: string; quantity: number; unitPrice: number }>>([]);

  useEffect(() => {
    if (!lab) return;
    const p = lab.profile;
    setActive(p?.active ?? false);
    setAutoSend(p?.autoSend ?? true);
    setDay(p?.billingDayOfMonth ?? 1);
    setDueDays(p?.dueDays ?? 14);
    setNotes(p?.notes ?? '');
    // New (unconfigured) labs start with a single blank row — no preset label,
    // so nothing on the form reads as canned/static data.
    setItems((p?.items ?? [{ description: '', quantity: 1, unitPrice: 0 }]).map((it) => ({ description: it.description, quantity: it.quantity, unitPrice: it.unitPrice / 100 })));
  }, [lab]);

  const total = items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);
  const currency = lab?.currency ?? 'JMD';

  const save = useMutation({
    mutationFn: () => api.put(`/platform-billing/profile/${lab!.labId}`, {
      active, autoSend, billingDayOfMonth: day, dueDays, notes: notes || undefined,
      items: items.filter((it) => it.description.trim()).map((it) => ({ description: it.description.trim(), quantity: Math.max(1, Math.round(Number(it.quantity) || 1)), unitPrice: Math.round((Number(it.unitPrice) || 0) * 100) })),
    }),
    onSuccess: () => { notify.success('Billing profile saved.'); onSaved(); },
    onError: (e: any) => notify.error(e?.response?.data?.message ?? 'Save failed'),
  });

  const setItem = (i: number, patch: Partial<{ description: string; quantity: number; unitPrice: number }>) => setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  return (
    <Drawer width={620} open={!!lab} onClose={onClose} title={lab ? `Configure billing — ${lab.labName}` : ''} destroyOnClose
      extra={<Button type="primary" loading={save.isPending} onClick={() => save.mutate()}>Save profile</Button>}>
      {lab && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-sm font-medium text-charcoal-heading"><Switch checked={active} onChange={setActive} /> Active (auto-generate)</label>
            <label className="flex items-center gap-2 text-sm font-medium text-charcoal-heading"><Switch checked={autoSend} onChange={setAutoSend} /> Auto-send on generate</label>
          </div>
          <div className="flex flex-wrap gap-6">
            <div><div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Billing day of month</div><InputNumber min={1} max={28} value={day} onChange={(v) => setDay(Number(v) || 1)} /><div className="mt-1 text-[11px] text-slate-400">Generates on the {ordinal(day)} each month</div></div>
            <div><div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Payment terms (days)</div><InputNumber min={0} max={120} value={dueDays} onChange={(v) => setDueDays(Number(v) || 0)} /><div className="mt-1 text-[11px] text-slate-400">Net {dueDays} days to pay</div></div>
            <div><div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Currency</div><Input value={currency} disabled style={{ width: 90 }} /><div className="mt-1 text-[11px] text-slate-400">From lab profile</div></div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Line items</div>
              <Button size="small" icon={<Plus size={14} />} onClick={() => setItems((p) => [...p, { description: '', quantity: 1, unitPrice: 0 }])}>Add item</Button>
            </div>
            <div className="flex flex-col gap-2">
              {items.map((it, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input placeholder="Description" value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} />
                  <InputNumber min={1} value={it.quantity} onChange={(v) => setItem(i, { quantity: Number(v) || 1 })} style={{ width: 70 }} title="Quantity" />
                  <InputNumber min={0} precision={2} prefix="$" value={it.unitPrice} onChange={(v) => setItem(i, { unitPrice: Number(v) || 0 })} style={{ width: 130 }} title="Unit price" />
                  <Button size="small" danger type="text" icon={<Trash2 size={14} />} onClick={() => setItems((p) => p.filter((_, idx) => idx !== i))} disabled={items.length === 1} />
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-end text-sm">
              <span className="text-slate-500">Monthly total:&nbsp;</span>
              <span className="font-bold text-charcoal-heading">{money(Math.round(total * 100), currency)}</span>
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Notes (internal)</div>
            <Input.TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional note shown on the invoice record" />
          </div>

          {lab.profile?.lastRunAt && <div className="text-[11px] text-slate-400">Last generated: {fmtDate(lab.profile.lastRunAt)} (period {lab.profile.lastRunPeriod})</div>}
        </div>
      )}
    </Drawer>
  );
}
