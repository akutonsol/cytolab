'use client';

import { api } from '@/lib/api';
import { useGuideStore } from './store';

/**
 * Server-backed enable flag so guided assistance follows the user across devices
 * (localStorage still caches it for instant first paint). Progress (signals) and
 * dismissals stay per-device.
 */

/** Read the server preference (defaults false). */
export const fetchGuidePref = (): Promise<boolean> =>
  api.get('/users/me/preferences').then((r) => !!r.data?.guidedAssistanceEnabled);

/** Set enabled locally AND persist to the server (best-effort). */
export const setGuideEnabled = (enabled: boolean): void => {
  useGuideStore.getState().setEnabled(enabled);
  api.patch('/users/me/preferences', { guidedAssistanceEnabled: enabled }).catch(() => {});
};
