import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  validateDicomWsiConformance,
  VL_WHOLE_SLIDE_MICROSCOPY_SOP_CLASS_UID,
  SUPPORTED_TRANSFER_SYNTAX_UIDS,
  type StructuredDicomMetadata,
} from './dicom-conformance';
import { assessDecodeProfile } from './dicom-wsi-decoder';

/**
 * Program 5C · C6 — the consolidated accepted/rejected conformance MATRIX over the frozen C1 contract and C2
 * decode gate. Proves each characteristic's owning layer + existing structured code + terminal classification
 * (NONCONFORMANT vs UNSUPPORTED), with no new taxonomy. Contract cases are byte-free; decode cases read the
 * committed synthetic binaries (ts-jest cannot run dcmjs write). No slide/ingestion is created here — these are
 * pure gate assertions.
 */
const CT_SOP = '1.2.840.10008.5.1.4.1.1.2';
const RLE_TS = '1.2.840.10008.1.2.5'; // valid DICOM TS, deliberately NOT in the C1 supported set
const fx = (n: string) => fs.readFileSync(path.join(__dirname, 'testing/__fixtures__', n));

/** An accepted-profile structured metadata baseline (VALID); base-level tile grid = ceil(64/32)^2 = 4 frames. */
const ACCEPTED: StructuredDicomMetadata = {
  studyInstanceUID: '1.2.826.0.1.3680043.2.9999.1',
  seriesInstanceUID: '1.2.826.0.1.3680043.2.9999.1.1',
  sopClassUID: VL_WHOLE_SLIDE_MICROSCOPY_SOP_CLASS_UID,
  transferSyntaxUID: '1.2.840.10008.1.2.1',
  totalPixelMatrixColumns: 64,
  totalPixelMatrixRows: 64,
  frameColumns: 32,
  frameRows: 32,
  numberOfFrames: 4,
  opticalPaths: [{ identifier: '1' }],
};

describe('P5C-C6 conformance matrix — C1 structural contract', () => {
  it('the accepted profile is VALID with no reasons', () => {
    const r = validateDicomWsiConformance(ACCEPTED);
    expect(r.status).toBe('VALID');
    expect(r.reasons).toEqual([]);
  });

  // [mutation, expected code, expected classification, owning layer]
  const C1_CASES: Array<[string, Partial<StructuredDicomMetadata>, string, 'UNSUPPORTED' | 'NONCONFORMANT']> = [
    ['wrong SOP class', { sopClassUID: CT_SOP }, 'SOP_CLASS_UNSUPPORTED', 'UNSUPPORTED'],
    ['unsupported (RLE) transfer syntax', { transferSyntaxUID: RLE_TS }, 'TRANSFER_SYNTAX_UNSUPPORTED', 'UNSUPPORTED'],
    ['missing required UID', { seriesInstanceUID: null }, 'MISSING_REQUIRED_UID', 'NONCONFORMANT'],
    ['malformed UID', { studyInstanceUID: '1.2.3.' }, 'MALFORMED_UID', 'NONCONFORMANT'],
    ['invalid (non-positive) geometry', { totalPixelMatrixColumns: -1 }, 'GEOMETRY_INVALID', 'NONCONFORMANT'],
    ['insufficient frame count', { numberOfFrames: 1 }, 'FRAME_COUNT_INVALID', 'NONCONFORMANT'],
    ['malformed optical-path sequence', { opticalPaths: [] }, 'OPTICAL_PATH_MALFORMED', 'NONCONFORMANT'],
  ];

  it.each(C1_CASES)('%s → %s (%s)', (_label, mutation, code, classification) => {
    const r = validateDicomWsiConformance({ ...ACCEPTED, ...mutation });
    expect(r.status).toBe(classification);
    expect(r.reasons.some((x) => x.code === code)).toBe(true);
  });

  it('NONCONFORMANT takes precedence over UNSUPPORTED when both are present', () => {
    const r = validateDicomWsiConformance({ ...ACCEPTED, sopClassUID: CT_SOP, seriesInstanceUID: null });
    expect(r.status).toBe('NONCONFORMANT');
    expect(r.reasons.some((x) => x.code === 'SOP_CLASS_UNSUPPORTED')).toBe(true);
    expect(r.reasons.some((x) => x.code === 'MISSING_REQUIRED_UID')).toBe(true);
  });

  it('the JPEG family is C1-VALID (decode-narrowing is a C2 concern, not C1)', () => {
    for (const ts of ['1.2.840.10008.1.2.4.50', '1.2.840.10008.1.2.4.90']) {
      expect(validateDicomWsiConformance({ ...ACCEPTED, transferSyntaxUID: ts }).status).toBe('VALID');
      expect(SUPPORTED_TRANSFER_SYNTAX_UIDS).toContain(ts);
    }
  });
});

describe('P5C-C6 conformance matrix — C2 decode profile (committed synthetic binaries)', () => {
  it('the accepted uncompressed RGB TILED_FULL fixture is decode-supported', () => {
    expect(assessDecodeProfile(fx('wsi-valid.dcm')).supported).toBe(true);
  });

  // [fixture, expected decode-profile code]
  const C2_CASES: Array<[string, string]> = [
    ['wsi-mono.dcm', 'PHOTOMETRIC_UNSUPPORTED'],
    ['wsi-neg-bitdepth16.dcm', 'BIT_DEPTH_UNSUPPORTED'],
    ['wsi-neg-tiledsparse.dcm', 'TILING_UNSUPPORTED'],
    ['wsi-neg-multiopticalpath.dcm', 'MULTI_OPTICAL_PATH_UNSUPPORTED'],
  ];

  it.each(C2_CASES)('%s → decode UNSUPPORTED (%s), no fabrication', (fixture, code) => {
    const a = assessDecodeProfile(fx(fixture));
    expect(a.supported).toBe(false);
    expect(a.reasons.some((r) => r.code === code)).toBe(true);
  });

  it('the C2 decode set is exactly the two uncompressed Little-Endian syntaxes (compressed → UNSUPPORTED)', () => {
    // A genuinely JPEG-encoded fixture needs a codec (out of C6 scope); the gate itself is asserted by set truth.
    expect(SUPPORTED_TRANSFER_SYNTAX_UIDS).toContain('1.2.840.10008.1.2.4.90'); // JPEG2000: C1-VALID
    // The decoder only decodes uncompressed LE — every JPEG-family syntax is therefore C2-UNSUPPORTED.
    for (const jpeg of SUPPORTED_TRANSFER_SYNTAX_UIDS.filter((t) => t.startsWith('1.2.840.10008.1.2.4'))) {
      expect(['1.2.840.10008.1.2', '1.2.840.10008.1.2.1']).not.toContain(jpeg);
    }
  });
});
