import * as dcmjs from 'dcmjs';
import type { StructuredDicomMetadata } from './dicom-conformance';

/**
 * Program 5C · C2 — the DICOM WSI PARSER ADAPTER. Uses dcmjs narrowly to read a binary dataset and project
 * ONLY the C1 allowlist into a StructuredDicomMetadata + a transient AccessionNumber (matching only) + the
 * acquisition scale that maps onto the EXISTING DigitalSlide fields. The raw dcmjs dataset is never persisted
 * or returned; PHI tags (PatientName/ID/BirthDate/Sex/StudyDate/ReferringPhysician/Institution) are never
 * mapped out. It performs metadata parsing ONLY — pixel reconstruction lives in the decoder.
 */
export interface ParsedDicomWsi {
  metadata: StructuredDicomMetadata;
  /** Transient — used ONLY for the accepted exact accession-matching contract; never persisted as identity. */
  accessionNumber: string | null;
  /** Maps onto EXISTING DigitalSlide.objectivePower / .mpp (not duplicated into SlideDicomMetadata). */
  acquisition: { objectivePower: number | null; mpp: number | null };
}

function firstString(v: unknown): string | null {
  if (typeof v === 'string' && v.length > 0) return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return null;
}
function asInt(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
function asFloat(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Parse binary DICOM bytes → the C1 allowlist projection (no PHI, no raw headers). */
export function parseDicomWsiMetadata(bytes: Buffer): ParsedDicomWsi {
  const dm = dcmjs.data.DicomMessage.readFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  const ds = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dm.dict) as Record<string, unknown>;
  const meta = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dm.meta) as Record<string, unknown>;

  // Optical paths — structural projection only (identifier), never PHI.
  const opsSeq = ds.OpticalPathSequence as Array<Record<string, unknown>> | undefined;
  const opticalPaths = Array.isArray(opsSeq)
    ? opsSeq.map((op) => ({ identifier: firstString(op.OpticalPathIdentifier) }))
    : undefined;

  // Objective power: prefer the top-level ObjectiveLensPower, else the optical path's value.
  const objectivePower =
    asFloat(ds.ObjectiveLensPower) ??
    (Array.isArray(opsSeq) ? asFloat(opsSeq[0]?.ObjectiveLensPower) : null);
  // MPP from PixelSpacing (mm) → microns, if present.
  const spacing = ds.PixelSpacing as unknown;
  const spacingMm = Array.isArray(spacing) ? asFloat(spacing[0]) : asFloat(spacing);
  const mpp = spacingMm != null ? spacingMm * 1000 : null;

  const metadata: StructuredDicomMetadata = {
    studyInstanceUID: firstString(ds.StudyInstanceUID),
    seriesInstanceUID: firstString(ds.SeriesInstanceUID),
    representativeSopInstanceUID: firstString(ds.SOPInstanceUID),
    sopClassUID: firstString(ds.SOPClassUID),
    transferSyntaxUID: firstString(meta.TransferSyntaxUID),
    frameOfReferenceUID: firstString(ds.FrameOfReferenceUID),
    totalPixelMatrixColumns: asInt(ds.TotalPixelMatrixColumns),
    totalPixelMatrixRows: asInt(ds.TotalPixelMatrixRows),
    numberOfFrames: asInt(ds.NumberOfFrames),
    frameColumns: asInt(ds.Columns),
    frameRows: asInt(ds.Rows),
    opticalPaths,
    containerIdentifier: firstString(ds.ContainerIdentifier),
  };

  return { metadata, accessionNumber: firstString(ds.AccessionNumber), acquisition: { objectivePower, mpp } };
}
