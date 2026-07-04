'use client';

import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

/**
 * Renders a CODE128 barcode into an inline SVG via JsBarcode. The SVG stretches
 * to fill its container (preserveAspectRatio="none"), so a long lab number still
 * fits a narrow label; `height`/`width` set the internal render resolution.
 */
export function Barcode({ value, height = 30, width = 1.4, className, style }: { value: string; height?: number; width?: number; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, {
        format: 'CODE128',
        height,
        width,
        displayValue: false,
        margin: 0,
        background: 'transparent',
        lineColor: '#000000',
      });
      ref.current.setAttribute('preserveAspectRatio', 'none');
    } catch {
      /* invalid value — leave empty */
    }
  }, [value, height, width]);
  return <svg ref={ref} className={className} style={{ display: 'block', width: '100%', height: '100%', ...style }} />;
}
