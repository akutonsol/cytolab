import { extractSingleDicomPart } from './multipart';
import { DicomWebError } from './dicomweb-errors';

/** Program 5C · C3 — byte-exact multipart/related extraction of the single application/dicom part. */
function buildMultipart(boundary: string, parts: Array<{ type: string; body: Buffer }>): Buffer {
  const chunks: Buffer[] = [];
  for (const p of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Type: ${p.type}\r\n\r\n`, 'latin1'));
    chunks.push(p.body);
    chunks.push(Buffer.from('\r\n', 'latin1'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'latin1'));
  return Buffer.concat(chunks);
}

describe('P5C-C3 extractSingleDicomPart', () => {
  const ct = 'multipart/related; type="application/dicom"; boundary=BND';

  it('returns the EXACT native DICOM bytes of the single dicom part', () => {
    const native = Buffer.from([0x44, 0x49, 0x43, 0x4d, 0x00, 0xff, 0x10, 0x99]); // arbitrary binary
    const body = buildMultipart('BND', [{ type: 'application/dicom', body: native }]);
    const out = extractSingleDicomPart(body, ct);
    expect(out.equals(native)).toBe(true); // byte-for-byte, no transformation
  });

  it('throws when there is no application/dicom part', () => {
    const body = buildMultipart('BND', [{ type: 'application/json', body: Buffer.from('{}') }]);
    expect(() => extractSingleDicomPart(body, ct)).toThrow(DicomWebError);
  });

  it('throws when more than one dicom part is present (single-instance expected)', () => {
    const body = buildMultipart('BND', [
      { type: 'application/dicom', body: Buffer.from([1, 2, 3]) },
      { type: 'application/dicom', body: Buffer.from([4, 5, 6]) },
    ]);
    expect(() => extractSingleDicomPart(body, ct)).toThrow(DicomWebError);
  });

  it('throws MALFORMED_MULTIPART for a non-multipart content type', () => {
    expect(() => extractSingleDicomPart(Buffer.from('x'), 'application/dicom')).toThrow(DicomWebError);
  });
});
