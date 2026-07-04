// Slide label printing — formats + types. Labels render at exact physical size
// using CSS mm units so browser print output matches the label stock.

export interface LabelData {
  labNo: string;
  patientName: string;
  patientDob: string | null;
  specimenType: string | null;
  collectionDate: string;
  clientName: string;
  labName: string;
  barcodeValue: string;
  printedAt: string;
  copies: number;
}

export type LabelFormatId = 'dymo30252' | 'dymo30334' | 'zebra2x1' | 'a4sheet';

export interface LabelFormat {
  id: LabelFormatId;
  name: string;
  widthMm: number;
  heightMm: number;
  /** Labels per printed page (A4 sheet = 10 in a 2×5 grid; roll formats = 1). */
  perPage: number;
  /** True for the A4 sheet layout (grid, no per-label page breaks). */
  sheet: boolean;
  /** Barcode bar height in px, tuned to the label height. */
  barcodeHeight: number;
}

export const LABEL_FORMATS: LabelFormat[] = [
  { id: 'dymo30252', name: 'Dymo 30252 Address (89 × 28 mm)', widthMm: 89, heightMm: 28, perPage: 1, sheet: false, barcodeHeight: 34 },
  { id: 'dymo30334', name: 'Dymo 30334 Multipurpose (54 × 25 mm)', widthMm: 54, heightMm: 25, perPage: 1, sheet: false, barcodeHeight: 26 },
  { id: 'zebra2x1', name: 'Zebra 2" × 1" (50 × 25 mm)', widthMm: 50, heightMm: 25, perPage: 1, sheet: false, barcodeHeight: 26 },
  { id: 'a4sheet', name: 'A4 sheet (10 labels / page)', widthMm: 99, heightMm: 57, perPage: 10, sheet: true, barcodeHeight: 40 },
];

export const formatById = (id: LabelFormatId): LabelFormat => LABEL_FORMATS.find((f) => f.id === id)!;

/** Expand records × copies into a flat list of labels to print. */
export function expandLabels(labels: LabelData[], copies: number): LabelData[] {
  const out: LabelData[] = [];
  for (const l of labels) for (let i = 0; i < copies; i++) out.push(l);
  return out;
}

export const shortDate = (iso: string | null): string => (iso ? new Date(iso).toLocaleDateString(undefined, { year: '2-digit', month: '2-digit', day: '2-digit' }) : '—');
export const specimenLabel = (t: string | null): string => (t ? t.replace(/_/g, ' ') : '—');
