'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import {
  ArrowRight, CheckCircle2, Clock, Eye, EyeOff, HelpCircle, LineChart, List, Lock,
  Microscope, Shield, ShieldCheck, User, Users,
} from 'lucide-react';
import { api, loadClaims } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { BloodVial } from '@/components/BloodVial';

interface LoginValues { email: string; password: string }
interface MfaState {
  mfaToken: string;
  methods: { totpEnabled: boolean; emailEnabled: boolean; backupCodesRemaining: number };
}

const FEATURES = [
  { Icon: LineChart, label: 'Smarter Insights', desc: 'AI-powered analytics for accurate, data-driven decisions.' },
  { Icon: ShieldCheck, label: 'Secure & Compliant', desc: 'Built with enterprise-grade security and HIPAA compliance.' },
  { Icon: Users, label: 'Collaborate Effortlessly', desc: 'Seamless communication between labs, clinicians, and clients.' },
];

const TRUST = [
  { Icon: ShieldCheck, label: 'HIPAA Compliant', desc: 'Your data is safe and secure' },
  { Icon: Lock, label: 'Enterprise Security', desc: '256-bit encryption & secure access' },
  { Icon: CheckCircle2, label: 'Trusted by Labs', desc: 'Powering diagnostics worldwide' },
  { Icon: Clock, label: '99.9% Uptime', desc: 'Reliable. Always.' },
];

