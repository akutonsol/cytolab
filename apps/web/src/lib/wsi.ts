// Shared types + helpers for Whole Slide Imaging (WSI). No orange anywhere.

export interface SlideAnnotationRow {
  id: string;
  x: number;
  y: number;
  label: string;
  color: string;
  createdAt: string;
}

export interface DigitalSlide {
  id: string;
  // P5-4 Phase B Part 2: `slideUrl` removed from the supported client contract. Viewability derives from a
  // published generation via the authenticated delivery boundary, never from a URL.
  format: string;
  magnification: string | null;
  stain: string | null;
  scanner: string | null;
  fileSizeBytes: number | null;
  uploadedById: string | null;
  uploadedAt: string;
  recordId: string;
  record: {
    id: string;
    labNumber: string | null;
    identifier: string;
    formType: string | null;
    patient: { id: string; firstName: string; lastName: string; registrationNo: string | null } | null;
  } | null;
  annotations: SlideAnnotationRow[];
  patientName: string;
  labNo: string;
  annotationCount: number;
}

export interface WsiSummary {
  totalSlides: number;
  recordsWithSlides: number;
  totalAnnotations: number;
}

export const SLIDE_FORMATS: { value: string; label: string }[] = [
  { value: 'image', label: 'Single Image (JPEG/PNG)' },
  { value: 'dzi', label: 'Deep Zoom (DZI)' },
  { value: 'svs', label: 'Aperio (SVS)' },
  { value: 'tiff', label: 'TIFF / BigTIFF' },
  { value: 'ndpi', label: 'Hamamatsu (NDPI)' },
];

export function formatBytes(n: number | null): string {
  if (!n || n <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export const shortDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
