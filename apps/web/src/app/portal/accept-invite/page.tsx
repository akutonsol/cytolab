'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { portalApi } from '@/lib/portal-api';
import { PortalLogo } from '@/lib/portal-ui';
import { Input } from '@/components/ui';


function AcceptInviteInner() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const accept = useMutation({
    mutationFn: () => portalApi.post('/portal/auth/accept-invite', { token, password }).then((r) => r.data),
    onSuccess: () => router.push('/portal/login?activated=1'),
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Could not set your password. The link may have expired.'),
  });

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = !!token && password.length >= 8 && confirm === password && !accept.isPending;
  const submit = () => { setErr(null); if (canSubmit) accept.mutate(); };

  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #EEF2F8 0%, #E8ECF5 100%)' }}>
      <div className="w-[440px] max-w-full rounded-[20px] bg-white p-10" style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.1)' }}>
        <PortalLogo />

        <div className="mt-7">
          <h1 className="font-display text-[28px] font-bold tracking-tight text-[#0F172A]">Set your password</h1>
          <p className="mt-1 text-[14px] text-[#64748B]">Complete your account setup</p>
        </div>

        {!token && (
          <div className="mt-5 rounded-xl bg-[#FEF2F2] px-3.5 py-3 text-[13px] font-medium text-[#DC2626]" style={{ border: '1px solid #FECACA' }}>
            Missing invite token. Please use the link from your invitation email.
          </div>
        )}

        <div className="mt-6 flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-[#0F172A]">Password</label>
            <div className="relative">
              <Input className="pr-11" type={showPw ? 'text' : 'password'} placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#0F172A]">
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {tooShort && <div className="mt-1 text-[12px] text-[#DC2626]">Must be at least 8 characters.</div>}
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-[#0F172A]">Confirm password</label>
            <Input type={showPw ? 'text' : 'password'} placeholder="Re-enter password" value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
            {mismatch && <div className="mt-1 text-[12px] text-[#DC2626]">Passwords do not match.</div>}
          </div>

          <button type="button" onClick={submit} disabled={!canSubmit}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#4F46E5] text-[14px] font-semibold text-white transition-[filter] hover:brightness-110 disabled:opacity-60">
            {accept.isPending ? <><Loader2 size={16} className="animate-spin" /> Setting up…</> : 'Set Password'}
          </button>

          {err && (
            <div className="rounded-xl bg-[#FEF2F2] px-3.5 py-3 text-[13px] font-medium text-[#DC2626]" style={{ border: '1px solid #FECACA' }}>{err}</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInviteInner />
    </Suspense>
  );
}