// Decorative pill-column backdrop for the left panel (lighter indigo washes).
function PillBackdrop() {
  const cols = [
    { x: 250, ys: [40, 190, 360, 520] },
    { x: 340, ys: [120, 300, 470] },
    { x: 430, ys: [70, 250, 430, 600] },
  ];
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 560 720" preserveAspectRatio="xMidYMid slice" aria-hidden>
      {cols.map((c) =>
        c.ys.map((y) => (
          <rect key={`${c.x}-${y}`} x={c.x} y={y} width="58" height="120" rx="29" fill="rgba(255,255,255,0.15)" />
        )),
      )}
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { isAuthed, hydrated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [mfa, setMfa] = useState<MfaState | null>(null);
  const [code, setCode] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const notify = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  // Persistent banner when the app bounced us here from an expired/invalid session.
  const [sessionExpired, setSessionExpired] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('reason') === 'session_expired') setSessionExpired(true);
  }, []);

  // Already logged in → leave the login page.
  useEffect(() => { if (hydrated && isAuthed) router.replace('/dashboard'); }, [hydrated, isAuthed, router]);

  const finish = async () => { await loadClaims(); router.replace('/dashboard'); };

  const login = useMutation({
    mutationFn: async (values: LoginValues) => {
      const res = await api.post('/auth/login', values);
      return res.data as
        | { status: 'OK' }
        | { status: 'MFA_REQUIRED'; mfaToken: string; methods: MfaState['methods'] };
    },
    onSuccess: async (data) => {
      if (data.status === 'MFA_REQUIRED') { setSessionExpired(false); setMfa({ mfaToken: data.mfaToken, methods: data.methods }); return; }
      await finish();
    },
    onError: (err: any) => setFormError(err?.response?.data?.message ?? 'Invalid username or password.'),
  });

  const challenge = useMutation({
    mutationFn: async () => (await api.post('/auth/mfa/challenge', { mfaToken: mfa!.mfaToken, code: code.trim() })).data,
    onSuccess: finish,
    onError: (err: any) => setFormError(err?.response?.data?.message ?? 'Invalid code'),
  });

  const sendEmailCode = useMutation({
    // Public endpoint: the mfaToken (body) authorises the OTP send during login.
    mutationFn: async () => api.post('/auth/mfa/challenge/email', { mfaToken: mfa!.mfaToken }),
    onSuccess: () => notify('Code sent to your email'),
    onError: () => setFormError('Could not send code'),
  });

  // Submit handler robust to browser autofill (reads live DOM value on click).
  const submit = () => {
    const domVal = (id: string) =>
      (typeof document !== 'undefined' ? (document.getElementById(id) as HTMLInputElement | null)?.value : '') ?? '';
    const e = (email || domVal('login-email') || '').trim();
    const p = password || domVal('login-password') || '';
    if (!e || !p) {
      setErrors({ ...(!e ? { email: 'Enter your email or username' } : {}), ...(!p ? { password: 'Enter your password' } : {}) });
      return;
    }
    setErrors({}); setFormError(null);
    login.mutate({ email: e, password: p });
  };
  const onKey = (ev: React.KeyboardEvent) => { if (ev.key === 'Enter') submit(); };

  const fieldWrap = 'relative';
  const inputCls = 'h-[52px] w-full rounded-xl border border-gray-200 bg-white pl-11 pr-11 text-[15px] text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

  return (
    <div className="flex min-h-screen w-full bg-white">
      {/* ── LEFT PANEL (marketing) ─────────────────────────────────────────── */}
      <aside className="relative hidden flex-col justify-between overflow-hidden px-12 py-10 lg:flex lg:w-[55%]" style={{ background: '#3730A3' }}>
        <div className="absolute inset-0 overflow-hidden"><PillBackdrop /></div>
        <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(120deg,#3730A3 0%,#3730A3 55%,rgba(55,48,163,0.3) 100%)' }} />

        {/* Top row: logo + need help */}
        <div className="relative z-10 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/20 text-white"><Microscope size={24} /></span>
            <div className="leading-tight">
              <div className="text-[20px] font-extrabold tracking-tight text-white">CYTOLAB</div>
              <div className="text-[12px] text-white/70">Cytology &amp; Pathology<br />Laboratory System</div>
            </div>
          </div>
          <a href="mailto:support@cytolab.local" className="flex items-center gap-1.5 text-[14px] text-white/70 transition-colors hover:text-white">
            <HelpCircle size={16} /> Need help?
          </a>
        </div>

        {/* Center content */}
        <div className="relative z-10 max-w-xl">
          <h1 className="text-6xl font-black leading-[1.05] tracking-tight text-white">Don&rsquo;t Just Test.<br />Optimize.</h1>
          <p className="mt-6 max-w-md text-sm leading-relaxed text-white/70">
            A next-generation diagnostics experience that transforms lab results into actionable
            intelligence. By combining clinical data with AI-driven analysis, we deliver precise
            insights that support proactive, personalized health optimization.
          </p>
          <div className="mt-9 flex flex-col gap-5">
            {FEATURES.map((f) => (
              <div key={f.label} className="flex items-start gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/20 text-white"><f.Icon size={18} /></span>
                <div>
                  <div className="text-[15px] font-bold text-white">{f.label}</div>
                  <div className="max-w-xs text-[13px] leading-relaxed text-white/70">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Spinning blood vial — center-right, slightly overlapping the right panel. */}
        <div className="absolute right-0 top-1/2 z-20 -translate-y-1/2 translate-x-1/4">
          <BloodVial className="h-auto w-48 animate-vial-spin drop-shadow-2xl" />
        </div>

        {/* Trust bar */}
        <div className="relative z-10 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-white/15 pt-6 sm:grid-cols-4">
          {TRUST.map((t, i) => (
            <div key={t.label} className={`flex items-center gap-3 ${i > 0 ? 'sm:border-l sm:border-white/15 sm:pl-6' : ''}`}>
              <t.Icon size={20} className="shrink-0 text-white" />
              <div className="leading-tight">
                <div className="text-[13px] font-bold text-white">{t.label}</div>
                <div className="text-[11px] text-white/60">{t.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* ── RIGHT PANEL (form) ─────────────────────────────────────────────── */}
      <main className="flex w-full items-center justify-center px-6 py-10 lg:w-[45%]">
        <div className="animate-fade-slide-in w-full max-w-[420px]">
          <div className="mb-8 text-center">
            <h2 className="text-3xl font-bold text-gray-900">{mfa ? 'Two-Factor Verification' : 'Welcome Back'}</h2>
            <p className="mt-2 text-sm text-gray-500">
              {mfa ? 'Enter the verification code to continue' : 'Sign in to continue to your account'}
            </p>
          </div>

          {sessionExpired && !mfa && (
            <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-[13px] font-medium text-amber-800">
              Your session has expired. Please sign in again.
            </div>
          )}
          {formError && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-[13px] font-medium text-red-700">
              {formError}
            </div>
          )}

          {!mfa ? (
            <div className="flex flex-col gap-5">
              <div>
                <label htmlFor="login-email" className="mb-1.5 block text-[13px] font-semibold text-gray-700">Email or Username</label>
                <div className={fieldWrap}>
                  <User size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    id="login-email" type="email" autoComplete="email" placeholder="Enter your email or username"
                    value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={onKey}
                    className={`${inputCls} ${errors.email ? '!border-red-300' : ''}`}
                  />
                  <List size={18} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-300" />
                </div>
                {errors.email && <div className="mt-1 text-[12px] text-red-500">{errors.email}</div>}
              </div>

              <div>
                <label htmlFor="login-password" className="mb-1.5 block text-[13px] font-semibold text-gray-700">Password</label>
                <div className={fieldWrap}>
                  <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    id="login-password" type={showPw ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password"
                    value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={onKey}
                    className={`${inputCls} ${errors.password ? '!border-red-300' : ''}`}
                  />
                  <button type="button" aria-label={showPw ? 'Hide password' : 'Show password'} onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {errors.password && <div className="mt-1 text-[12px] text-red-500">{errors.password}</div>}
              </div>

              <div className="flex items-center justify-between">
                <label className="flex cursor-pointer items-center gap-2 text-[13px] text-gray-600">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 accent-indigo-600" />
                  Remember me
                </label>
                <a href="mailto:support@cytolab.local" className="text-[13px] font-semibold text-indigo-600 hover:text-indigo-700">Forgot password?</a>
              </div>

              <button
                type="button" onClick={submit} disabled={login.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-4 text-base font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
              >
                {login.isPending ? 'Signing in…' : 'Sign In'} <ArrowRight size={18} />
              </button>

              <p className="text-center text-[13px] text-gray-500">
                Don&rsquo;t have an account? <span className="font-semibold text-indigo-600">Contact your administrator.</span>
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <p className="text-center text-[13px] text-gray-500">
                {mfa.methods.totpEnabled
                  ? 'Enter the 6-digit code from your authenticator app.'
                  : 'Enter the verification code sent to your email.'}
                {mfa.methods.backupCodesRemaining > 0 && ' You can also use a backup code.'}
              </p>
              <input
                id="mfa-code" inputMode="text" autoComplete="one-time-code" placeholder="Verification code"
                value={code} onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') challenge.mutate(); }}
                className="h-[52px] w-full rounded-xl border border-gray-200 bg-white px-4 text-center text-[16px] tracking-[0.3em] text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
              <button
                type="button" onClick={() => { setFormError(null); challenge.mutate(); }} disabled={challenge.isPending || !code.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-4 text-base font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
              >
                {challenge.isPending ? 'Verifying…' : 'Verify'} <ArrowRight size={18} />
              </button>
              {mfa.methods.emailEnabled && (
                <button type="button" onClick={() => { setFormError(null); sendEmailCode.mutate(); }} disabled={sendEmailCode.isPending}
                  className="text-[13px] font-semibold text-indigo-600 underline-offset-2 hover:underline">
                  {sendEmailCode.isPending ? 'Sending…' : 'Send a code to my email'}
                </button>
              )}
              <button type="button" onClick={() => { setMfa(null); setCode(''); setFormError(null); }}
                className="text-[13px] text-gray-500 hover:text-gray-800">← Back to sign in</button>
            </div>
          )}
        </div>
      </main>

      {toast && (
        <div className="fixed bottom-6 right-6 z-[120] rounded-xl bg-emerald-600 px-4 py-3 text-[13px] font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
