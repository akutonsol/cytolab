import * as fs from 'node:fs';
import * as path from 'node:path';
import * as dcmjs from 'dcmjs';
import { parseDicomWsiMetadata } from '../dicom-wsi-parser';
import { validateDicomWsiConformance } from '../dicom-conformance';
import { assessDecodeProfile } from '../dicom-wsi-decoder';
import { IMPLEMENTATION_CLASS_UID_B, IMPLEMENTATION_VERSION_NAME_B, B_PRIVATE_CREATOR } from './dicom-wsi-fixture-b';

/**
 * Program 5C · C6 — Fixture B independence + vendor/private-tag invariants.
 *
 * Reads the COMMITTED, independently-constructed Fixture B binary (ts-jest cannot run dcmjs write; the binary is
 * generated once via ts-node and checked in, mirroring the C2 Fixture-A pattern). Proves: (a) B is in-profile
 * (C1 VALID + C2 decodable); (b) B is meaningfully independent of Fixture A (distinct implementation identity,
 * UID roots, tile/matrix geometry); (c) B carries fictional vendor metadata + PHI + a private tag in its NATIVE
 * bytes, none of which reach the persisted metadata allowlist, affect conformance, or are used for routing.
 */
const fx = (n: string) => fs.readFileSync(path.join(__dirname, '__fixtures__', n));
const rawMeta = (bytes: Buffer) => {
  const dm = dcmjs.data.DicomMessage.readFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return { meta: dm.meta as Record<string, any>, dict: dm.dict as Record<string, any> };
};

describe('P5C-C6 Fixture B — independent, in-profile, vendor/private-safe', () => {
  const bBytes = fx('wsi-b.dcm');
  const aBytes = fx('wsi-valid.dcm');
  const b = parseDicomWsiMetadata(bBytes).metadata;
  const a = parseDicomWsiMetadata(aBytes).metadata;

  it('is a conformant (VALID) VL WSI object inside the C2 decode profile', () => {
    expect(validateDicomWsiConformance(b).status).toBe('VALID');
    expect(assessDecodeProfile(bBytes).supported).toBe(true);
    expect(b.sopClassUID).toBe('1.2.840.10008.5.1.4.1.1.77.1.6');
    expect(b.transferSyntaxUID).toBe('1.2.840.10008.1.2.1'); // uncompressed Explicit VR LE
  });

  it('is meaningfully independent of Fixture A (implementation identity, UID roots, geometry)', () => {
    // Distinct study/series/SOP UID roots.
    expect(b.studyInstanceUID).not.toBe(a.studyInstanceUID);
    expect(b.studyInstanceUID!.startsWith('1.2.826.0.1.3680043.2.9999.8888')).toBe(true);
    expect(a.studyInstanceUID!.startsWith('1.2.826.0.1.3680043.2.9999.8888')).toBe(false);
    // Distinct tile + total-pixel-matrix geometry.
    expect(b.frameColumns).not.toBe(a.frameColumns);
    expect(b.totalPixelMatrixColumns).not.toBe(a.totalPixelMatrixColumns);
    // Distinct implementation identity in the file-meta group (0002,0012)/(0002,0013).
    const bm = rawMeta(bBytes).meta;
    expect(bm['00020012']?.Value?.[0]).toBe(IMPLEMENTATION_CLASS_UID_B);
    expect(bm['00020013']?.Value?.[0]).toBe(IMPLEMENTATION_VERSION_NAME_B);
    const am = rawMeta(aBytes).meta;
    expect(am['00020012']?.Value?.[0]).not.toBe(IMPLEMENTATION_CLASS_UID_B);
  });

  it('carries fictional vendor metadata + PHI + a private tag in its NATIVE bytes', () => {
    // Proof the native object genuinely contains these (so the non-persistence assertion below is meaningful).
    const raw = bBytes.toString('latin1');
    expect(raw).toContain('OSIERI Synthetic Imaging'); // Manufacturer
    expect(raw).toContain('VirtualScope-B'); // ManufacturerModelName
    expect(raw).toContain('ROE^RICHARD'); // PatientName (fictional)
    expect(raw).toContain(B_PRIVATE_CREATOR); // private creator
    // The private element is present in the raw dataset dictionary.
    expect(rawMeta(bBytes).dict['00091001']?.Value?.[0]).toBe('osieri-b-private-0x42');
  });

  it('projects ONLY the allowlist — no vendor field, no PHI, no private tag reaches parsed metadata', () => {
    const j = JSON.stringify(b);
    for (const leak of ['OSIERI Synthetic Imaging', 'VirtualScope-B', 'sim-2.0', 'SN-B-0002', 'ROE^RICHARD', 'PHI-PID-B-999', 'FICTIONAL CLINIC B', 'osieri-b-private']) {
      expect(j).not.toContain(leak);
    }
    // Structural allowlist keys only — no Manufacturer/Patient/private key names.
    for (const key of Object.keys(b)) {
      expect(/manufacturer|patient|referring|institution|private|deviceserial|software/i.test(key)).toBe(false);
    }
  });

  it('conformance + decode ignore vendor/private tags (a VALID object stays VALID regardless)', () => {
    // Vendor + private tags are not inputs to the C1 contract or the C2 decode assessment.
    expect(validateDicomWsiConformance(b).reasons).toEqual([]);
    expect(assessDecodeProfile(bBytes).reasons).toEqual([]);
  });
});
