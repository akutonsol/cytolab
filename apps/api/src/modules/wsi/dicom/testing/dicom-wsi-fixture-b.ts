import * as dcmjs from 'dcmjs';

/**
 * Program 5C · C6 — a SECOND, INDEPENDENTLY constructed VL Whole Slide Microscopy Image fixture.
 *
 * This is NOT a parameterised call of the C2 Fixture-A generator (`dicom-wsi-fixture.ts`). It has its own
 * dataset-assembly code path and deliberately differs in many *legal* encoding choices so that two synthetic,
 * standards-conformant objects — differing in implementation identity, UID roots, tile/matrix geometry,
 * optional metadata, vendor metadata and private tags — both traverse the identical vendor-neutral C1→C2 path.
 *
 * Independence is over more than the Manufacturer value: implementation class UID + version name, UID roots,
 * tile size, total-pixel-matrix size, frame count, optional-tag presence, accession/specimen content, fictional
 * vendor metadata, and a deterministic private creator + private element. It remains strictly in-profile:
 * VL WSI · uncompressed Explicit VR LE · RGB · 3 samples · 8-bit · TILED_FULL · one optical path · one instance.
 *
 * The evidence this supports is independently-constructed *synthetic* interoperability — NOT validation against
 * a named commercial scanner. All PHI/vendor values are fictional and used only to prove they are never
 * persisted into the metadata allowlist.
 */
export const WSI_SOP_CLASS_UID = '1.2.840.10008.5.1.4.1.1.77.1.6';
export const EXPLICIT_VR_LE = '1.2.840.10008.1.2.1';

// Fixture B lives under a DISTINCT experimental OID arc (…9999.8888.*), not Fixture A's …9999.100.* / .777 / .331.
const B_ROOT = '1.2.826.0.1.3680043.2.9999.8888';
/** A Fixture-B-specific implementation identity (different from whatever dcmjs would default for Fixture A). */
export const IMPLEMENTATION_CLASS_UID_B = `${B_ROOT}.0.2`;
export const IMPLEMENTATION_VERSION_NAME_B = 'OSIERI-FIXB-2';
/** Deterministic private group/creator used by Fixture B (odd group 0009 → private). */
export const B_PRIVATE_GROUP = '0009';
export const B_PRIVATE_CREATOR = 'OSIERI_FIXTURE_B';

export interface FixtureBOptions {
  studyInstanceUID?: string;
  seriesInstanceUID?: string;
  sopInstanceUID?: string;
  accessionNumber?: string | null;
  totalPixelMatrix?: number; // square, default 384 (differs from A's 512)
  frameSize?: number; // square, default 128 (differs from A's 256)
  includePHI?: boolean;
  includePrivateTags?: boolean;
  includeVendorMetadata?: boolean;
}

// A distinct fill pattern from Fixture A's palette (independent construction, still deterministic).
function fillRgb(nFrames: number, frame: number): Buffer {
  const buf = Buffer.alloc(nFrames * frame * frame * 3);
  for (let f = 0; f < nFrames; f++) {
    const r = (37 * (f + 1)) % 256, g = (91 * (f + 1)) % 256, b = (150 * (f + 1)) % 256;
    const base = f * frame * frame * 3;
    for (let p = 0; p < frame * frame; p++) { const o = base + p * 3; buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; }
  }
  return buf;
}

