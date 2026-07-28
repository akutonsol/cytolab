import {
  SUPPORTED_TRANSFER_SYNTAX_UIDS,
  VL_WHOLE_SLIDE_MICROSCOPY_SOP_CLASS_UID,
  validateDicomWsiConformance,
  type StructuredDicomMetadata,
} from './dicom-conformance';

/**
 * Program 5C · C1 — the conformance CONTRACT (pure, no parser, no DB, no side effects). Proves truthful
 * VALID / UNSUPPORTED / NONCONFORMANT verdicts with structured reasons — never a free-form log string, and
 * never a persisted slide (the validator takes only metadata and returns a verdict).
 */
const WSI = VL_WHOLE_SLIDE_MICROSCOPY_SOP_CLASS_UID;
const EXPLICIT_LE = '1.2.840.10008.1.2.1';

const validFixture = (): StructuredDicomMetadata => ({
  studyInstanceUID: '1.2.826.0.1.3680043.2.9999.1',
  seriesInstanceUID: '1.2.826.0.1.3680043.2.9999.1.1',
  representativeSopInstanceUID: '1.2.826.0.1.3680043.2.9999.1.1.1',
  sopClassUID: WSI,
  transferSyntaxUID: EXPLICIT_LE,
  totalPixelMatrixColumns: 1024,
  totalPixelMatrixRows: 1024,
  frameColumns: 256,
  frameRows: 256,
  numberOfFrames: 16, // ceil(1024/256)^2 = 16
  opticalPaths: [{ identifier: 'PATH-1' }],
});

describe('P5C-C1 validateDicomWsiConformance', () => {
  it('VALID: a conformant WSI series → VALID with no reasons', () => {
    const r = validateDicomWsiConformance(validFixture());
    expect(r.status).toBe('VALID');
    expect(r.reasons).toEqual([]);
  });

  it('UNSUPPORTED: an unsupported transfer syntax → UNSUPPORTED with a structured reason', () => {
    const r = validateDicomWsiConformance({ ...validFixture(), transferSyntaxUID: '1.2.840.10008.1.2.5' }); // RLE
    expect(r.status).toBe('UNSUPPORTED');
    const reason = r.reasons.find((x) => x.code === 'TRANSFER_SYNTAX_UNSUPPORTED')!;
    expect(reason).toBeDefined();
    expect(reason.severity).toBe('unsupported');
    expect(reason.actual).toBe('1.2.840.10008.1.2.5');
    expect(typeof reason.message).toBe('string');
    expect(SUPPORTED_TRANSFER_SYNTAX_UIDS).not.toContain('1.2.840.10008.1.2.5');
  });

  it('UNSUPPORTED: a non-WSI SOP class → UNSUPPORTED', () => {
    const r = validateDicomWsiConformance({ ...validFixture(), sopClassUID: '1.2.840.10008.5.1.4.1.1.2' }); // CT
    expect(r.status).toBe('UNSUPPORTED');
    expect(r.reasons.some((x) => x.code === 'SOP_CLASS_UNSUPPORTED')).toBe(true);
  });

  it('NONCONFORMANT: a missing required UID → NONCONFORMANT', () => {
    const r = validateDicomWsiConformance({ ...validFixture(), seriesInstanceUID: null });
    expect(r.status).toBe('NONCONFORMANT');
    expect(r.reasons.some((x) => x.code === 'MISSING_REQUIRED_UID')).toBe(true);
  });

  it('NONCONFORMANT: a malformed UID → NONCONFORMANT', () => {
    const r = validateDicomWsiConformance({ ...validFixture(), studyInstanceUID: '1.2.3.' }); // trailing dot
    expect(r.status).toBe('NONCONFORMANT');
    expect(r.reasons.some((x) => x.code === 'MALFORMED_UID')).toBe(true);
  });

  it('NONCONFORMANT: invalid geometry (non-positive) → NONCONFORMANT', () => {
    const r = validateDicomWsiConformance({ ...validFixture(), totalPixelMatrixColumns: -1 });
    expect(r.status).toBe('NONCONFORMANT');
    expect(r.reasons.some((x) => x.code === 'GEOMETRY_INVALID')).toBe(true);
  });

  it('NONCONFORMANT: NumberOfFrames below the base-level tile grid floor → NONCONFORMANT', () => {
    const r = validateDicomWsiConformance({ ...validFixture(), numberOfFrames: 4 }); // needs >= 16
    expect(r.status).toBe('NONCONFORMANT');
    const reason = r.reasons.find((x) => x.code === 'FRAME_COUNT_INVALID')!;
    expect(reason.expected).toBe('>= 16');
  });

  it('precedence: nonconformant + unsupported together → NONCONFORMANT (the stronger verdict wins)', () => {
    const r = validateDicomWsiConformance({ ...validFixture(), transferSyntaxUID: '1.2.840.10008.1.2.5', seriesInstanceUID: null });
    expect(r.status).toBe('NONCONFORMANT');
    expect(r.reasons.some((x) => x.code === 'TRANSFER_SYNTAX_UNSUPPORTED')).toBe(true);
    expect(r.reasons.some((x) => x.code === 'MISSING_REQUIRED_UID')).toBe(true);
  });

  it('is pure — every reason is structured (code+severity+message), never a bare string', () => {
    const r = validateDicomWsiConformance({ transferSyntaxUID: 'not-a-uid' });
    for (const reason of r.reasons) {
      expect(reason).toEqual(expect.objectContaining({ code: expect.any(String), severity: expect.stringMatching(/unsupported|nonconformant/), message: expect.any(String) }));
    }
  });
});
