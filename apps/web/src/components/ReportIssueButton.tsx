'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { LifeBuoy, X } from 'lucide-react';
import { App as AntdApp } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { IconAction } from '@/components/ui';

// Staff-facing "Report an Issue" surface. Any authenticated user can submit a
// support ticket here — it POSTs /system/support/tickets with their auth token
// (the endpoint no longer requires system:health). No management access.
const CATEGORIES = ['BUG', 'FEATURE_REQUEST', 'DATA_ISSUE', 'ACCESS', 'BILLING', 'TRAINING', 'MAINTENANCE', 'OTHER'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const cat = (c: string) => c.replace('_', ' ');

const inputCls = 'h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-3.5 text-sm text-[#0F172A] outline-none focus:border-[#4F46E5]';
const labelCls = 'mb-1.5 block text-[13px] font-semibold text-[#334155]';
const btnPrimary = 'inline-flex items-center gap-2 rounded-xl bg-[#4F46E5] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#4338CA] disabled:opacity-50';
const btnGhost = 'inline-flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm font-semibold text-[#475569] hover:bg-[#F8FAFC]';

export function ReportIssueButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        aria-label="Report an issue"
        title="Report an issue"
        onClick={() => setOpen(true)}
        className={className ?? 'grid h-10 w-10 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-gray-500 transition-colors hover:bg-gray-100'}
      >
        <LifeBuoy size={18} />
      </button>
      {open && <ReportIssueModal onClose={() => setOpen(false)} />}
    </>
  );
}

function ReportIssueModal({ onClose }: { onClose: () => void }) {
  const { message } = AntdApp.useApp();
  const [v, setV] = useState({ title: '', category: 'BUG', priority: 'MEDIUM', description: '' });
  const m = useMutation({
    mutationFn: () =>
      api.post('/system/support/tickets', {
        title: v.title.trim(),
        category: v.category,
        priority: v.priority,
        description: v.description.trim(),
      }),
    onSuccess: (r) => {
      message.success(`Ticket ${(r.data as { ticketNumber?: string })?.ticketNumber ?? ''} submitted — our team will follow up.`);
      onClose();
    },
    onError: () => message.error('Could not submit your ticket — please try again.'),
  });

  // Portal to <body>: the trigger lives in the frosted top nav, whose
  // backdrop-filter creates a containing block for position:fixed descendants —
  // rendered inline, the modal would anchor to the nav (pinned to the top) rather
  // than the viewport. The portal escapes that so it centers on screen.
  if (typeof document === 'undefined') return null;
  return createPortal(
    <>
      <div className="fixed inset-0 z-[70] bg-black/30" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-[71] max-h-[90vh] w-full max-w-[520px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[18px] font-bold text-[#0F172A]"><LifeBuoy size={18} className="text-[#4F46E5]" /> Report an Issue</h2>
          <IconAction icon={<X size={18} />} tone="strong" size="lg" shape="circle" className="hover:bg-[#F1F5F9]" onClick={onClose} aria-label="Close" />
        </div>
        <p className="mb-5 text-[13px] text-[#475569]">Describe the problem or request and the support team will pick it up.</p>

        <div className="flex flex-col gap-4">
          <div>
            <label className={labelCls}>Title</label>
            <input className={inputCls} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="Brief summary of the issue" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Category</label>
              <select className={inputCls} value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{cat(c)}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Priority</label>
              <select className={inputCls} value={v.priority} onChange={(e) => setV({ ...v, priority: e.target.value })}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea className={`${inputCls} h-28 py-2`} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} placeholder="What happened? Steps to reproduce, expected vs actual…" />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button onClick={onClose} className={btnGhost}>Cancel</button>
          <button disabled={!v.title.trim() || !v.description.trim() || m.isPending} onClick={() => m.mutate()} className={btnPrimary}>Submit Ticket</button>
        </div>
      </div>
    </>,
    document.body,
  );
}
