'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { api, loadClaims } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface LoginValues {
  email: string;
  password: string;
}

interface MfaState {
  mfaToken: string;
  methods: { totpEnabled: boolean; emailEnabled: boolean; backupCodesRemaining: number };
}

export default function LoginPage() {
  const router = useRouter();
  const { isAuthed, hydrated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [mfa, setMfa] = useState<MfaState | null>(null);
  const [code, setCode] = useState('');
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const notify = (type: 'ok' | 'err', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3500); };

  // Persistent banner when the app bounced us here from an expired/invalid session.
  const [sessionExpired, setSessionExpired] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('reason') === 'session_expired') setSessionExpired(true);
  }, []);

  // Already logged in → leave the login page.
  useEffect(() => {
    if (hydrated && isAuthed) router.replace('/dashboard');
  }, [hydrated, isAuthed, router]);

  const finish = async () => {
    await loadClaims();
    notify('ok', 'Welcome back');
    router.replace('/dashboard');
  };

  const login = useMutation({
    mutationFn: async (values: LoginValues) => {
      const res = await api.post('/auth/login', values);
      return res.data as
        | { status: 'OK' }
        | { status: 'MFA_REQUIRED'; mfaToken: string; methods: MfaState['methods'] };
    },
    onSuccess: async (data) => {
      if (data.status === 'MFA_REQUIRED') {
        setMfa({ mfaToken: data.mfaToken, methods: data.methods });
        return;
      }
      await finish();
    },
    onError: (err: any) => notify('err', err?.response?.data?.message ?? 'Login failed'),
  });

  const challenge = useMutation({
    mutationFn: async () => {
      const res = await api.post('/auth/mfa/challenge', { mfaToken: mfa!.mfaToken, code: code.trim() });
      return res.data;
    },
    onSuccess: finish,
    onError: (err: any) => notify('err', err?.response?.data?.message ?? 'Invalid code'),
  });

  const sendEmailCode = useMutation({
    // Public endpoint: the mfaToken (body) authorises the OTP send during login.
    mutationFn: async () => api.post('/auth/mfa/challenge/email', { mfaToken: mfa!.mfaToken }),
    onSuccess: () => notify('ok', 'Code sent to your email'),
    onError: () => notify('err', 'Could not send code'),
  });

  // Submit handler robust to browser autofill (reads live DOM value on click).
  const submit = () => {
    const domVal = (id: string) =>
      (typeof document !== 'undefined' ? (document.getElementById(id) as HTMLInputElement | null)?.value : '') ?? '';
    const e = (email || domVal('login-email') || '').trim();
    const p = password || domVal('login-password') || '';
    if (!e || !p) {
      setErrors({ ...(!e ? { email: 'Enter a valid email' } : {}), ...(!p ? { password: 'Enter your password' } : {}) });
      return;
    }
    setErrors({});
    login.mutate({ email: e, password: p });
  };

  const onKey = (ev: React.KeyboardEvent) => { if (ev.key === 'Enter') submit(); };
  const input = 'h-11 w-full rounded-xl border bg-white px-3.5 font-body-sm text-body-sm text-on-surface outline-none transition-colors focus:border-primary';

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-[380px] rounded-2xl border border-outline-variant/30 bg-white p-8 shadow-[0_20px_40px_rgba(0,0,0,0.06)]">
        <div className="mb-6 text-center">
          <div className="font-headline-md text-headline-md text-charcoal-heading">Cytolab</div>
          <div className="font-body-sm text-body-sm text-secondary">
            {mfa ? 'Two-factor verification' : 'Sign in to your lab'}
          </div>
        </div>

        {sessionExpired && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-[13px] font-medium text-amber-800">
            Your session has expired, please log in again.
          </div>
        )}

        {!mfa ? (
          <div className="flex flex-col gap-4">
            <div>
              <label htmlFor="login-email" className="mb-1.5 block font-label-md text-label-md text-on-surface">Email</label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="you@lab.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={onKey}
                className={`${input} ${errors.email ? 'border-error' : 'border-outline-variant/40'}`}
              />
              {errors.email && <div className="mt-1 font-body-sm text-body-sm text-error">{errors.email}</div>}
            </div>
            <div>
              <label htmlFor="login-password" className="mb-1.5 block font-label-md text-label-md text-on-surface">Password</label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={onKey}
                className={`${input} ${errors.password ? 'border-error' : 'border-outline-variant/40'}`}
              />
              {errors.password && <div className="mt-1 font-body-sm text-body-sm text-error">{errors.password}</div>}
            </div>
            <button
              type="button"
              onClick={submit}
              disabled={login.isPending}
              className="btn-primary mt-1 w-full justify-center"
              style={{ opacity: login.isPending ? 0.6 : 1 }}
            >
              {login.isPending ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="font-body-sm text-body-sm text-secondary">
              {mfa.methods.totpEnabled
                ? 'Enter the 6-digit code from your authenticator app.'
                : 'Enter the verification code sent to your email.'}
              {mfa.methods.backupCodesRemaining > 0 && ' You can also use a backup code.'}
            </p>
            <input
              id="mfa-code"
              inputMode="text"
              autoComplete="one-time-code"
              placeholder="Verification code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') challenge.mutate(); }}
              className={`${input} border-outline-variant/40 tracking-widest`}
            />
            <button
              type="button"
              onClick={() => challenge.mutate()}
              disabled={challenge.isPending || !code.trim()}
              className="btn-primary w-full justify-center"
              style={{ opacity: challenge.isPending || !code.trim() ? 0.6 : 1 }}
            >
              {challenge.isPending ? 'Verifying…' : 'Verify'}
            </button>
            {mfa.methods.emailEnabled && (
              <button
                type="button"
                onClick={() => sendEmailCode.mutate()}
                disabled={sendEmailCode.isPending}
                className="font-label-md text-label-md text-primary underline-offset-2 hover:underline"
              >
                {sendEmailCode.isPending ? 'Sending…' : 'Send a code to my email'}
              </button>
            )}
            <button
              type="button"
              onClick={() => { setMfa(null); setCode(''); }}
              className="font-body-sm text-body-sm text-secondary hover:text-on-surface"
            >
              ← Back to sign in
            </button>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-[120] rounded-xl px-4 py-3 font-label-md text-label-md text-white shadow-lg"
          style={{ background: toast.type === 'ok' ? '#16A34A' : '#DC2626' }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
