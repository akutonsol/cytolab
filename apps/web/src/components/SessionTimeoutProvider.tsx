'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ShieldCheck, LogOut, Clock } from 'lucide-react';
import { api, refreshSession } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { flushAllDrafts, saveReturnTo, clearReturnTo, setSessionEndReason } from '@/lib/session-drafts';

// Idle policy mirrors the server (SESSION_IDLE_MINUTES = 15). Overridable at build
// time for testing (e.g. NEXT_PUBLIC_SESSION_IDLE_MINUTES=0.5 → a 30s window).
const IDLE_MINUTES = Number(process.env.NEXT_PUBLIC_SESSION_IDLE_MINUTES ?? 15);
const WARN_SECONDS = Number(process.env.NEXT_PUBLIC_SESSION_WARN_SECONDS ?? 120);
const IDLE_MS = Math.max(5_000, IDLE_MINUTES * 60_000);
const WARN_LEAD_MS = Math.min(WARN_SECONDS * 1_000, IDLE_MS - 1_000);
const WARN_LEAD_SECONDS = Math.round(WARN_LEAD_MS / 1_000);

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'wheel', 'touchstart'] as const;

const fmt = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;

/**
 * Watches for user inactivity and, ~2 min before the 15-min idle timeout, raises a
 * full-screen countdown lightbox letting the user keep their session alive. When
 * the warning appears (and again at the moment of timeout) every open form's
 * in-progress values are flushed to localStorage drafts, and the current path is
 * stashed — so after re-login the user lands back where they were with an offer to
 * restore their unsaved work. Mounted inside the authenticated app layout only.
 */
export function SessionTimeoutProvider() {
  const router = useRouter();
  const clear = useAuthStore((s) => s.clear);

  const lastActivity = useRef(Date.now());
  const warningRef = useRef(false);
  const busy = useRef(false);
  const [warning, setWarning] = useState(false);
  const [remaining, setRemaining] = useState(WARN_LEAD_SECONDS);

  const setWarn = useCallback((v: boolean) => { warningRef.current = v; setWarning(v); }, []);

  const doTimeout = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    flushAllDrafts();
    saveReturnTo(window.location.pathname + window.location.search);
    setSessionEndReason('session_timeout'); // survives the layout's redirect race
    try { await api.post('/auth/logout'); } catch { /* cookies may already be dead */ }
    clear();
    router.replace('/login');
  }, [clear, router]);

  const continueSession = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const ok = await refreshSession();
    busy.current = false;
    if (ok) {
      lastActivity.current = Date.now();
      setWarn(false);
    } else {
      // Session already gone on the server — treat as a timeout (work is drafted).
      doTimeout();
    }
  }, [doTimeout, setWarn]);

  const logoutNow = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    flushAllDrafts();       // keep their work restorable
    clearReturnTo();        // but an explicit logout shouldn't auto-bounce them back
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    clear();
    router.replace('/login');
  }, [clear, router]);

  // Track genuine user activity (ignored once the warning is up, so moving the
  // mouse can't silently dismiss the prompt — the user must choose).
  useEffect(() => {
    const bump = () => { if (!warningRef.current) lastActivity.current = Date.now(); };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    return () => ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, bump));
  }, []);

  // 1s ticker: enter the warning near the idle limit, count down, time out at 0.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (busy.current) return;
      const untilTimeout = IDLE_MS - (Date.now() - lastActivity.current);
      if (!warningRef.current) {
        if (untilTimeout <= WARN_LEAD_MS) {
          flushAllDrafts(); // snapshot immediately, before they even react
          setRemaining(Math.max(0, Math.ceil(untilTimeout / 1000)));
          setWarn(true);
        }
      } else {
        const secs = Math.ceil(untilTimeout / 1000);
        setRemaining(secs);
        if (secs <= 0) doTimeout();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [doTimeout, setWarn]);

  const fraction = Math.max(0, Math.min(1, remaining / WARN_LEAD_SECONDS));
  const urgent = remaining <= 30;
  const accent = urgent ? '#FB7185' : '#4F46E5'; // rose when urgent (zero-orange safe)
  const R = 52;
  const C = 2 * Math.PI * R;

  return (
    <AnimatePresence>
      {warning && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 4000,
            display: 'grid',
            placeItems: 'center',
            padding: 20,
            background: 'rgba(15, 23, 42, 0.62)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
          }}
          role="alertdialog"
          aria-modal="true"
          aria-label="Session expiring"
        >
          <motion.div
            initial={{ scale: 0.94, y: 12, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.96, y: 8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            style={{
              width: 'min(440px, 100%)',
              background: '#fff',
              borderRadius: 24,
              padding: '36px 32px 28px',
              textAlign: 'center',
              boxShadow: '0 30px 80px rgba(15,23,42,0.35)',
            }}
          >
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 12px', borderRadius: 999, background: '#EEF2FF', color: '#4338CA', fontSize: 12, fontWeight: 700, letterSpacing: 0.3 }}>
              <Clock size={13} /> SESSION SECURITY
            </div>

            {/* Countdown ring */}
            <div style={{ position: 'relative', width: 132, height: 132, margin: '22px auto 8px' }}>
              <svg width={132} height={132} viewBox="0 0 132 132" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx={66} cy={66} r={R} fill="none" stroke="#EEF2FF" strokeWidth={10} />
                <motion.circle
                  cx={66} cy={66} r={R} fill="none" stroke={accent} strokeWidth={10} strokeLinecap="round"
                  strokeDasharray={C}
                  animate={{ strokeDashoffset: C * (1 - fraction), stroke: accent }}
                  transition={{ duration: 0.9, ease: 'linear' }}
                />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                <span style={{ fontSize: 30, fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{fmt(remaining)}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', marginTop: 2 }}>remaining</span>
              </div>
            </div>

            <h2 style={{ fontSize: 21, fontWeight: 800, color: '#0F172A', margin: '10px 0 6px' }}>Still there?</h2>
            <p style={{ fontSize: 14, lineHeight: 1.5, color: '#475569', margin: '0 auto 22px', maxWidth: 340 }}>
              You&apos;ve been inactive, so we&apos;ll sign you out to keep your lab secure. We&apos;ve
              <strong style={{ color: '#4338CA' }}> already saved your open work</strong> — continue to pick up right where you left off.
            </p>

            <button
              type="button"
              onClick={continueSession}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, width: '100%', border: 'none', background: '#4F46E5', color: '#fff', fontSize: 15, fontWeight: 700, padding: '13px 16px', borderRadius: 13, cursor: 'pointer', boxShadow: '0 10px 24px rgba(79,70,229,0.32)' }}
            >
              <ShieldCheck size={18} /> Continue session
            </button>
            <button
              type="button"
              onClick={logoutNow}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', marginTop: 10, border: 'none', background: 'transparent', color: '#64748B', fontSize: 14, fontWeight: 600, padding: '9px 16px', borderRadius: 11, cursor: 'pointer' }}
            >
              <LogOut size={16} /> Log out now
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
