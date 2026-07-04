'use client';
import { useRef, useState, useEffect, useCallback } from 'react';
import { RotateCcw } from 'lucide-react';

interface DrawPadProps {
  value?: string | null;        // existing dataURI
  onChange: (dataUri: string | null) => void;
  width?: number;
  height?: number;
  disabled?: boolean;
}

export function DrawPad({
  value, onChange, width = 400, height = 150, disabled = false,
}: DrawPadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(!value);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  // Tracks the last dataURI this component itself emitted, so the value-sync
  // effect below can tell an external change (e.g. "Use saved signature",
  // async-loaded profile signature) apart from our own onChange echo.
  const lastExport = useRef<string | null>(value ?? null);

  // Paint `value` onto the canvas whenever it changes externally. Skips echoes
  // of our own strokes (value === lastExport) so drawing never reloads/flickers.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || drawing) return;
    if (value === lastExport.current) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!value) {
      setIsEmpty(true);
      lastExport.current = null;
      return;
    }
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = value;
    lastExport.current = value;
    setIsEmpty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    setDrawing(true);
    lastPos.current = getPos(e, canvas);
  }, [disabled]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing || disabled) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !lastPos.current) return;

    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    lastPos.current = pos;
    setIsEmpty(false);
  }, [drawing, disabled]);

  const endDraw = useCallback(() => {
    if (!drawing) return;
    setDrawing(false);
    lastPos.current = null;
    // Export as PNG data URI
    const canvas = canvasRef.current;
    if (canvas && !isEmpty) {
      const uri = canvas.toDataURL('image/png');
      lastExport.current = uri;
      onChange(uri);
    }
  }, [drawing, isEmpty, onChange]);

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
    lastExport.current = null;
    onChange(null);
  };

  return (
    <div style={{ userSelect: 'none' }}>
      {/* Canvas */}
      <div style={{
        position: 'relative',
        border: `2px solid ${disabled ? '#E2E8F0' : drawing ? '#4F46E5' : '#CBD5E1'}`,
        borderRadius: 12,
        overflow: 'hidden',
        background: '#FAFBFF',
        cursor: disabled ? 'not-allowed' : 'crosshair',
        transition: 'border-color 0.15s',
      }}>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          style={{ display: 'block', width: '100%', height: height, touchAction: 'none' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        {/* Placeholder */}
        {isEmpty && !disabled && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center',
            justifyContent: 'center', pointerEvents: 'none',
          }}>
            <span style={{ fontSize: 13, color: '#94A3B8', fontStyle: 'italic' }}>
              Sign here...
            </span>
          </div>
        )}
        {/* Baseline */}
        <div style={{
          position: 'absolute', bottom: 32, left: 24, right: 24,
          height: 1, background: '#E2E8F0', pointerEvents: 'none',
        }} />
      </div>

      {/* Controls */}
      {!disabled && (
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', marginTop: 8,
        }}>
          <span style={{ fontSize: 11, color: '#94A3B8' }}>
            Draw your signature above
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={clear}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 12, fontWeight: 600, color: '#64748B',
                background: 'none', border: '1px solid #E2E8F0',
                borderRadius: 8, padding: '4px 10px', cursor: 'pointer',
              }}>
              <RotateCcw size={12} /> Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
