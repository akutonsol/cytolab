'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { portalApi } from '@/lib/portal-api';
import { PortalLogo } from '@/lib/portal-ui';
import { Input } from '@/components/ui';


export default function ResetRequestPage() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);

  const request = useMutation({
    mutationFn: () => portalApi.post('/portal/auth/reset-request', { email: email.trim() }).then((r) => r.data),
    onSuccess: () => setDone(true),
    onError: () => setDone(true), // anti-enumeration: identical response either way
  });

  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #EEF2F8 0%, #E8ECF5 100%)' }}>
      <div className="w-[440px] max-w-full rounded-[20px] bg-white p-10" style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.1)' }}>
        <PortalLogo />

        <div className="mt-7">
          <h1 className="font-display text-[28px] font-bold tracking-tight text-[#0F172A]">Reset password</h1>
          <p className="mt-1 text-[14px] text-[#64748B]">We&apos;ll email you a link to set a new password.</p>
        </div>

        {done ? (
          <div className="mt-6 flex items-start gap-2 rounded-xl bg-[#F0FDF4] px-3.5 py-3 text-[13px] font-medium text-[#16A34A]" style={{ border: '1px solid #BBF7D0' }}>
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> If an account exists for that email, a reset link has been sent.
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-[#0F172A]">Email</label>
              <Input type="email" autoComplete="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && email.trim() && request.mutate()} />
            </div>
            <button type="button" onClick={() => email.trim() && request.mutate()} disabled={request.isPending || !email.trim()}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#4F46E5] text-[14px] font-semibold text-white transition-[filter] hover:brightness-110 disabled:opacity-60">
              {request.isPending ? <><Loader2 size={16} className="animate-spin" /> Sending…</> : 'Send reset link'}
            </button>
          </div>
        )}

        <Link href="/portal/login" className="mt-6 flex items-center justify-center gap-1.5 text-[13px] font-semibold text-[#4F46E5] hover:underline">
          <ArrowLeft size={14} /> Back to sign in
        </Link>
      </div>
    </div>
  );
}
