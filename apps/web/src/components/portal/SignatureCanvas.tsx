'use client';
import { useRef, useState, useEffect } from 'react';

interface SignatureCanvasProps {
  onSave: (dataUrl: string) => void;
}

/** Lightweight draw-to-sign canvas (mouse + touch). Emits a PNG data URL. */
export function SignatureCanvas({ onSave }: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const getPos = (e: MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    // Scale from CSS pixels to the canvas's intrinsic coordinate space.
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    isDrawing.current = true;
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = getPos(e.nativeEvent);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsEmpty(false);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = getPos(e.nativeEvent);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    isDrawing.current = false;
  };

  const clear = () => {
    const canvas = canvasRef.current!;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
  };

  const save = () => onSave(canvasRef.current!.toDataURL('image/png'));

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={280}
        height={80}
        className="w-full cursor-crosshair touch-none rounded-lg border border-gray-200 bg-gray-50"
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
      />
      <div className="mt-2 flex justify-between">
        <span className="text-[10px] text-gray-400">Draw your signature above</span>
        <div className="flex gap-2">
          <button onClick={clear} className="text-xs text-gray-400 hover:text-gray-600">
            Clear
          </button>
          {!isEmpty && (
            <button onClick={save} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">
              Save Signature
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
