'use client';

import { KeyRound } from 'lucide-react';
import { message, Popconfirm, Switch } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BoolPill, SecurityPage, Table, dangerBtn } from '@/components/security/ui';
import { relTime, securityApi, type MfaUser } from '@/lib/security';
import { notify } from '@/lib/notify';

export default function MfaManagementPage() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ['mfa-users'], queryFn: securityApi.mfaUsers });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['mfa-users'] });

  const require = useMutation({
    mutationFn: ({ id, required }: { id: string; required: boolean }) => securityApi.requireMfa(id, required),
    onSuccess: () => { notify.success('Updated'); invalidate(); },
    onError: () => notify.error('Could not update'),
  });
  const reset = useMutation({
    mutationFn: (id: string) => securityApi.resetMfa(id),
    onSuccess: () => { notify.success('MFA reset — user must re-enrol'); invalidate(); },
    onError: (e: any) => notify.error(e?.response?.data?.message ?? 'Could not reset MFA'),
  });

  return (
    <SecurityPage title="MFA Management" subtitle="Two-factor status and enforcement per user" icon={<KeyRound size={20} />} back="/security">
      <div className="rounded-2xl border border-slate-200 bg-white">
        <Table<MfaUser>
          rows={data}
          loading={isLoading}
          rowKey={(u) => u.id}
          empty="No users."
          columns={[
            { key: 'user', header: 'User', render: (u) => <span className="font-medium text-slate-800">{u.firstName} {u.lastName}</span> },
            { key: 'email', header: 'Email', render: (u) => u.email },
            { key: 'totp', header: 'TOTP', render: (u) => <BoolPill on={u.totpEnabled} onText="Enabled" offText="Off" /> },
            { key: 'email-mfa', header: 'Email MFA', render: (u) => <BoolPill on={u.emailEnabled} onText="Enabled" offText="Off" /> },
            { key: 'last', header: 'Last login', render: (u) => relTime(u.lastLoginAt) },
            {
              key: 'req', header: 'Require MFA', render: (u) => (
                <Switch size="small" checked={u.mfaRequired} onChange={(v) => require.mutate({ id: u.id, required: v })} />
              ),
            },
            {
              key: 'act', header: '', render: (u) => (
                <div className="flex justify-end">
                  <Popconfirm title="Reset this user's MFA? They will need to re-enrol." onConfirm={() => reset.mutate(u.id)} okText="Reset MFA" okButtonProps={{ danger: true }}>
                    <button className={dangerBtn} disabled={!u.totpEnabled && !u.emailEnabled}>Reset MFA</button>
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
