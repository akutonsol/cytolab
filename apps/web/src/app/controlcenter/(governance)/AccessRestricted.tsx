'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, LayoutGrid, ShieldCheck, UserRoundCog } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';

// Shown when authentication SUCCEEDED but the account is not authorized for Control
// Center. Deliberately not an error state: no warning colors, no alert banners, no
// lock iconography — the premium indigo language, making clear the sign-in worked and
// only permission is missing. This is UX only; server-side guards still enforce access.
export default function AccessRestricted() {
  const router = useRouter();
  const clear = useAuthStore((s) => s.clear);
  const [signingOut, setSigningOut] = useState(false);

  // "Sign in with another account": end the shared staff session (same logout the app
  // uses — best-effort cookie clear + local claims clear), then return to CC sign-in.
  const switchAccount = () => {
    setSigningOut(true);
    api.post('/auth/logout').catch(() => {}).finally(() => { clear(); router.replace('/controlcenter/login'); });
  };

  return (
    <div className="grid min-h-screen place-items-center bg-surface-alt px-4 py-10">
      <div className="w-full max-w-[460px]">
        <div className="rounded-2xl border border-card bg-surface p-8 shadow-sm">
          <div className="flex flex-col items-center text-center">
            <span className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-primary"><ShieldCheck size={26} /></span>
            <h1 className="text-xl font-bold leading-snug text-charcoal-heading">
              You&rsquo;re signed in, but this account doesn&rsquo;t have access to Control Center.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-text-secondary">
              Control Center is available only to authorized system administrators and governance operators.
            </p>
          </div>

          <div className="mt-7 space-y-3">
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-white shadow-lg shadow-primary/20 transition-[background-color,transform] duration-fast ease-standard hover:bg-primary-hover active:scale-[0.98]"
            >
              <LayoutGrid size={17} /> Go to Main Application <ArrowRight size={16} />
            </button>
            <button
              type="button"
              onClick={switchAccount}
              disabled={signingOut}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-card bg-surface py-3 text-sm font-bold text-text-secondary transition-colors duration-fast ease-standard hover:bg-surface-alt hover:text-text disabled:opacity-60"
            >
              <UserRoundCog size={17} /> {signingOut ? 'Signing out…' : 'Sign in with another account'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
