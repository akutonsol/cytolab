'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Crosshair, ImageOff, Loader2, Maximize2, Minus, Plus } from 'lucide-react';
import { IconAction } from '@/components/ui';
import {
  fetchDescriptor,
  issueDeliverySession,
  SlideNotFoundError,
  SlideNotViewableError,
  tileUrl,
  type DziDescriptor,
} from '@/lib/wsi-delivery';

export interface SlideAnnotation {
  id?: string;
  x: number; // normalized image coords 0..1
  y: number;
  label: string;
  color: string;
}

interface Props {
  /** P5-4: the viewer resolves pixels through the authenticated delivery session — never a raw URL. */
  slideId: string;
  annotations: SlideAnnotation[];
  readOnly?: boolean;
  /** Called with normalized coords + chosen color when the user clicks to add. */
  onAddAnnotation?: (x: number, y: number, color: string) => void;
  /** Increment to programmatically enter add-annotation mode (e.g. a sidebar button). */
  enterAddSignal?: number;
  /** P5-6: exposes this viewer's OpenSeadragon instance (or null on teardown) to an orchestration layer
   *  (e.g. side-by-side sync navigation). The viewer still owns exactly one slide; the callback is read-only. */
  onViewerReady?: (viewer: unknown | null) => void;
  className?: string;
}

export const ANNOTATION_COLORS = ['#4F46E5', '#DC2626', '#16A34A', '#7C3AED', '#0891B2', '#DB2777'];

type Marker = { id?: string; px: number; py: number; label: string; color: string };
type ViewState = 'loading' | 'ready' | 'empty' | 'error';

/** DZI level count: the top level index is ceil(log2(max(w,h))). */
function maxDziLevel(d: DziDescriptor): number {
  return Math.ceil(Math.log2(Math.max(d.width, d.height, 1)));
}

