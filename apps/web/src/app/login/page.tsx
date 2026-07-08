'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import {
  ArrowRight, CheckCircle2, Clock, Eye, EyeOff, HelpCircle, LineChart, List, Lock,
  ShieldCheck, User, Users,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { api, loadClaims } from '@/lib/api';
import { useAuth } from '@/lib/auth';

// WebGL specimen vial — the same premium PBR render used on the landing hero.
// Browser-only (Three.js needs the DOM/GPU), so SSR is off. `bare` skips the
// light backdrop planes so it floats over the dark-blue login background.
const HeroVial = dynamic(() => import('@/components/landing/HeroVial'), {
  ssr: false,
  loading: () => <div style={{ width: '100%', height: '100%' }} />,
});

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

// A wide central "tube" pill that frames the vial, flanked by two slimmer pills.
// Each pill breathes gently (staggered) to give the backdrop subtle life.
function PillBackdrop() {
  return (
    <div className="pointer-events-none absolute left-[49%] top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-6 xl:flex" aria-hidden>
      <div className="login-pill w-[88px] rounded-full bg-white/10" style={{ height: 520, marginTop: 40, animationDelay: '0s' }} />
      <div className="login-pill login-pill-center w-[210px] rounded-full bg-white/10" style={{ height: 760, animationDelay: '0.6s' }} />
      <div className="login-pill w-[88px] rounded-full bg-white/10" style={{ height: 480, marginTop: 90, animationDelay: '1.2s' }} />
    </div>
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

  const inputCls = 'block w-full rounded-2xl border-2 border-dashed border-slate-200 bg-white py-5 pl-14 pr-14 font-medium text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-solid focus:border-[#1d35d1] focus:ring-2 focus:ring-[#1d35d1]/10';

  return (
    <div className="relative min-h-screen w-full overflow-hidden text-white" style={{ background: 'var(--login-bg, #1435d1)' }}>
      {/* Background layers */}
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
        <div className="login-dots absolute inset-0 opacity-40" />
        <div className="absolute -left-52 -top-52 h-[800px] w-[800px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)' }} />
        <div className="absolute -bottom-72 -right-24 h-[1000px] w-[1000px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 70%)' }} />
        <PillBackdrop />
      </div>

      {/* Specimen vial — premium WebGL render (Three.js PBR glass + blood sim). */}
      <div className="pointer-events-none absolute inset-0 z-[5] hidden xl:block" aria-hidden>
        <div className="absolute left-[49%] top-1/2 h-[760px] w-[560px] -translate-x-1/2 -translate-y-1/2">
          <HeroVial bare tilt={0} spin ripple={false} contain fill={1.22} richBlood />
        </div>
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-7 sm:px-12">
          <div className="flex items-center gap-4">
            <img src="/cyto-icon-white.png" alt="CYTOLAB" className="h-16 w-16" />
            <div className="leading-tight">
              <div className="text-3xl font-extrabold uppercase tracking-tight">CYTOLAB</div>
              <div className="mt-0.5 text-[15px] font-medium leading-snug text-white/85">Cytology &amp; Pathology<br />Laboratory System</div>
            </div>
          </div>
          <a href="mailto:support@cytolab.local" className="flex items-center gap-2 text-sm font-semibold transition-opacity hover:opacity-80">
            <HelpCircle size={20} /> <span className="hidden sm:inline">Need help?</span>
          </a>
        </header>

        {/* Main */}
        <main className="grid flex-1 grid-cols-12 items-center gap-8 px-6 pb-12 sm:px-12">
          {/* Left: marketing */}
          <div className="col-span-12 flex flex-col justify-center lg:col-span-7">
            <h1 className="mb-7 text-6xl font-black leading-[0.95] tracking-tighter sm:text-7xl xl:text-[88px]">
              Don&rsquo;t Just Test.<br />Optimize.
            </h1>
            <p className="mb-10 max-w-xl text-lg leading-relaxed text-blue-50/90">
              A next-generation diagnostics experience that transforms lab results into actionable
              intelligence. By combining clinical data with AI-driven analysis, we deliver precise
              insights that support proactive, personalized health optimization.
            </p>
            <div className="space-y-7">
              {FEATURES.map((f) => (
                <div key={f.label} className="flex items-start gap-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-white/20 bg-white/10 text-white"><f.Icon size={20} /></span>
                  <div>
                    <div className="text-lg font-bold">{f.label}</div>
                    <div className="text-sm text-blue-100/70">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: login card */}
          <div className="col-span-12 flex justify-center lg:col-span-5 lg:justify-end">
            <div className="w-full max-w-[560px] rounded-[40px] bg-white p-8 text-slate-900 shadow-2xl sm:p-12">
              <div className="mb-8 text-center">
                <h2 className="mb-2 text-3xl font-extrabold sm:text-4xl">{mfa ? 'Two-Factor Verification' : 'Welcome Back'}</h2>
                <p className="font-medium text-slate-500">
                  {mfa ? 'Enter the verification code to continue' : 'Sign in to continue to your account'}
                </p>
              </div>

              {sessionExpired && !mfa && (
                <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-[13px] font-semibold text-amber-800">
                  Your session has expired. Please sign in again.
                </div>
              )}
              {formError && (
                <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-center text-[13px] font-semibold text-red-700">
                  {formError}
                </div>
              )}

              {!mfa ? (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label htmlFor="login-email" className="ml-1 block text-sm font-bold text-slate-700">Email or Username</label>
                    <div className="relative">
                      <User size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        id="login-email" type="email" autoComplete="email" placeholder="Enter your email or username"
                        value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={onKey}
                        className={`${inputCls} ${errors.email ? '!border-red-300' : ''}`}
                      />
                      <List size={20} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300" />
                    </div>
                    {errors.email && <div className="ml-1 text-[12px] text-red-500">{errors.email}</div>}
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="login-password" className="ml-1 block text-sm font-bold text-slate-700">Password</label>
                    <div className="relative">
                      <Lock size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        id="login-password" type={showPw ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password"
                        value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={onKey}
                        className={`${inputCls} ${errors.password ? '!border-red-300' : ''}`}
                      />
                      <button type="button" aria-label={showPw ? 'Hide password' : 'Show password'} onClick={() => setShowPw((v) => !v)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {showPw ? <EyeOff size={20} /> : <Eye size={20} />}
                      </button>
                    </div>
                    {errors.password && <div className="ml-1 text-[12px] text-red-500">{errors.password}</div>}
                  </div>

                  <div className="flex items-center justify-between px-1">
                    <label className="flex cursor-pointer items-center gap-3 text-sm font-medium text-slate-500">
                      <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
                        className="h-5 w-5 rounded border-slate-300 accent-[#1d35d1]" />
                      Remember me
                    </label>
                    <a href="mailto:support@cytolab.local" className="text-sm font-bold text-[#1d35d1] hover:underline">Forgot password?</a>
                  </div>

                  <button
                    type="button" onClick={submit} disabled={login.isPending}
                    className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[#1d35d1] py-4 text-lg font-bold text-white shadow-xl shadow-[#1d35d1]/20 transition-all hover:bg-[#1628a8] active:scale-[0.98] disabled:opacity-60"
                  >
                    {login.isPending ? 'Signing in…' : 'Sign In'} <ArrowRight size={20} />
                  </button>

                  <p className="text-center font-medium text-slate-500">
                    Don&rsquo;t have an account? <a href="mailto:support@cytolab.local" className="font-bold text-[#1d35d1] hover:underline">Contact your administrator.</a>
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  <p className="text-center text-sm font-medium text-slate-500">
                    {mfa.methods.totpEnabled
                      ? 'Enter the 6-digit code from your authenticator app.'
                      : 'Enter the verification code sent to your email.'}
                    {mfa.methods.backupCodesRemaining > 0 && ' You can also use a backup code.'}
                  </p>
                  <input
                    id="mfa-code" inputMode="text" autoComplete="one-time-code" placeholder="Verification code"
                    value={code} onChange={(e) => setCode(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') challenge.mutate(); }}
                    className="block w-full rounded-2xl border-2 border-dashed border-slate-200 bg-white px-4 py-5 text-center text-[16px] tracking-[0.3em] text-slate-800 outline-none focus:border-solid focus:border-[#1d35d1] focus:ring-2 focus:ring-[#1d35d1]/10"
                  />
                  <button
                    type="button" onClick={() => { setFormError(null); challenge.mutate(); }} disabled={challenge.isPending || !code.trim()}
                    className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[#1d35d1] py-4 text-lg font-bold text-white shadow-xl shadow-[#1d35d1]/20 transition-all hover:bg-[#1628a8] active:scale-[0.98] disabled:opacity-60"
                  >
                    {challenge.isPending ? 'Verifying…' : 'Verify'} <ArrowRight size={20} />
                  </button>
                  {mfa.methods.emailEnabled && (
                    <button type="button" onClick={() => { setFormError(null); sendEmailCode.mutate(); }} disabled={sendEmailCode.isPending}
                      className="w-full text-sm font-bold text-[#1d35d1] underline-offset-2 hover:underline">
                      {sendEmailCode.isPending ? 'Sending…' : 'Send a code to my email'}
                    </button>
                  )}
                  <button type="button" onClick={() => { setMfa(null); setCode(''); setFormError(null); }}
                    className="w-full text-sm font-medium text-slate-500 hover:text-slate-800">← Back to sign in</button>
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Footer trust bar */}
        <footer className="px-6 py-8 sm:px-12">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-8 border-t border-white/10 pt-8">
            {TRUST.map((t) => (
              <div key={t.label} className="flex min-w-[200px] items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/20 bg-white/10 text-white"><t.Icon size={20} /></span>
                <div className="leading-tight">
                  <div className="text-base font-bold">{t.label}</div>
                  <div className="text-sm text-blue-100/80">{t.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </footer>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-[120] rounded-xl bg-emerald-600 px-4 py-3 text-[13px] font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
