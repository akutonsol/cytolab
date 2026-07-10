'use client';

import { useState } from 'react';
import { Ban, Plus } from 'lucide-react';
import { message, Modal, Popconfirm } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, SecurityPage, Table, dangerBtn, primaryBtn } from '@/components/security/ui';
import { fmtDateTime, securityApi, type BlockedIp } from '@/lib/security';

const inputCls = 'h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-indigo-400';

export default function BlockedIpsPage() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ['blocked-ips'], queryFn: securityApi.blockedIps });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['blocked-ips'] });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ipAddress: '', reason: '', expiresAt: '', permanent: false });

  const add = useMutation({
    mutationFn: () =>
      securityApi.addBlockedIp({
        ipAddress: form.ipAddress.trim(),
        reason: form.reason.trim(),
        expiresAt: form.permanent || !form.expiresAt ? undefined : new Date(form.expiresAt).toISOString(),
        permanent: form.permanent,
      }),
    onSuccess: () => { message.success('IP blocked'); setOpen(false); setForm({ ipAddress: '', reason: '', expiresAt: '', permanent: false }); invalidate(); },
    onError: (e: any) => message.error(e?.response?.data?.message?.[0] ?? 'Could not block IP'),
  });
  const unblock = useMutation({
    mutationFn: (id: string) => securityApi.unblockIp(id),
    onSuccess: () => { message.success('IP unblocked'); invalidate(); },
    onError: () => message.error('Could not unblock'),
  });

  return (
    <SecurityPage
      title="Blocked IPs"
      subtitle="Denylisted source addresses (manual + auto)"
      icon={<Ban size={20} />}
      back="/security"
      actions={<button className={primaryBtn} onClick={() => setOpen(true)}><Plus size={15} /> Add IP</button>}
    >
      <div className="rounded-2xl border border-slate-200 bg-white">
        <Table<BlockedIp>
          rows={data}
          loading={isLoading}
          rowKey={(b) => b.id}
          empty="No blocked IPs."
          columns={[
            { key: 'ip', header: 'IP', render: (b) => <span className="font-mono text-xs">{b.ipAddress}</span> },
            { key: 'reason', header: 'Reason', render: (b) => b.reason },
            { key: 'at', header: 'Blocked at', render: (b) => <span className="text-slate-500">{fmtDateTime(b.blockedAt)}</span> },
            {
              key: 'exp', header: 'Expires', render: (b) =>
                b.permanent ? <Badge size="sm" tone="danger-strong">Permanent</Badge>
                  : b.expiresAt ? fmtDateTime(b.expiresAt) : '—',
            },
            {
              key: 'act', header: '', render: (b) => (
                <div className="flex justify-end">
                  <Popconfirm title="Unblock this IP?" onConfirm={() => unblock.mutate(b.id)} okText="Unblock">
                    <button className={dangerBtn}>Unblock</button>
                  </Popconfirm>
                </div>
              ),
            },
          ]}
        />
      </div>

      <Modal
        title="Block an IP address"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => add.mutate()}
        okText="Block IP"
        okButtonProps={{ danger: true, disabled: !form.ipAddress.trim() || !form.reason.trim(), loading: add.isPending }}
      >
        <div className="flex flex-col gap-3 py-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">IP address</label>
            <input className={inputCls} placeholder="203.0.113.5" value={form.ipAddress} onChange={(e) => setForm({ ...form, ipAddress: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Reason</label>
            <input className={inputCls} placeholder="Reason for blocking" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Expires (optional)</label>
            <input type="datetime-local" className={inputCls} value={form.expiresAt} disabled={form.permanent} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.permanent} onChange={(e) => setForm({ ...form, permanent: e.target.checked })} />
            Permanent block
          </label>
        </div>
      </Modal>
    </SecurityPage>
  );
}
