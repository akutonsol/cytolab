'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { portalApi } from '@/lib/portal-api';
import { usePortalAuthStore } from '@/lib/portal-auth';
import { PortalLogo } from '@/lib/portal-ui';
import { Input } from '@/components/ui';


function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const justActivated = params.get('activated') === '1';
  const setTokens = usePortalAuthStore((s) => s.setTokens);
  const token = usePortalAuthStore((s) => s.token);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (token) router.replace('/portal'); }, [token, router]);

  const login = useMutation({
    mutationFn: () => portalApi.post('/portal/auth/login', { email: email.trim(), password }).then((r) => r.data),
    onSuccess: (data) => { setTokens(data.accessToken, data.refreshToken); router.push('/portal'); },
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Sign in failed. Check your details and try again.'),
  });

  const submit = () => { setErr(null); if (email.trim() && password) login.mutate(); };

  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #EEF2F8 0%, #E8ECF5 100%)' }}>
      <div className="w-[440px] max-w-full rounded-[20px] bg-white p-10" style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.1)' }}>
        <PortalLogo />

        <div className="mt-7">
          <h1 className="font-display text-[28px] font-bold tracking-tight text-[#0F172A]">Welcome back</h1>
          <p className="mt-1 text-[14px] text-[#64748B]">Sign in to view your lab results</p>
        </div>

        {justActivated && (
          <div className="mt-5 flex items-center gap-2 rounded-xl bg-[#F0FDF4] px-3.5 py-3 text-[13px] font-semibold text-[#16A34A]" style={{ border: '1px solid #BBF7D0' }}>
            <CheckCircle2 size={16} /> Password set — you can sign in now.
          </div>
        )}

        <div className="mt-6 flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-[#0F172A]">Email</label>
            <Input type="email" autoComplete="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-[#0F172A]">Password</label>
            <div className="relative">
              <Input className="pr-11" type={showPw ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
              <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#0F172A]">
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <Link href="/portal/reset-request" className="text-[13px] font-semibold text-[#4F46E5] hover:underline">Forgot password?</Link>
          </div>

          <button type="button" onClick={submit} disabled={login.isPending || !email.trim() || !password}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#4F46E5] text-[14px] font-semibold text-white transition-[filter] hover:brightness-110 disabled:opacity-60">
            {login.isPending ? <><Loader2 size={16} className="animate-spin" /> Signing in…</> : 'Sign In'}
          </button>

          {err && (
            <div className="rounded-xl bg-[#FEF2F2] px-3.5 py-3 text-[13px] font-medium text-[#DC2626]" style={{ border: '1px solid #FECACA' }}>{err}</div>
          )}
        </div>

        <p className="mt-7 text-center text-[13px] text-[#94A3B8]">This portal is for authorized clients only.</p>
      </div>
    </div>
  );
}

export default function PortalLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
