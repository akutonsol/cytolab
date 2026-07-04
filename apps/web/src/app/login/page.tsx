'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth, useAuthStore } from '@/lib/auth';

interface LoginValues {
  email: string;
  password: string;
}

export default function LoginPage() {
  const router = useRouter();
  const { isAuthed, hydrated } = useAuth();
  const setTokens = useAuthStore((s) => s.setTokens);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const notify = (type: 'ok' | 'err', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3000); };

  // Already logged in → leave the login page.
  useEffect(() => {
    if (hydrated && isAuthed) router.replace('/dashboard');
  }, [hydrated, isAuthed, router]);

  const login = useMutation({
    mutationFn: async (values: LoginValues) => {
      const res = await api.post('/auth/login', values);
      return res.data as { accessToken: string; refreshToken: string };
    },
    onSuccess: (data) => {
      setTokens(data.accessToken, data.refreshToken);
      notify('ok', 'Welcome back');
      router.replace('/dashboard');
    },
    onError: (err: any) => {
      notify('err', err?.response?.data?.message ?? 'Login failed');
    },
  });

  // Submit handler that is ROBUST to browser autofill / password managers.
  // Autofill sets the DOM input value WITHOUT firing React's onChange, so the
  // controlled state stays empty. We read the live DOM value SYNCHRONOUSLY on
  // click — before any re-render — falling back to React state for the normal
  // typed case. A click always submits what the user actually sees.
  const submit = () => {
    const domVal = (id: string) =>
      (typeof document !== 'undefined'
        ? (document.getElementById(id) as HTMLInputElement | null)?.value
        : '') ?? '';
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
          <div className="font-body-sm text-body-sm text-secondary">Sign in to your lab</div>
        </div>

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
