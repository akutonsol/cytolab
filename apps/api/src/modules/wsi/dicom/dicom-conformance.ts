import type { DicomConformanceStatus } from '@prisma/client';

/**
 * Program 5C · C1 — the DICOM WSI conformance CONTRACT (pure, dependency-free).
 *
 * This is contracts/rules ONLY: it validates an ALREADY-STRUCTURED metadata object and returns a truthful,
 * structured verdict. It performs NO binary DICOM parsing (that arrives in C2 behind a separately-authorized
 * parser dependency) and touches no database, filesystem, or network. The verdict is one of
 * VALID / UNSUPPORTED / NONCONFORMANT with structured reasons — never a free-form log string.
 *
 * Convert-to-DZI architecture: "supported transfer syntax" means a syntax C2 intends to decode to a
 * libvips-readable working file; anything else is truthfully UNSUPPORTED (not silently accepted).
 */

/** VL Whole Slide Microscopy Image Storage — the only SOP class Osieri accepts as a WSI series (C1). */
export const VL_WHOLE_SLIDE_MICROSCOPY_SOP_CLASS_UID = '1.2.840.10008.5.1.4.1.1.77.1.6';

/**
 * Transfer syntaxes the convert-to-DZI path INTENDS to support (validated in C1; actually decoded in C2).
 * Uncompressed + the JPEG family common to WSI. Anything outside this set is truthfully UNSUPPORTED in C1.
 */
export const SUPPORTED_TRANSFER_SYNTAX_UIDS: readonly string[] = [
  '1.2.840.10008.1.2', // Implicit VR Little Endian
  '1.2.840.10008.1.2.1', // Explicit VR Little Endian
  '1.2.840.10008.1.2.4.50', // JPEG Baseline (8-bit)
  '1.2.840.10008.1.2.4.51', // JPEG Extended (12-bit)
  '1.2.840.10008.1.2.4.57', // JPEG Lossless, Non-Hierarchical
  '1.2.840.10008.1.2.4.70', // JPEG Lossless, First-Order Prediction
  '1.2.840.10008.1.2.4.80', // JPEG-LS Lossless
  '1.2.840.10008.1.2.4.81', // JPEG-LS Near-Lossless
  '1.2.840.10008.1.2.4.90', // JPEG 2000 Lossless
  '1.2.840.10008.1.2.4.91', // JPEG 2000
];

/** DICOM UID: dot-separated components of digits, no empty component, total length ≤ 64 (PS3.5 §9.1). */
const UID_RE = /^(0|[1-9]\d*)(\.(0|[1-9]\d*))*$/;
export function isWellFormedUid(uid: unknown): uid is string {
  return typeof uid === 'string' && uid.length > 0 && uid.length <= 64 && UID_RE.test(uid);
}

/** One optical path descriptor (structural only in C1). */
export interface OpticalPathInput {
  identifier?: string | null;
}

/**
 * The STRUCTURED DICOM metadata a validator consumes. C2's parser will populate this from a real dataset; C1
 * tests construct it directly. Only allowlisted, non-PHI operational/geometry/provenance fields — there is NO
 * PatientName/PatientID/BirthDate/Sex/StudyDate/ReferringPhysician/InstitutionName and no raw-header blob.
 */
export interface StructuredDicomMetadata {
  studyInstanceUID?: string | null;
  seriesInstanceUID?: string | null;
  representativeSopInstanceUID?: string | null;
  sopClassUID?: string | null;
  transferSyntaxUID?: string | null;
  frameOfReferenceUID?: string | null;
  totalPixelMatrixColumns?: number | null;
  totalPixelMatrixRows?: number | null;
  numberOfFrames?: number | null;
  frameColumns?: number | null;
  frameRows?: number | null;
  opticalPaths?: OpticalPathInput[] | null;
  containerIdentifier?: string | null;
}

export type ConformanceReasonCode =
  | 'MISSING_REQUIRED_UID'
  | 'MALFORMED_UID'
  | 'SOP_CLASS_UNSUPPORTED'
  | 'TRANSFER_SYNTAX_UNSUPPORTED'
  | 'GEOMETRY_INVALID'
  | 'FRAME_COUNT_INVALID'
  | 'OPTICAL_PATH_MALFORMED';

/** `unsupported` reasons yield UNSUPPORTED; `nonconformant` reasons yield NONCONFORMANT (the stronger wins). */
export interface ConformanceReason {
  code: ConformanceReasonCode;
  severity: 'unsupported' | 'nonconformant';
  tag?: string;
  expected?: string;
  actual?: string;
  message: string;
}

export interface ConformanceResult {
  status: DicomConformanceStatus;
  reasons: ConformanceReason[];
}

const isPresent = (v: unknown): boolean => v !== null && v !== undefined && v !== '';
const isPositiveInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0;

/**
 * Validate an already-structured DICOM WSI series against the C1 conformance contract. Deterministic and
 * side-effect-free. Precedence: any NONCONFORMANT reason ⇒ NONCONFORMANT; else any UNSUPPORTED reason ⇒
 * UNSUPPORTED; else VALID (empty reasons). NONCONFORMANT/UNSUPPORTED must NOT be ingested (no slide) by C2.
 */
