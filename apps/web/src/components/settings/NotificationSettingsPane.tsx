'use client';

import { useEffect, useState } from 'react';
import { Bell, ClipboardList, CreditCard, Save, Settings2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui';
import { notify } from '@/lib/notify';

interface NotificationPrefs {
  recordsInApp: boolean; recordsEmail: boolean;
  requestsInApp: boolean; requestsEmail: boolean;
  paymentsInApp: boolean; paymentsEmail: boolean;
  systemInApp: boolean; systemEmail: boolean;
}

// Categories mirror the notification inbox grouping. Each maps to an in-app +
// an email toggle key on the prefs object.
const CATEGORIES: { label: string; help: string; icon: typeof Bell; inApp: keyof NotificationPrefs; email: keyof NotificationPrefs }[] = [
  { label: 'Records', help: 'Submissions, results and approvals', icon: ClipboardList, inApp: 'recordsInApp', email: 'recordsEmail' },
  { label: 'Requests', help: 'Change requests and replies', icon: Bell, inApp: 'requestsInApp', email: 'requestsEmail' },
  { label: 'Payments', help: 'Payments received and billing', icon: CreditCard, inApp: 'paymentsInApp', email: 'paymentsEmail' },
  { label: 'System', help: 'Appointments and system alerts', icon: Settings2, inApp: 'systemInApp', email: 'systemEmail' },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className="relative h-6 w-11 shrink-0 rounded-full transition-colors" style={{ background: checked ? '#4F46E5' : '#c7c4d8' }}>
      <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all" style={{ left: checked ? 22 : 2 }} />
    </button>
  );
}

/**
 * Settings > General > Notification. Per-user delivery preferences: for each
 * category, choose whether it appears in the in-app inbox and/or is emailed.
 */
export function NotificationSettingsPane() {
  const qc = useQueryClient();
  const { data } = useQuery<NotificationPrefs>({ queryKey: ['notification-prefs'], queryFn: () => api.get('/notifications/preferences').then((r) => r.data) });

  const [form, setForm] = useState<NotificationPrefs | null>(null);
  useEffect(() => { if (data) setForm(data); }, [data]);

  const save = useMutation({
    mutationFn: () => api.put('/notifications/preferences', form),
    onSuccess: () => { notify.success('Notification preferences saved'); qc.invalidateQueries({ queryKey: ['notification-prefs'] }); },
    onError: (e: any) => notify.error(e?.response?.data?.message ?? 'Save failed'),
  });

  const set = (key: keyof NotificationPrefs, v: boolean) => setForm((f) => (f ? { ...f, [key]: v } : f));

  return (
    <div className="max-w-[640px]">
      <h3 className="font-headline-sm text-headline-sm text-charcoal-heading">Notification</h3>
      <p className="mt-1 font-body-sm text-body-sm text-secondary">
        Choose how you’re notified for each category. In-app notifications appear in your bell inbox; email sends a copy to your address.
      </p>

      <div className="mt-6 overflow-hidden rounded-2xl border border-outline-variant">
        <div className="flex items-center gap-4 border-b border-outline-variant bg-surface-container-low px-4 py-2.5">
          <div className="flex-1 font-label-sm text-label-sm uppercase tracking-wider text-outline">Category</div>
          <div className="w-16 text-center font-label-sm text-label-sm uppercase tracking-wider text-outline">In-app</div>
          <div className="w-16 text-center font-label-sm text-label-sm uppercase tracking-wider text-outline">Email</div>
        </div>
        {CATEGORIES.map((cat, i) => {
          const Icon = cat.icon;
          return (
            <div key={cat.label} className={`flex items-center gap-4 px-4 py-3.5 ${i > 0 ? 'border-t border-outline-variant' : ''}`}>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><Icon size={17} /></span>
              <div className="flex-1 min-w-0">
                <div className="font-body-sm text-body-sm font-medium text-on-surface">{cat.label}</div>
                <div className="font-label-sm text-label-sm text-secondary">{cat.help}</div>
              </div>
              <div className="flex w-16 justify-center">
                <Toggle checked={!!form?.[cat.inApp]} onChange={(v) => set(cat.inApp, v)} />
              </div>
              <div className="flex w-16 justify-center">
                <Toggle checked={!!form?.[cat.email]} onChange={(v) => set(cat.email, v)} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5">
        <Button loading={save.isPending} disabled={save.isPending || !form} onClick={() => save.mutate()} className="flex items-center gap-2">
          <Save size={14} /> Save preferences
        </Button>
      </div>
    </div>
  );
}
