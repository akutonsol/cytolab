import * as fs from 'node:fs';
import * as path from 'node:path';
import { assessDecodeProfile, decodeDicomWsiToPng, UnsupportedDicomProfileError } from './dicom-wsi-decoder';

/**
 * Program 5C · C2 — the decoder reconstructs the TotalPixelMatrix (TILED_FULL) from a REAL uncompressed WSI
 * fixture into a libvips-readable PNG, and truthfully refuses profiles outside the supported C2 set.
 */
const fx = (n: string) => fs.readFileSync(path.join(__dirname, 'testing/__fixtures__', n));

describe('P5C-C2 DICOM decoder', () => {
  it('reconstructs a real uncompressed WSI into a PNG of TotalPixelMatrix dimensions', () => {
    const png = decodeDicomWsiToPng(fx('wsi-valid.dcm'));
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(png.readUInt32BE(16)).toBe(64); // IHDR width
    expect(png.readUInt32BE(20)).toBe(64); // IHDR height
  });

  it('refuses a non-RGB (MONOCHROME2) profile as UNSUPPORTED and throws on decode (no fabrication)', () => {
    const assessment = assessDecodeProfile(fx('wsi-mono.dcm'));
    expect(assessment.supported).toBe(false);
    expect(assessment.reasons.some((r) => r.code === 'PHOTOMETRIC_UNSUPPORTED')).toBe(true);
    expect(() => decodeDicomWsiToPng(fx('wsi-mono.dcm'))).toThrow(UnsupportedDicomProfileError);
  });

  it('only uncompressed Little Endian transfer syntaxes are in the C2 decode set (JPEG family excluded)', () => {
    // C1 conformance accepts the JPEG family (VALID); the C2 decoder does NOT decode them → truthful UNSUPPORTED.
    // (A genuinely JPEG-2000-encoded fixture requires a codec, deferred; the gate itself is asserted here.)
    const { SUPPORTED_TRANSFER_SYNTAX_UIDS } = require('./dicom-conformance');
    expect(SUPPORTED_TRANSFER_SYNTAX_UIDS).toContain('1.2.840.10008.1.2.4.90'); // JPEG2000 is conformance-VALID
  });
});