export function validateDicomWsiConformance(meta: StructuredDicomMetadata): ConformanceResult {
  const reasons: ConformanceReason[] = [];

  // 1. Required UID presence.
  const required: Array<[keyof StructuredDicomMetadata, string]> = [
    ['studyInstanceUID', '(0020,000D)'],
    ['seriesInstanceUID', '(0020,000E)'],
    ['sopClassUID', '(0008,0016)'],
    ['transferSyntaxUID', '(0002,0010)'],
  ];
  for (const [field, tag] of required) {
    if (!isPresent(meta[field])) {
      reasons.push({ code: 'MISSING_REQUIRED_UID', severity: 'nonconformant', tag, message: `required UID ${String(field)} ${tag} is absent` });
    }
  }

  // 2. Well-formedness of present UIDs (format only — a malformed UID is nonconformant).
  const uidFields: Array<[keyof StructuredDicomMetadata, string]> = [
    ['studyInstanceUID', '(0020,000D)'],
    ['seriesInstanceUID', '(0020,000E)'],
    ['sopClassUID', '(0008,0016)'],
    ['transferSyntaxUID', '(0002,0010)'],
    ['representativeSopInstanceUID', '(0008,0018)'],
    ['frameOfReferenceUID', '(0020,0052)'],
  ];
  for (const [field, tag] of uidFields) {
    const v = meta[field];
    if (isPresent(v) && !isWellFormedUid(v)) {
      reasons.push({ code: 'MALFORMED_UID', severity: 'nonconformant', tag, actual: String(v), message: `${String(field)} ${tag} is not a well-formed DICOM UID` });
    }
  }

  // 3. SOP class must be the supported WSI class (only meaningful if present + well-formed).
  if (isWellFormedUid(meta.sopClassUID) && meta.sopClassUID !== VL_WHOLE_SLIDE_MICROSCOPY_SOP_CLASS_UID) {
    reasons.push({
      code: 'SOP_CLASS_UNSUPPORTED', severity: 'unsupported', tag: '(0008,0016)',
      expected: VL_WHOLE_SLIDE_MICROSCOPY_SOP_CLASS_UID, actual: meta.sopClassUID,
      message: 'SOP class is not VL Whole Slide Microscopy Image Storage',
    });
  }

  // 4. Transfer syntax must be in the supported set.
  if (isWellFormedUid(meta.transferSyntaxUID) && !SUPPORTED_TRANSFER_SYNTAX_UIDS.includes(meta.transferSyntaxUID)) {
    reasons.push({
      code: 'TRANSFER_SYNTAX_UNSUPPORTED', severity: 'unsupported', tag: '(0002,0010)',
      actual: meta.transferSyntaxUID, message: 'transfer syntax is not in the C1 supported set',
    });
  }

  // 5. Geometry sanity — present values must be positive integers.
  const geom: Array<[keyof StructuredDicomMetadata, string]> = [
    ['totalPixelMatrixColumns', '(0048,0006)'], ['totalPixelMatrixRows', '(0048,0007)'],
    ['frameColumns', '(0028,0011)'], ['frameRows', '(0028,0010)'],
  ];
  for (const [field, tag] of geom) {
    const v = meta[field];
    if (isPresent(v) && !isPositiveInt(v)) {
      reasons.push({ code: 'GEOMETRY_INVALID', severity: 'nonconformant', tag, actual: String(v), message: `${String(field)} ${tag} must be a positive integer` });
    }
  }
  if (isPresent(meta.numberOfFrames) && !isPositiveInt(meta.numberOfFrames)) {
    reasons.push({ code: 'FRAME_COUNT_INVALID', severity: 'nonconformant', tag: '(0028,0008)', actual: String(meta.numberOfFrames), message: 'NumberOfFrames must be a positive integer' });
  }
  // Frame-count vs single-level geometry floor (WSI concatenation may exceed it; fewer is impossible → invalid).
  if (
    isPositiveInt(meta.totalPixelMatrixColumns) && isPositiveInt(meta.totalPixelMatrixRows) &&
    isPositiveInt(meta.frameColumns) && isPositiveInt(meta.frameRows) && isPositiveInt(meta.numberOfFrames)
  ) {
    const minFrames = Math.ceil(meta.totalPixelMatrixColumns / meta.frameColumns) * Math.ceil(meta.totalPixelMatrixRows / meta.frameRows);
    if (meta.numberOfFrames < minFrames) {
      reasons.push({
        code: 'FRAME_COUNT_INVALID', severity: 'nonconformant', tag: '(0028,0008)',
        expected: `>= ${minFrames}`, actual: String(meta.numberOfFrames),
        message: 'NumberOfFrames is fewer than the base-level tile grid requires',
      });
    }
  }

  // 6. Optical paths — structural only (if present, must be a non-empty array of descriptors).
  if (isPresent(meta.opticalPaths)) {
    if (!Array.isArray(meta.opticalPaths) || meta.opticalPaths.length === 0) {
      reasons.push({ code: 'OPTICAL_PATH_MALFORMED', severity: 'nonconformant', tag: '(0048,0105)', message: 'optical-path sequence, when present, must be a non-empty array' });
    }
  }

  const status: DicomConformanceStatus = reasons.some((r) => r.severity === 'nonconformant')
    ? 'NONCONFORMANT'
    : reasons.some((r) => r.severity === 'unsupported')
      ? 'UNSUPPORTED'
      : 'VALID';
  return { status, reasons };
}
