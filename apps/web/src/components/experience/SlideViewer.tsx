'use client';

import { useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ZoomIn, ZoomOut, Maximize2, ScanLine, Layers, MousePointerClick } from 'lucide-react';
import { DemoCase, severityColor } from './demo-cases';

type Props = {
  c: DemoCase;
  slideVisible: boolean;   // slide has been scanned
  scanning: boolean;       // scan line animating
  heatVisible: boolean;    // risk heat map shown
  boxesVisible: boolean;   // detection boxes shown
  annotated: boolean;      // AI layer on (Original vs AI Annotated)
  selected: string | null;
  onSelect: (id: string | null) => void;
  onManual: () => void;
};

export function SlideViewer({ c, slideVisible, scanning, heatVisible, boxesVisible, annotated, selected, onSelect, onManual }: Props) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const clampZoom = (z: number) => Math.min(3.2, Math.max(1, z));
  const doZoom = (dir: number) => { onManual(); setZoom((z) => { const nz = clampZoom(z + dir); if (nz === 1) setPan({ x: 0, y: 0 }); return nz; }); };
  const reset = () => { onManual(); setZoom(1); setPan({ x: 0, y: 0 }); };

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!slideVisible) return;
    e.preventDefault();
    onManual();
    setZoom((z) => { const nz = clampZoom(z + (e.deltaY < 0 ? 0.3 : -0.3)); if (nz === 1) setPan({ x: 0, y: 0 }); return nz; });
  }, [slideVisible, onManual]);

  const onDown = (e: React.PointerEvent) => {
    if (zoom <= 1) return;
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const lim = (zoom - 1) * 240;
    setPan({
      x: Math.max(-lim, Math.min(lim, drag.current.px + (e.clientX - drag.current.x))),
      y: Math.max(-lim, Math.min(lim, drag.current.py + (e.clientY - drag.current.y))),
    });
  };
  const onUp = () => { drag.current = null; setDragging(false); };

  const showBoxes = boxesVisible && annotated;
  const showHeat = heatVisible && annotated;

  // Heat map — radial blooms centered on each detection, weighted by case intensity.
  const heatGradients = c.detections
    .map((d) => `radial-gradient(circle at ${d.x + d.w / 2}% ${d.y + d.h / 2}%, ${severityColor[d.severity]}${d.severity === 'benign' ? '22' : '55'} 0%, transparent ${8 + d.w}% )`)
    .join(', ');

  return (
    <div className="xv">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* Top toolbar: Original vs AI Annotated is owned by the orchestrator; here we show zoom + status */}
      <div className="xv-top">
        <span className="xv-slide-id">WSI · <b>{c.accession}</b></span>
        <span className="xv-mag">{Math.round(zoom * 40)}×</span>
        <span className={`xv-layer ${annotated ? 'on' : ''}`}><Layers size={13} /> {annotated ? 'AI Annotated' : 'Original'}</span>
      </div>

      <div
        className="xv-stage"
        onWheel={onWheel}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
        style={{ cursor: zoom > 1 ? (dragging ? 'grabbing' : 'grab') : 'default' }}
      >
        {/* Awaiting-scan state */}
        {!slideVisible && (
          <div className="xv-await">
            <div className="xv-await-ring"><ScanLine size={26} /></div>
            <div className="xv-await-t">Awaiting digital scan</div>
            <div className="xv-await-s">{c.specimenType}</div>
          </div>
        )}

        {/* Slide + overlays */}
        {slideVisible && (
          <div className="xv-canvas" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
            <img src={c.slide} alt="" className="xv-img" draggable={false} style={{ filter: annotated ? 'saturate(1.08)' : 'saturate(1.02) brightness(1.02)' }} />

            {/* Risk heat map */}
            <AnimatePresence>
              {showHeat && (
                <motion.div className="xv-heat" style={{ background: heatGradients, opacity: 0.35 + c.heatmap * 0.5 }}
                  initial={{ opacity: 0 }} animate={{ opacity: 0.35 + c.heatmap * 0.5 }} exit={{ opacity: 0 }} transition={{ duration: 0.9 }} />
              )}
            </AnimatePresence>

            {/* Detection boxes — appear one by one */}
            <AnimatePresence>
              {showBoxes && c.detections.map((d, i) => {
                const col = severityColor[d.severity];
                const isSel = selected === d.id;
                return (
                  <motion.button
                    key={d.id}
                    className="xv-det"
                    style={{ left: `${d.x}%`, top: `${d.y}%`, width: `${d.w}%`, height: `${d.h}%`, borderColor: col, boxShadow: isSel ? `0 0 0 2px ${col}, 0 0 22px ${col}88` : `0 0 12px ${col}55` }}
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1, transition: { duration: 0.32, delay: i * 0.22, ease: [0.22, 0.8, 0.2, 1] } }}
                    exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.16 } }}
                    onClick={(e) => { e.stopPropagation(); onManual(); onSelect(isSel ? null : d.id); }}
                  >
                    <span className="xv-det-tag" style={{ background: col }}>{d.label} · {d.confidence.toFixed(0)}%</span>
                    {/* corner ticks */}
                    <i style={{ borderColor: col }} className="xv-c tl" /><i style={{ borderColor: col }} className="xv-c tr" />
                    <i style={{ borderColor: col }} className="xv-c bl" /><i style={{ borderColor: col }} className="xv-c br" />
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {/* Scan line */}
        {scanning && <span className="xv-scan" />}

        {/* Selected-detection popover */}
        <AnimatePresence>
          {selected && showBoxes && (() => {
            const d = c.detections.find((x) => x.id === selected);
            if (!d) return null;
            const col = severityColor[d.severity];
            return (
              <motion.div className="xv-pop" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.22 }}>
                <div className="xv-pop-head"><span className="xv-pop-dot" style={{ background: col }} /> {d.label}<span className="xv-pop-conf" style={{ color: col }}>{d.confidence.toFixed(1)}%</span></div>
                <div className="xv-pop-note">{d.note}</div>
                <div className="xv-pop-bar"><span style={{ width: `${d.confidence}%`, background: col }} /></div>
              </motion.div>
            );
          })()}
        </AnimatePresence>

        {/* Hint */}
        {showBoxes && !selected && <div className="xv-hint"><MousePointerClick size={13} /> Click a detection to inspect</div>}
      </div>

      {/* Bottom controls */}
      <div className="xv-tools">
        <button className="xv-tool" onClick={() => doZoom(-0.4)} aria-label="Zoom out" disabled={!slideVisible}><ZoomOut size={16} /></button>
        <div className="xv-zoombar"><span style={{ width: `${((zoom - 1) / 2.2) * 100}%` }} /></div>
        <button className="xv-tool" onClick={() => doZoom(0.4)} aria-label="Zoom in" disabled={!slideVisible}><ZoomIn size={16} /></button>
        <button className="xv-tool" onClick={reset} aria-label="Reset view" disabled={!slideVisible}><Maximize2 size={16} /></button>
      </div>
    </div>
  );
}

