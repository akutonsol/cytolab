import * as dcmjs from 'dcmjs';

/**
 * Program 5C · C2 — TEST/ACCEPTANCE fixture generator (not a production code path).
 *
 * Builds a real, deterministic, binary VL Whole Slide Microscopy Image Storage object with dcmjs — small,
 * self-generated (no proprietary/downloaded data), and legally safe. The default profile matches the
 * probe-proven C2 profile: Explicit VR Little Endian (uncompressed), RGB, TILED_FULL, single optical path.
 * PHI tags are included by default so tests can prove the adapter/persistence never leak them.
 */
export const WSI_SOP_CLASS_UID = '1.2.840.10008.5.1.4.1.1.77.1.6';
export const EXPLICIT_VR_LE = '1.2.840.10008.1.2.1';

export interface DicomWsiFixtureOptions {
  studyInstanceUID?: string;
  seriesInstanceUID?: string;
  sopInstanceUID?: string;
  sopClassUID?: string;
  transferSyntaxUID?: string;
  accessionNumber?: string | null;
  totalPixelMatrix?: number; // square, default 512
  frameSize?: number; // square, default 256
  objectiveLensPower?: number;
  includePHI?: boolean;
  photometricInterpretation?: string; // default RGB
}

const COLORS = [[220, 40, 40], [40, 180, 40], [40, 40, 200], [210, 200, 40], [120, 60, 160], [60, 160, 160]];

/** Generate the raw DICOM bytes for a WSI series (TILED_FULL, uncompressed RGB by default). */
export function generateDicomWsiBytes(opts: DicomWsiFixtureOptions = {}): Buffer {
  const total = opts.totalPixelMatrix ?? 512;
  const frame = opts.frameSize ?? 256;
  const per = Math.ceil(total / frame);
  const nFrames = per * per;
  const samples = (opts.photometricInterpretation ?? 'RGB') === 'MONOCHROME2' ? 1 : 3;

  const pixel = Buffer.alloc(nFrames * frame * frame * samples);
  for (let f = 0; f < nFrames; f++) {
    const c = COLORS[f % COLORS.length];
    const base = f * frame * frame * samples;
    for (let p = 0; p < frame * frame; p++) {
      const o = base + p * samples;
      for (let s = 0; s < samples; s++) pixel[o + s] = c[s % 3];
    }
  }

  const dataset: Record<string, unknown> = {
    _meta: {},
    SOPClassUID: opts.sopClassUID ?? WSI_SOP_CLASS_UID,
    SOPInstanceUID: opts.sopInstanceUID ?? '1.2.826.0.1.3680043.2.9999.100.1.1',
    StudyInstanceUID: opts.studyInstanceUID ?? '1.2.826.0.1.3680043.2.9999.100',
    SeriesInstanceUID: opts.seriesInstanceUID ?? '1.2.826.0.1.3680043.2.9999.100.1',
    Modality: 'SM',
    DimensionOrganizationType: 'TILED_FULL',
    Rows: frame,
    Columns: frame,
    NumberOfFrames: String(nFrames),
    TotalPixelMatrixColumns: total,
    TotalPixelMatrixRows: total,
    SamplesPerPixel: samples,
    PhotometricInterpretation: opts.photometricInterpretation ?? 'RGB',
    PlanarConfiguration: 0,
    BitsAllocated: 8,
    BitsStored: 8,
    HighBit: 7,
    PixelRepresentation: 0,
    // Objective power lives in the (single) optical path — the correct DICOM location, not a top-level tag.
    OpticalPathSequence: [{ OpticalPathIdentifier: '1', ObjectiveLensPower: opts.objectiveLensPower ?? 20 }],
    ContainerIdentifier: 'CONT-1',
    PixelData: pixel.buffer.slice(pixel.byteOffset, pixel.byteOffset + pixel.byteLength),
  };
  if (opts.accessionNumber !== null) dataset.AccessionNumber = opts.accessionNumber ?? 'ACC-DICOM-1';
  if (opts.includePHI !== false) {
    Object.assign(dataset, {
      PatientName: 'DOE^JANE',
      PatientID: 'PHI-PID-123',
      PatientBirthDate: '19700101',
      PatientSex: 'F',
      StudyDate: '20260101',
      ReferringPhysicianName: 'SMITH^JOHN',
      InstitutionName: 'SECRET HOSPITAL',
    });
  }

  const dict = new dcmjs.data.DicomDict({
    TransferSyntaxUID: opts.transferSyntaxUID ?? EXPLICIT_VR_LE,
    MediaStorageSOPClassUID: (opts.sopClassUID ?? WSI_SOP_CLASS_UID),
    MediaStorageSOPInstanceUID: (opts.sopInstanceUID ?? '1.2.826.0.1.3680043.2.9999.100.1.1'),
  });
  dict.dict = dcmjs.data.DicomMetaDictionary.denaturalizeDataset(dataset);
  const ab = dict.write();
  return Buffer.from(ab);
}
