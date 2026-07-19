'use client';

import { useEffect, useRef, useState } from 'react';
import { useGuide } from '@/lib/guide/useGuide';
import { useGuideStore } from '@/lib/guide/store';
import { fetchGuidePref } from '@/lib/guide/sync';
import { Spotlight } from './Spotlight';
import { CoachPanel } from './CoachPanel';

/**
 * App-wide guided-assistance overlay. Mounted once in the app shell; renders the
 * spotlight (when the current step's target is on-screen) and the coach panel.
 * On mount it hydrates the enable flag from the server preference (so the setting
 * follows the user across devices), falling back to the localStorage cache.
 */
export function GuideOverlay() {
  const [mounted, setMounted] = useState(false);
  const hydrated = useRef(false);
  const guide = useGuide();

  useEffect(() => {
    setMounted(true);
    fetchGuidePref()
      .then((server) => {
        if (!hydrated.current) {
          hydrated.current = true;
          if (server !== useGuideStore.getState().enabled) useGuideStore.getState().setEnabled(server);
        }
      })
      .catch(() => {}); // offline / no auth — keep the localStorage cache
  }, []);

  if (!mounted || !guide.active) return null;
  return (
    <>
      {guide.step?.target && guide.onRoute && <Spotlight target={guide.step.target} />}
      <CoachPanel guide={guide} />
    </>
  );
}
