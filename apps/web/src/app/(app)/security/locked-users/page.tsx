'use client';

import { Lock } from 'lucide-react';
import { message, Popconfirm } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, SecurityPage, Table, dangerBtn, ghostBtn } from '@/components/security/ui';
import { fmtDateTime, fullName, securityApi, type LockedUser } from '@/lib/security';

export default function LockedUsersPage() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ['locked-users'], queryFn: securityApi.lockedUsers });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['locked-users'] });

  const unlock = useMutation({
    mutationFn: (id: string) => securityApi.unlockUser(id),
    onSuccess: () => { message.success('Account unlocked'); invalidate(); },
    onError: () => message.error('Could not unlock'),
  });
  const forceReset = useMutation({
    mutationFn: (id: string) => securityApi.forceReset(id),
    onSuccess: () => message.success('Password reset forced — user must set a new password'),
    onError: () => message.error('Could not force reset'),
  });

  return (
    <SecurityPage title="Locked Accounts" subtitle="Accounts locked by failed logins or an administrator" icon={<Lock size={20} />} back="/security">
      <div className="rounded-2xl border border-slate-200 bg-white">
        <Table<LockedUser>
          rows={data}
          loading={isLoading}
          rowKey={(l) => l.id}
          empty="No locked accounts."
          columns={[
            { key: 'user', header: 'User', render: (l) => <span className="font-medium text-slate-800">{fullName(l.user)}</span> },
            { key: 'email', header: 'Email', render: (l) => l.user?.email ?? '—' },
            { key: 'locked', header: 'Locked at', render: (l) => <span className="text-slate-500">{fmtDateTime(l.lockedAt)}</span> },
            { key: 'reason', header: 'Reason', render: (l) => l.reason },
            {
              key: 'auto', header: 'Auto-unlock', render: (l) =>
                l.autoUnlockAt
                  ? <span className="text-slate-500">{fmtDateTime(l.autoUnlockAt)}</span>
                  : <Badge size="sm" tone="danger-strong">Admin required</Badge>,
            },
            {
              key: 'act', header: '', render: (l) => (
                <div className="flex justify-end gap-2">
                  <Popconfirm title="Unlock this account?" onConfirm={() => unlock.mutate(l.userId)} okText="Unlock">
                    <button className={ghostBtn}>Unlock</button>
                  </Popconfirm>
                  <Popconfirm title="Force a password reset on next login?" onConfirm={() => forceReset.mutate(l.userId)} okText="Force reset" okButtonProps={{ danger: true }}>
                    <button className={dangerBtn}>Force reset</button>
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
