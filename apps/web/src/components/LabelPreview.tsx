'use client';

import { Barcode } from './Barcode';
import { shortDate, specimenLabel, type LabelData, type LabelFormat } from '@/lib/labels';

/**
 * A single slide label rendered at exact physical size (CSS mm), so browser
 * print output matches the label stock. Black border + CODE128 barcode.
 */
export function LabelPreview({ label, format }: { label: LabelData; format: LabelFormat }) {
  const big = format.heightMm >= 40;
  const labFont = big ? 15 : format.heightMm >= 28 ? 13 : 11;
  const nameFont = labFont - 2;
  const footFont = big ? 10 : 8;

  return (
    <div
      className="print-label"
      style={{
        width: `${format.widthMm}mm`,
        height: `${format.heightMm}mm`,
        border: '1px solid #000',
        boxSizing: 'border-box',
        padding: '1.6mm 2mm',
        background: '#fff',
        color: '#000',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        overflow: 'hidden',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* Top line: Lab# (bold mono) + barcode */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2mm' }}>
        <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontWeight: 700, fontSize: labFont, lineHeight: 1.05, whiteSpace: 'nowrap' }}>{label.labNo}</span>
        <div style={{ flex: 1, minWidth: 0, height: format.barcodeHeight }}>
          <Barcode value={label.barcodeValue} height={40} width={1} />
        </div>
      </div>

      {/* Middle: patient name */}
      <div style={{ fontSize: nameFont, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label.patientName}</div>

      {/* Bottom: specimen | date | client */}
      <div style={{ fontSize: footFont, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#000' }}>
        {specimenLabel(label.specimenType)} · {shortDate(label.collectionDate)} · {label.clientName}
      </div>
    </div>
  );
}
