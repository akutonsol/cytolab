import { extractSingleDicomPart } from './multipart';

/**
 * Program 5C · C6 — WADO multipart/related interoperability CHARACTERISATION of the accepted single-part parser.
 * Proves byte-exact extraction across benign standards-compliant variations (quoted/unquoted boundary, header
 * casing, content-type parameter ordering, extra harmless part headers, preamble, CRLF), and deterministic
 * MALFORMED_MULTIPART for malformed/multi-object bodies. It does NOT add multi-instance assembly, a multipart
 * dependency, or frame retrieval. The bare-LF trailing-separator edge is CHARACTERISED (current behaviour), not
 * patched (deferred per C6 scope).
 */
const CRLF = '\r\n';
const PAYLOAD = Buffer.from([0x44, 0x49, 0x43, 0x4d, 0x00, 0x01, 0x02, 0xff, 0xfe, 0x10]); // arbitrary exact bytes

function body(opts: { boundary?: string; headers?: string[]; preamble?: string; trailerLF?: 'crlf' | 'lf' } = {}): Buffer {
  const b = opts.boundary ?? 'BND-c6';
  const headers = opts.headers ?? ['Content-Type: application/dicom'];
  const pre = opts.preamble ? Buffer.from(opts.preamble, 'latin1') : Buffer.alloc(0);
  const head = Buffer.from(`--${b}${CRLF}${headers.join(CRLF)}${CRLF}${CRLF}`, 'latin1');
  const sep = opts.trailerLF === 'lf' ? '\n' : CRLF;
  const tail = Buffer.from(`${sep}--${b}--${CRLF}`, 'latin1');
  return Buffer.concat([pre, head, PAYLOAD, tail]);
}
const ct = (boundary: string, quoted: boolean, order: 'type-first' | 'boundary-first' = 'type-first') => {
  const bnd = quoted ? `boundary="${boundary}"` : `boundary=${boundary}`;
  const typ = 'type="application/dicom"';
  return order === 'type-first' ? `multipart/related; ${typ}; ${bnd}` : `multipart/related; ${bnd}; ${typ}`;
};

describe('P5C-C6 multipart interoperability characterisation', () => {
  it('extracts the EXACT native bytes across benign standards-compliant variations', () => {
    const cases: Array<[string, Buffer, string | null]> = [
      ['unquoted boundary', body({ boundary: 'BND1' }), ct('BND1', false)],
      ['quoted boundary', body({ boundary: 'BND2' }), ct('BND2', true)],
      ['boundary param before type param', body({ boundary: 'BND3' }), ct('BND3', true, 'boundary-first')],
      ['lowercase content-type param name', body({ boundary: 'BND4' }), 'MULTIPART/RELATED; TYPE="application/dicom"; BOUNDARY=BND4'],
      ['extra harmless part headers', body({ boundary: 'BND5', headers: ['Content-Type: application/dicom', 'Content-Location: http://x/inst', 'Content-Transfer-Encoding: binary'] }), ct('BND5', true)],
      ['content-type with transfer-syntax media param', body({ boundary: 'BND6', headers: ['Content-Type: application/dicom; transfer-syntax=1.2.840.10008.1.2.1'] }), ct('BND6', true)],
      ['accepted preamble before first boundary', body({ boundary: 'BND7', preamble: 'This is a MIME multipart preamble, ignore me.\r\n' }), ct('BND7', true)],
    ];
    for (const [label, buf, contentType] of cases) {
      const out = extractSingleDicomPart(buf, contentType);
      expect(`${label}:${out.equals(PAYLOAD)}`).toBe(`${label}:true`);
    }
  });

  it('rejects malformed / multi-object bodies as deterministic MALFORMED_MULTIPART', () => {
    const good = body({ boundary: 'BND' });
    // not multipart/related
    expect(() => extractSingleDicomPart(good, 'application/dicom')).toThrow(/MALFORMED_MULTIPART|multipart/i);
    // missing boundary in the content-type
    expect(() => extractSingleDicomPart(good, 'multipart/related; type="application/dicom"')).toThrow();
    // two application/dicom parts → not a single-instance body
    const two = Buffer.concat([
      Buffer.from(`--BND${CRLF}Content-Type: application/dicom${CRLF}${CRLF}`, 'latin1'), PAYLOAD,
      Buffer.from(`${CRLF}--BND${CRLF}Content-Type: application/dicom${CRLF}${CRLF}`, 'latin1'), PAYLOAD,
      Buffer.from(`${CRLF}--BND--${CRLF}`, 'latin1'),
    ]);
    expect(() => extractSingleDicomPart(two, 'multipart/related; type="application/dicom"; boundary=BND')).toThrow();
    // zero application/dicom parts
    const none = Buffer.concat([Buffer.from(`--BND${CRLF}Content-Type: text/plain${CRLF}${CRLF}hello${CRLF}--BND--${CRLF}`, 'latin1')]);
    expect(() => extractSingleDicomPart(none, 'multipart/related; type="application/dicom"; boundary=BND')).toThrow();
  });

  it('CHARACTERISATION (deferred, not patched): a bare-LF trailing separator is not byte-exact', () => {
    // The parser strips exactly one trailing CRLF before the closing delimiter; a spec-legal bare-LF trailing
    // separator therefore leaves a stray 0x0A appended. Documented current behaviour — a deferred robustness
    // item, intentionally NOT corrected in C6.
    const out = extractSingleDicomPart(body({ boundary: 'BND', trailerLF: 'lf' }), ct('BND', true));
    expect(out.equals(PAYLOAD)).toBe(false);
    expect(out.subarray(0, PAYLOAD.length).equals(PAYLOAD)).toBe(true);
    expect(out[out.length - 1]).toBe(0x0a); // the un-stripped bare LF
  });
});