/** Generate the raw bytes for Fixture B — an independently constructed, in-profile VL WSI object. */
export function generateDicomWsiBytesB(opts: FixtureBOptions = {}): Buffer {
  const total = opts.totalPixelMatrix ?? 384;
  const frame = opts.frameSize ?? 128;
  const per = Math.ceil(total / frame);
  const nFrames = per * per;
  const study = opts.studyInstanceUID ?? `${B_ROOT}.200`;
  const series = opts.seriesInstanceUID ?? `${B_ROOT}.200.1`;
  const sop = opts.sopInstanceUID ?? `${B_ROOT}.200.1.1`;

  const pixel = fillRgb(nFrames, frame);

  // Own assembly. Element set + optional-tag presence differ from Fixture A (e.g. B carries FrameOfReferenceUID,
  // StudyID, SpecimenDescriptionSequence; both carry a single OpticalPathSequence entry — the in-profile invariant).
  const dataset: Record<string, unknown> = {
    _meta: {},
    SOPClassUID: WSI_SOP_CLASS_UID,
    SOPInstanceUID: sop,
    StudyInstanceUID: study,
    SeriesInstanceUID: series,
    FrameOfReferenceUID: `${B_ROOT}.200.9`, // optional UID present in B, absent in A
    Modality: 'SM',
    StudyID: 'STB1',
    SeriesNumber: '2',
    InstanceNumber: '1',
    DimensionOrganizationType: 'TILED_FULL',
    Rows: frame,
    Columns: frame,
    NumberOfFrames: String(nFrames),
    TotalPixelMatrixColumns: total,
    TotalPixelMatrixRows: total,
    SamplesPerPixel: 3,
    PhotometricInterpretation: 'RGB',
    PlanarConfiguration: 0,
    BitsAllocated: 8,
    BitsStored: 8,
    HighBit: 7,
    PixelRepresentation: 0,
    OpticalPathSequence: [{ OpticalPathIdentifier: 'B1', ObjectiveLensPower: 40 }], // single path, different power
    ContainerIdentifier: 'CONT-B-1',
    SpecimenDescriptionSequence: [{ SpecimenIdentifier: 'SPEC-B-1', SpecimenUID: `${B_ROOT}.200.7` }],
    PixelData: pixel.buffer.slice(pixel.byteOffset, pixel.byteOffset + pixel.byteLength),
  };
  if (opts.accessionNumber !== null) dataset.AccessionNumber = opts.accessionNumber ?? 'ACC-C6-B';
  if (opts.includeVendorMetadata !== false) {
    Object.assign(dataset, {
      Manufacturer: 'OSIERI Synthetic Imaging', // fictional — must never route/decode/match or be persisted
      ManufacturerModelName: 'VirtualScope-B',
      SoftwareVersions: 'sim-2.0',
      DeviceSerialNumber: 'SN-B-0002',
    });
  }
  if (opts.includePHI !== false) {
    Object.assign(dataset, {
      PatientName: 'ROE^RICHARD',
      PatientID: 'PHI-PID-B-999',
      PatientBirthDate: '19651231',
      PatientSex: 'M',
      StudyDate: '20260202',
      ReferringPhysicianName: 'JONES^MARY',
      InstitutionName: 'FICTIONAL CLINIC B',
    });
  }

  const dict = new dcmjs.data.DicomDict({
    TransferSyntaxUID: EXPLICIT_VR_LE,
    MediaStorageSOPClassUID: WSI_SOP_CLASS_UID,
    MediaStorageSOPInstanceUID: sop,
  });
  // Distinct implementation identity in the file-meta group (0002).
  (dict.meta as Record<string, unknown>)['00020012'] = { vr: 'UI', Value: [IMPLEMENTATION_CLASS_UID_B] };
  (dict.meta as Record<string, unknown>)['00020013'] = { vr: 'SH', Value: [IMPLEMENTATION_VERSION_NAME_B] };
  dict.dict = dcmjs.data.DicomMetaDictionary.denaturalizeDataset(dataset);
  if (opts.includePrivateTags !== false) {
    // Deterministic private creator + one private element (odd group 0009). Never persisted/matched/logged.
    (dict.dict as Record<string, unknown>)['00090010'] = { vr: 'LO', Value: [B_PRIVATE_CREATOR] };
    (dict.dict as Record<string, unknown>)['00091001'] = { vr: 'LO', Value: ['osieri-b-private-0x42'] };
  }
  return Buffer.from(dict.write());
}

export type NegativeProfileKind =
  | 'WRONG_SOP'
  | 'MONOCHROME'
  | 'BITDEPTH16'
  | 'TILED_SPARSE'
  | 'MULTI_OPTICAL_PATH';

/** CT Image Storage — a non-WSI SOP class used for the wrong-SOP negative. */
export const CT_SOP_CLASS_UID = '1.2.840.10008.5.1.4.1.1.2';