const CSS = `
  .xv { display: flex; flex-direction: column; height: 100%; background: #0c0a18; border: 1px solid rgba(255,255,255,.08); border-radius: 16px; overflow: hidden; }
  .xv-top { display: flex; align-items: center; gap: 12px; padding: 11px 14px; border-bottom: 1px solid rgba(255,255,255,.06); font-size: 12px; color: rgba(255,255,255,.55); }
  .xv-slide-id b { color: #fff; font-weight: 700; }
  .xv-mag { margin-left: auto; color: rgba(255,255,255,.7); font-variant-numeric: tabular-nums; }
  .xv-layer { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 700; color: rgba(255,255,255,.5); border: 1px solid rgba(255,255,255,.14); border-radius: 999px; padding: 3px 9px; }
  .xv-layer.on { color: #c4b5fd; border-color: rgba(139,92,246,.4); background: rgba(139,92,246,.15); }

  .xv-stage { position: relative; flex: 1; overflow: hidden; background:
    radial-gradient(ellipse 60% 50% at 40% 35%, rgba(120,80,190,.12), transparent 70%), #0a0812; touch-action: none; }
  .xv-canvas { position: absolute; inset: 0; transform-origin: center; will-change: transform; }
  .xv-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; user-select: none; }
  .xv-heat { position: absolute; inset: 0; mix-blend-mode: screen; pointer-events: none; }

  .xv-det { position: absolute; background: transparent; border: 1.5px solid; border-radius: 5px; cursor: pointer; padding: 0; }
  .xv-det-tag { position: absolute; top: -20px; left: -1px; font-size: 10px; font-weight: 800; color: #fff; padding: 2px 7px; border-radius: 5px; white-space: nowrap; letter-spacing: .02em; }
  .xv-c { position: absolute; width: 9px; height: 9px; border: 2px solid; }
  .xv-c.tl { top: -1px; left: -1px; border-right: 0; border-bottom: 0; }
  .xv-c.tr { top: -1px; right: -1px; border-left: 0; border-bottom: 0; }
  .xv-c.bl { bottom: -1px; left: -1px; border-right: 0; border-top: 0; }
  .xv-c.br { bottom: -1px; right: -1px; border-left: 0; border-top: 0; }

  .xv-scan { position: absolute; left: 0; right: 0; top: 0; height: 3px; z-index: 6; background: linear-gradient(90deg, transparent, rgba(167,139,250,.95), transparent); box-shadow: 0 0 16px rgba(139,92,246,.9); animation: xv-scan 2.1s cubic-bezier(.5,0,.5,1) infinite; }
  @keyframes xv-scan { 0%{top:2%;opacity:0} 10%{opacity:1} 90%{opacity:1} 100%{top:97%;opacity:0} }

  .xv-await { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 8px; color: rgba(255,255,255,.5); }
  .xv-await-ring { width: 66px; height: 66px; border-radius: 50%; display: grid; place-items: center; color: #a78bfa; border: 1.5px dashed rgba(167,139,250,.5); animation: xv-spin 8s linear infinite; }
  @keyframes xv-spin { to { transform: rotate(360deg); } }
  .xv-await-t { font-size: 14px; font-weight: 700; color: rgba(255,255,255,.75); }
  .xv-await-s { font-size: 12px; }

  .xv-pop { position: absolute; right: 14px; bottom: 14px; z-index: 8; width: 230px; background: rgba(18,14,32,.95); border: 1px solid rgba(255,255,255,.12); border-radius: 12px; padding: 12px 13px; backdrop-filter: blur(10px); box-shadow: 0 18px 44px rgba(0,0,0,.5); }
  .xv-pop-head { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 800; color: #fff; }
  .xv-pop-dot { width: 9px; height: 9px; border-radius: 50%; }
  .xv-pop-conf { margin-left: auto; font-variant-numeric: tabular-nums; }
  .xv-pop-note { font-size: 12px; color: rgba(255,255,255,.6); line-height: 1.5; margin: 8px 0 10px; }
  .xv-pop-bar { height: 5px; border-radius: 999px; background: rgba(255,255,255,.1); overflow: hidden; }
  .xv-pop-bar span { display: block; height: 100%; border-radius: 999px; }

  .xv-hint { position: absolute; left: 14px; bottom: 14px; z-index: 7; display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: rgba(255,255,255,.6); background: rgba(18,14,32,.7); border: 1px solid rgba(255,255,255,.1); border-radius: 999px; padding: 5px 11px; backdrop-filter: blur(6px); }

  .xv-tools { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-top: 1px solid rgba(255,255,255,.06); }
  .xv-tool { width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center; color: rgba(255,255,255,.8); background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); cursor: pointer; transition: all .15s ease; }
  .xv-tool:hover:not(:disabled) { background: rgba(255,255,255,.12); color: #fff; }
  .xv-tool:disabled { opacity: .35; cursor: default; }
  .xv-zoombar { flex: 1; height: 4px; border-radius: 999px; background: rgba(255,255,255,.1); overflow: hidden; }
  .xv-zoombar span { display: block; height: 100%; background: linear-gradient(90deg,#7c3aed,#a78bfa); border-radius: 999px; transition: width .2s ease; }
`;