export function WSIViewer({ slideId, annotations, readOnly = false, onAddAnnotation, enterAddSignal, onViewerReady, className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const osdRef = useRef<any>(null);
  const annotationsRef = useRef(annotations);
  const addModeRef = useRef(false);
  const colorRef = useRef(ANNOTATION_COLORS[0]);
  // Raw delivery token — in memory only. Never written to a URL, cookie, or storage.
  const tokenRef = useRef<string | null>(null);
  const refreshingRef = useRef(false);
  const onReadyRef = useRef(onViewerReady);
  useEffect(() => { onReadyRef.current = onViewerReady; }, [onViewerReady]);

  const [state, setState] = useState<ViewState>('loading');
  const [zoom, setZoom] = useState(1);
  const [addMode, setAddMode] = useState(false);
  const [color, setColor] = useState(ANNOTATION_COLORS[0]);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => { annotationsRef.current = annotations; }, [annotations]);
  useEffect(() => { addModeRef.current = addMode; }, [addMode]);
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { if (enterAddSignal && !readOnly && onAddAnnotation) setAddMode(true); }, [enterAddSignal, readOnly, onAddAnnotation]);

  const recompute = useCallback(() => {
    const v = viewerRef.current;
    const OSD = osdRef.current;
    if (!v || !OSD || v.world.getItemCount() === 0) return;
    const bounds = v.world.getItemAt(0).getBounds();
    const next: Marker[] = annotationsRef.current.map((a) => {
      const vp = new OSD.Point(bounds.x + a.x * bounds.width, bounds.y + a.y * bounds.height);
      const px = v.viewport.pixelFromPoint(vp, true);
      return { id: a.id, px: px.x, py: px.y, label: a.label, color: a.color };
    });
    setMarkers(next);
    const z = v.viewport.getZoom(true) / v.viewport.getHomeZoom();
    setZoom(z);
  }, []);

  // Issue a delivery session + open OpenSeadragon against the authenticated tile endpoints.
  useEffect(() => {
    let disposed = false;
    setState('loading');
    tokenRef.current = null;

    (async () => {
      // 1) Authenticated, generation-bound session (staff cookie → Bearer token, in memory only).
      let token: string;
      let descriptor: DziDescriptor;
      try {
        const session = await issueDeliverySession(slideId);
        token = session.token;
        descriptor = await fetchDescriptor(token);
      } catch (e) {
        if (disposed) return;
        setState(e instanceof SlideNotViewableError || e instanceof SlideNotFoundError ? 'empty' : 'error');
        return;
      }
      if (disposed || !hostRef.current) return;
      tokenRef.current = token;

      const OpenSeadragon = (await import('openseadragon')).default as any;
      if (disposed || !hostRef.current) return;
      osdRef.current = OpenSeadragon;

      // 2) Custom tile source → every tile is fetched from the authenticated delivery endpoint with the
      //    Bearer header (loadTilesWithAjax + ajaxHeaders). No direct pixel loading from any external URL.
      const tileSources = {
        width: descriptor.width,
        height: descriptor.height,
        tileSize: descriptor.tileSize,
        tileOverlap: descriptor.overlap,
        minLevel: 0,
        maxLevel: maxDziLevel(descriptor),
        getTileUrl: (level: number, x: number, y: number) => tileUrl(level, x, y),
      };

      const viewer = OpenSeadragon({
        element: hostRef.current,
        tileSources,
        loadTilesWithAjax: true,
        ajaxHeaders: { Authorization: `Bearer ${token}` },
        crossOriginPolicy: false,
        prefixUrl: 'https://cdn.jsdelivr.net/npm/openseadragon@5/build/openseadragon/images/',
        showNavigationControl: false,
        showNavigator: true,
        navigatorBackground: '#0f172a',
        gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: true },
        visibilityRatio: 1,
        minZoomImageRatio: 0.5,
        maxZoomPixelRatio: 4,
        animationTime: 0.4,
      });
      viewerRef.current = viewer;

      viewer.addHandler('open', () => { if (!disposed) { setState('ready'); recompute(); onReadyRef.current?.(viewer); } });
      viewer.addHandler('open-failed', () => { if (!disposed) setState('error'); });
      viewer.addHandler('update-viewport', recompute);
      viewer.addHandler('animation', recompute);
      viewer.addHandler('resize', recompute);

      // A tile 401 means the short-lived token expired mid-session → re-issue ONCE and re-drive, guarded
      // against a refresh storm. Never falls back to an unauthenticated fetch.
      viewer.addHandler('tile-load-failed', async (ev: any) => {
        if (disposed || refreshingRef.current) return;
        const status = ev?.tile?.ajaxRequest?.status;
        if (status !== 401 && status !== 403) return;
        refreshingRef.current = true;
        try {
          const session = await issueDeliverySession(slideId);
          if (disposed) return;
          tokenRef.current = session.token;
          viewer.setAjaxHeaders?.({ Authorization: `Bearer ${session.token}` }, true);
          viewer.world.resetItems();
        } catch {
          if (!disposed) setState('error');
        } finally {
          refreshingRef.current = false;
        }
      });

      viewer.addHandler('canvas-click', (event: any) => {
        if (!addModeRef.current || !event.quick || !onAddAnnotation) return;
        const bounds = viewer.world.getItemAt(0).getBounds();
        const vp = viewer.viewport.pointFromPixel(event.position);
        const x = Math.min(1, Math.max(0, (vp.x - bounds.x) / bounds.width));
        const y = Math.min(1, Math.max(0, (vp.y - bounds.y) / bounds.height));
        onAddAnnotation(x, y, colorRef.current);
        setAddMode(false);
      });
    })();

    return () => {
      disposed = true;
      onReadyRef.current?.(null);
      if (viewerRef.current) { viewerRef.current.destroy(); viewerRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideId]);

  // Re-project markers when the annotation set changes.
  useEffect(() => { recompute(); }, [annotations, recompute]);

  const zoomBy = (factor: number) => { const v = viewerRef.current; if (v) { v.viewport.zoomBy(factor); v.viewport.applyConstraints(); } };
  const resetView = () => { viewerRef.current?.viewport.goHome(); };

  return (
    <div className={`relative h-full w-full overflow-hidden bg-black ${className ?? ''}`}>
      {/* Toolbar */}
      <div className="absolute left-3 top-3 z-20 flex items-center gap-2 rounded-xl bg-slate-900/90 px-2 py-1.5 shadow-lg ring-1 ring-white/10 backdrop-blur">
        <IconAction icon={<Plus size={16} />} tone="inverse" onClick={() => zoomBy(1.4)} title="Zoom in" />
        <IconAction icon={<Minus size={16} />} tone="inverse" onClick={() => zoomBy(1 / 1.4)} title="Zoom out" />
        <IconAction icon={<Maximize2 size={15} />} tone="inverse" onClick={resetView} title="Reset view" />
        {!readOnly && onAddAnnotation && (
          <>
            <span className="mx-0.5 h-5 w-px bg-white/15" />
            <button onClick={() => setAddMode((m) => !m)} title="Add annotation"
              className="grid h-8 w-8 place-items-center rounded-lg transition-colors"
              style={addMode ? { background: color, color: '#fff' } : { color: '#fff' }}>
              <Crosshair size={16} />
            </button>
            <div className="flex items-center gap-1">
              {ANNOTATION_COLORS.map((c) => (
                <button key={c} onClick={() => setColor(c)} title={c}
                  className="h-4 w-4 rounded-full ring-2 ring-offset-1 ring-offset-slate-900 transition-transform hover:scale-110"
                  style={{ background: c, boxShadow: color === c ? `0 0 0 2px ${c}` : 'none', outline: color === c ? '2px solid #fff' : 'none' }} />
              ))}
            </div>
          </>
        )}
        <span className="mx-0.5 h-5 w-px bg-white/15" />
        <span data-testid="wsi-zoom" className="px-1 text-[13px] font-semibold tabular-nums text-white">{zoom.toFixed(1)}x</span>
      </div>

      {addMode && (
        <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full bg-slate-900/90 px-3 py-1 text-[12px] font-semibold text-white ring-1 ring-white/10">
          Click on the slide to place an annotation
        </div>
      )}

      {/* OSD host */}
      <div ref={hostRef} className="h-full w-full" style={{ cursor: addMode ? 'crosshair' : 'grab' }} />

      {/* SVG annotation overlay */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ zIndex: 10 }}>
        {markers.map((m, i) => (
          <g key={m.id ?? i} className="pointer-events-auto cursor-pointer"
            onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered((h) => (h === i ? null : h))}>
            <circle cx={m.px} cy={m.py} r={12} fill={m.color} opacity={0.22} />
            <circle cx={m.px} cy={m.py} r={5} fill={m.color} stroke="#fff" strokeWidth={1.5} />
            {hovered === i && (
              <g>
                <rect x={m.px + 10} y={m.py - 14} width={Math.max(40, m.label.length * 7 + 14)} height={22} rx={6} fill="#0f172a" opacity={0.92} />
                <text x={m.px + 17} y={m.py + 1} fill="#fff" fontSize={12} fontWeight={600}>{m.label}</text>
              </g>
            )}
          </g>
        ))}
      </svg>

      {state === 'loading' && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black">
          <Loader2 size={28} className="animate-spin text-slate-500" />
        </div>
      )}
      {state === 'empty' && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black">
          <div className="text-center">
            <ImageOff size={26} className="mx-auto text-slate-600" />
            <div className="mt-2 text-[15px] font-semibold text-slate-200">No published slide image yet.</div>
            <div className="mt-1 text-[13px] text-slate-500">This slide has no processed, published generation to display.</div>
          </div>
        </div>
      )}
      {state === 'error' && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black">
          <div className="text-center">
            <div className="text-[15px] font-semibold text-slate-200">Failed to load slide.</div>
            <div className="mt-1 text-[13px] text-slate-500">The image could not be delivered. Try again.</div>
          </div>
        </div>
      )}
    </div>
  );
}
