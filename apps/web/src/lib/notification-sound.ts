'use client';

/**
 * Notification sound — a per-DEVICE preference (not an account setting), so it lives in
 * localStorage rather than the server notification-preferences. The chime is synthesized with
 * the Web Audio API: no asset, no network request, works offline, and satisfies the strict CSP.
 *
 * Everything here fails soft — a feedback sound must never throw or block the app.
 */

const KEY = 'cytolab:notif-sound';

/** Whether the new-notification chime is enabled on this device. Defaults ON. */
export function isNotifSoundEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(KEY) !== 'off';
}

export function setNotifSoundEnabled(on: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, on ? 'on' : 'off');
}

// One shared AudioContext, created lazily on first play (a user gesture has usually happened
// by then — login/navigation). Reused so we don't leak contexts.
let ctx: AudioContext | null = null;

/**
 * Play a short, gentle two-note chime. Silent (and never throws) when sound is disabled, the
 * Web Audio API is unavailable, or the context can't resume yet (no user gesture). Pass
 * `force` to ignore the enabled flag — used by the settings "preview" toggle.
 */
export function playNotificationSound(force = false): void {
  if (typeof window === 'undefined') return;
  if (!force && !isNotifSoundEnabled()) return;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = ctx ?? new AC();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    // Two soft sine notes — a quick rising interval that reads as "new item".
    const notes = [{ f: 660, at: 0 }, { f: 880, at: 0.12 }];
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = n.f;
      const start = now + n.at;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.24);
    }
  } catch {
    /* never let a feedback sound break the app */
  }
}
