'use client';

import { Smartphone } from 'lucide-react';
import { message, Popconfirm } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SecurityPage, Table, dangerBtn } from '@/components/security/ui';
import { fmtDateTime, fullName, relTime, securityApi, type TrustedDevice } from '@/lib/security';

export default function TrustedDevicesPage() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ['trusted-devices'], queryFn: () => securityApi.trustedDevices() });

  const revoke = useMutation({
    mutationFn: (id: string) => securityApi.revokeTrustedDevice(id),
    onSuccess: () => { message.success('Device revoked'); qc.invalidateQueries({ queryKey: ['trusted-devices'] }); },
    onError: () => message.error('Could not revoke device'),
  });

  return (
    <SecurityPage title="Trusted Devices" subtitle="Devices that skip MFA after a successful challenge" icon={<Smartphone size={20} />} back="/security">
      <div className="rounded-2xl border border-slate-200 bg-white">
        <Table<TrustedDevice>
          rows={data}
          loading={isLoading}
          rowKey={(d) => d.id}
          empty="No trusted devices."
          columns={[
            { key: 'user', header: 'User', render: (d) => <span className="font-medium text-slate-800">{fullName(d.user)}</span> },
            { key: 'device', header: 'Device', render: (d) => d.deviceName ?? ([d.browser, d.os].filter(Boolean).join(' · ') || '—') },
            { key: 'ip', header: 'IP', render: (d) => <span className="font-mono text-xs">{d.ipAddress ?? '—'}</span> },
            { key: 'trusted', header: 'Trusted', render: (d) => <span className="text-slate-500">{fmtDateTime(d.trustedAt)}</span> },
            { key: 'used', header: 'Last used', render: (d) => relTime(d.lastUsedAt) },
            {
              key: 'act', header: '', render: (d) => (
                <div className="flex justify-end">
                  <Popconfirm title="Revoke this device's trust?" onConfirm={() => revoke.mutate(d.id)} okText="Revoke" okButtonProps={{ danger: true }}>
                    <button className={dangerBtn}>Revoke</button>
                  </Popconfirm>
                </div>
              ),
            },
          ]}
        />
      </div>
    </SecurityPage>
  );
}
