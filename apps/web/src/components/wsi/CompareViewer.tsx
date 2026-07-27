'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { WSIViewer } from '@/components/WSIViewer';
import type { DigitalSlide } from '@/lib/wsi';

/**
 * P5-6 Part B — side-by-side comparison of exactly TWO slides from the SAME record, with optional
 * synchronized NAVIGATION.
 *
 * Each side is fully independent: its own slide id, its own authenticated delivery session, its own
 * OpenSeadragon instance, its own lifecycle (a non-viewable side shows the truthful empty state), and its
 * own annotation context. Selection is drawn ONLY from the record-scoped set passed in `slides` — there is
 * no free-text / cross-record / cross-tenant / arbitrary-global-id path into this component.
 *
 * "Sync navigation" mirrors pan/zoom between the two viewports using NORMALIZED image-fraction coordinates
 * and a fit-relative zoom, so it works even when the two slides differ in pixel dimensions or MPP. It is
 * navigation convenience ONLY — it does NOT align, register, or co-register the images, and it implies no
 * spatial or diagnostic correspondence between what the two panels show.
 */

interface OsdViewport {
  getCenter: (current?: boolean) => { x: number; y: number };
  getZoom: (current?: boolean) => number;
  getHomeZoom: () => number;
  panTo: (point: { x: number; y: number }, immediately?: boolean) => void;
  zoomTo: (zoom: number, refPoint?: unknown, immediately?: boolean) => void;
}
interface OsdViewer {
  viewport: OsdViewport;
  world: { getItemCount: () => number; getItemAt: (i: number) => { getBounds: (current?: boolean) => { x: number; y: number; width: number; height: number } } };
  addHandler: (name: string, cb: () => void) => void;
  removeHandler: (name: string, cb: () => void) => void;
}

interface Props {
  primaryId: string;
  compareId: string;
  slides: DigitalSlide[];
  onChangePrimary: (id: string) => void;
  onChangeCompare: (id: string) => void;
  onExit: () => void;
}

function useSlideDetail(id: string) {
  return useQuery<DigitalSlide>({
    queryKey: ['wsi-slide', id],
    queryFn: () => api.get(`/wsi/${id}`).then((r) => r.data),
  });
}

export function CompareViewer({ primaryId, compareId, slides, onChangePrimary, onChangeCompare, onExit }: Props) {
  const left = useSlideDetail(primaryId);
  const right = useSlideDetail(compareId);

  const leftV = useRef<OsdViewer | null>(null);
  const rightV = useRef<OsdViewer | null>(null);
  const [ready, setReady] = useState(0); // bump to re-run the wiring effect when either viewer (dis)appears
  const [sync, setSync] = useState(true);
  const syncRef = useRef(sync);
  const applyingRef = useRef(false);
  useEffect(() => { syncRef.current = sync; }, [sync]);

  const onLeftReady = useCallback((v: unknown | null) => { leftV.current = v as OsdViewer | null; setReady((n) => n + 1); }, []);
  const onRightReady = useCallback((v: unknown | null) => { rightV.current = v as OsdViewer | null; setReady((n) => n + 1); }, []);

  // Mirror `from`'s normalized center + fit-relative zoom onto `to`. Navigation only; no registration.
  const mirror = useCallback((from: OsdViewer | null, to: OsdViewer | null) => {
    if (!syncRef.current || applyingRef.current || !from || !to) return;
    if (from.world.getItemCount() === 0 || to.world.getItemCount() === 0) return;
    const bf = from.world.getItemAt(0).getBounds(true);
    const cf = from.viewport.getCenter(true);
    const fracX = (cf.x - bf.x) / bf.width;
    const fracY = (cf.y - bf.y) / bf.height;
    const relZoom = from.viewport.getZoom(true) / from.viewport.getHomeZoom();
    const bt = to.world.getItemAt(0).getBounds(true);
    const target = to.viewport.getCenter(true); // a fresh Point we may mutate
    target.x = bt.x + fracX * bt.width;
    target.y = bt.y + fracY * bt.height;
    applyingRef.current = true; // guard the echo: `to`'s resulting events must not mirror back
    to.viewport.zoomTo(relZoom * to.viewport.getHomeZoom(), undefined, true);
    to.viewport.panTo(target, true);
    requestAnimationFrame(() => { applyingRef.current = false; });
  }, []);

  // Attach viewport-change handlers whenever both viewers are live; clean up on teardown/change.
  useEffect(() => {
    const l = leftV.current;
    const r = rightV.current;
    if (!l || !r) return;
    const lh = () => mirror(l, r);
    const rh = () => mirror(r, l);
    l.addHandler('update-viewport', lh);
    r.addHandler('update-viewport', rh);
    if (syncRef.current) mirror(l, r); // align once on wire-up
    return () => { l.removeHandler('update-viewport', lh); r.removeHandler('update-viewport', rh); };
  }, [ready, mirror]);

  // When sync is toggled on, snap the compare side to the primary immediately.
  useEffect(() => { if (sync) mirror(leftV.current, rightV.current); }, [sync, mirror]);

  const options = (excludeId: string) => slides.filter((s) => s.id !== excludeId);

  // NOTE: a plain element-returning function (NOT a nested component) — a nested component would take a new
  // identity each render and remount both OpenSeadragon instances, destroying the sync wiring every render.
  const renderPanel = (side: 'left' | 'right', slideId: string, detail: DigitalSlide | undefined, value: string, onChange: (id: string) => void) => (
    <div data-testid="wsi-compare-panel" data-side={side} data-slide-id={slideId} className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-900 px-3 py-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{side === 'left' ? 'A' : 'B'}</span>
        <select
          data-testid="wsi-compare-select"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 truncate rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[12px] font-semibold text-slate-100"
        >
          {options(side === 'left' ? compareId : primaryId).map((s) => (
            <option key={s.id} value={s.id}>{(s.stain ?? s.tileSourceType ?? s.format ?? 'Slide') + ` · ${s.lifecycle.state}`}</option>
          ))}
        </select>
      </div>
      <div className="min-h-0 flex-1">
        <WSIViewer
          slideId={slideId}
          annotations={detail?.annotations ?? []}
          readOnly
          onViewerReady={side === 'left' ? onLeftReady : onRightReady}
        />
      </div>
    </div>
  );

  return (
    <div data-testid="wsi-compare" className="flex h-full w-full flex-col bg-black">
      {/* Compare controls */}
      <div className="flex items-center gap-3 border-b border-slate-800 bg-slate-950 px-3 py-2">
        <span className="text-[12px] font-bold text-slate-200">Compare</span>
        <label className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-300">
          <input data-testid="wsi-compare-sync" type="checkbox" checked={sync} onChange={(e) => setSync(e.target.checked)} className="accent-[#4F46E5]" />
          Sync navigation
        </label>
        {/* Truthfulness: sync is positional convenience, NOT spatial co-registration. */}
        <span data-testid="wsi-compare-sync-note" className="text-[11px] text-slate-500">
          Positional navigation only — the panels are not spatially aligned or co-registered.
        </span>
        <button data-testid="wsi-compare-exit" onClick={onExit} className="ml-auto flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-slate-200 hover:bg-white/10">
          <X size={15} /> Exit compare
        </button>
      </div>

      {/* Two independent viewers */}
      <div className="flex min-h-0 flex-1">
        {renderPanel('left', primaryId, left.data, primaryId, onChangePrimary)}
        <div className="w-px shrink-0 bg-slate-800" />
        {renderPanel('right', compareId, right.data, compareId, onChangeCompare)}
      </div>
    </div>
  );
}