// NOTE on the "compressed transfer syntax" negative: dcmjs `DicomDict.write()` always serialises Explicit VR LE
// and stamps (0002,0010) accordingly, so it cannot emit a genuinely JPEG-encoded object without a codec (out of
// C6 scope, §3). The compressed/encapsulated → UNSUPPORTED case is therefore proven at the C1 contract level
// (a non-supported transfer syntax UID → TRANSFER_SYNTAX_UNSUPPORTED) and by the C2 decode set-membership gate.

/**
 * Build a deterministic negative-profile WSI object for the C6 negative matrix. Structurally a real DICOM
 * object (so it parses) but violating exactly one accepted-profile characteristic — proving the accepted C1/C2
 * gates classify it truthfully without any new taxonomy. Distinct construction from Fixture A.
 */
export function generateDicomWsiNegative(kind: NegativeProfileKind, opts: { studyInstanceUID?: string; seriesInstanceUID?: string; sopInstanceUID?: string; accessionNumber?: string | null } = {}): Buffer {
  const total = 16, frame = 8, per = Math.ceil(total / frame), nFrames = per * per;
  const study = opts.studyInstanceUID ?? `${B_ROOT}.900`;
  const series = opts.seriesInstanceUID ?? `${B_ROOT}.900.1`;
  const sop = opts.sopInstanceUID ?? `${B_ROOT}.900.1.1`;

  const monochrome = kind === 'MONOCHROME';
  const samples = monochrome ? 1 : 3;
  const bits = kind === 'BITDEPTH16' ? 16 : 8;
  const bytesPerSample = bits === 16 ? 2 : 1;
  const pixel = Buffer.alloc(nFrames * frame * frame * samples * bytesPerSample);

  const opticalPaths = kind === 'MULTI_OPTICAL_PATH'
    ? [{ OpticalPathIdentifier: '1' }, { OpticalPathIdentifier: '2' }]
    : [{ OpticalPathIdentifier: '1' }];

  const dataset: Record<string, unknown> = {
    _meta: {},
    SOPClassUID: kind === 'WRONG_SOP' ? CT_SOP_CLASS_UID : WSI_SOP_CLASS_UID,
    SOPInstanceUID: sop,
    StudyInstanceUID: study,
    SeriesInstanceUID: series,
    Modality: 'SM',
    DimensionOrganizationType: kind === 'TILED_SPARSE' ? 'TILED_SPARSE' : 'TILED_FULL',
    Rows: frame,
    Columns: frame,
    NumberOfFrames: String(nFrames),
    TotalPixelMatrixColumns: total,
    TotalPixelMatrixRows: total,
    SamplesPerPixel: samples,
    PhotometricInterpretation: monochrome ? 'MONOCHROME2' : 'RGB',
    PlanarConfiguration: 0,
    BitsAllocated: bits,
    BitsStored: bits === 16 ? 16 : 8,
    HighBit: bits === 16 ? 15 : 7,
    PixelRepresentation: 0,
    OpticalPathSequence: opticalPaths,
    ContainerIdentifier: 'CONT-NEG-1',
    PixelData: pixel.buffer.slice(pixel.byteOffset, pixel.byteOffset + pixel.byteLength),
  };
  if (opts.accessionNumber !== null) dataset.AccessionNumber = opts.accessionNumber ?? 'ACC-C6-A';

  const dict = new dcmjs.data.DicomDict({
    TransferSyntaxUID: EXPLICIT_VR_LE,
    MediaStorageSOPClassUID: kind === 'WRONG_SOP' ? CT_SOP_CLASS_UID : WSI_SOP_CLASS_UID,
    MediaStorageSOPInstanceUID: sop,
  });
  dict.dict = dcmjs.data.DicomMetaDictionary.denaturalizeDataset(dataset);
  return Buffer.from(dict.write());
}

/** Bytes that are not a parseable DICOM Part-10 object (no DICM magic) — for the malformed-object case. */
export function generateMalformedDicomBytes(): Buffer {
  return Buffer.from('this is not a valid DICOM part-10 object — no preamble, no DICM magic'.repeat(4), 'utf8');
}
