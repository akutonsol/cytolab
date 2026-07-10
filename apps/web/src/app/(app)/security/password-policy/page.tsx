'use client';

import { useEffect, useState } from 'react';
import { KeySquare } from 'lucide-react';
import { message, Switch } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, SecurityPage } from '@/components/security/ui';
import { securityApi, type PasswordPolicy } from '@/lib/security';
import { notify } from '@/lib/notify';

const numInput = 'h-9 w-24 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-indigo-400';

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-50 px-5 py-4 last:border-0">
      <div>
        <div className="text-sm font-medium text-slate-800">{label}</div>
        {hint && <div className="text-xs text-slate-500">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

export default function PasswordPolicyPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['password-policy'], queryFn: securityApi.passwordPolicy });
  const [form, setForm] = useState<PasswordPolicy | null>(null);
  useEffect(() => { if (data) setForm(data); }, [data]);

  const save = useMutation({
    mutationFn: (body: PasswordPolicy) => securityApi.updatePasswordPolicy(body),
    onSuccess: () => { notify.success('Password policy saved'); qc.invalidateQueries({ queryKey: ['password-policy'] }); },
    onError: () => notify.error('Could not save policy'),
  });

  if (!form) return <SecurityPage title="Password Policy" icon={<KeySquare size={20} />} back="/security"><div className="py-10 text-center text-slate-500">Loading…</div></SecurityPage>;

  const set = (patch: Partial<PasswordPolicy>) => setForm({ ...form, ...patch });

  return (
    <SecurityPage
      title="Password Policy"
      subtitle="Complexity, expiry, and lockout rules applied to every account"
      icon={<KeySquare size={20} />}
      back="/security"
      actions={
        <button
          onClick={() => save.mutate(form)}
          disabled={save.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {save.isPending ? 'Saving…' : 'Save policy'}
        </button>
      }
    >
      <div className="max-w-2xl">
        <Card title="Complexity">
          <Row label="Minimum length" hint="Characters required (min 8)">
            <input type="number" min={8} max={128} className={numInput} value={form.minLength} onChange={(e) => set({ minLength: Number(e.target.value) })} />
          </Row>
          <Row label="Require uppercase"><Switch checked={form.requireUppercase} onChange={(v) => set({ requireUppercase: v })} /></Row>
          <Row label="Require lowercase"><Switch checked={form.requireLowercase} onChange={(v) => set({ requireLowercase: v })} /></Row>
          <Row label="Require number"><Switch checked={form.requireNumber} onChange={(v) => set({ requireNumber: v })} /></Row>
          <Row label="Require special character"><Switch checked={form.requireSpecial} onChange={(v) => set({ requireSpecial: v })} /></Row>
        </Card>

        <div className="mt-4">
          <Card title="Lifecycle & lockout">
            <Row label="Password expiry" hint="Days until a password must change (0 = never)">
              <input type="number" min={0} max={3650} className={numInput} value={form.expiryDays} onChange={(e) => set({ expiryDays: Number(e.target.value) })} />
            </Row>
            <Row label="Max failed attempts" hint="Failures before an account locks">
              <input type="number" min={3} max={50} className={numInput} value={form.maxFailedAttempts} onChange={(e) => set({ maxFailedAttempts: Number(e.target.value) })} />
            </Row>
            <Row label="Password history depth" hint="Previous passwords that can't be reused">
              <input type="number" min={1} max={50} className={numInput} value={form.historyDepth} onChange={(e) => set({ historyDepth: Number(e.target.value) })} />
            </Row>
          </Card>
        </div>
      </div>
    </SecurityPage>
  );
}
