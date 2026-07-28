import { DicomWebError } from './dicomweb-errors';

/**
 * Program 5C · C3 — a minimal, byte-exact `multipart/related` parser for WADO-RS responses. It extracts the
 * `application/dicom` part body WITHOUT transformation — the returned bytes are the authoritative native DICOM
 * object used for the provenance SHA-256 and C2 ingestion. It never decodes, re-encodes, or hashes the envelope.
 */

/** Extract the multipart boundary from a Content-Type header. */
export function boundaryFromContentType(contentType: string | null): string {
  if (!contentType || !/multipart\/related/i.test(contentType)) {
    throw new DicomWebError('MALFORMED_MULTIPART', 'response is not multipart/related');
  }
  const m = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = (m?.[1] ?? m?.[2] ?? '').trim();
  if (!boundary) throw new DicomWebError('MALFORMED_MULTIPART', 'multipart boundary missing');
  return boundary;
}

interface Part {
  headers: Record<string, string>;
  body: Buffer;
}

/** Split a multipart/related body into parts (headers + exact body bytes). */
function splitParts(buf: Buffer, boundary: string): Part[] {
  const delim = Buffer.from(`--${boundary}`);
  const parts: Part[] = [];
  let idx = buf.indexOf(delim);
  if (idx < 0) throw new DicomWebError('MALFORMED_MULTIPART', 'no boundary found in body');
  while (idx >= 0) {
    let start = idx + delim.length;
    // Closing delimiter "--boundary--"
    if (buf[start] === 0x2d && buf[start + 1] === 0x2d) break;
    // Skip the CRLF after the boundary line
    if (buf[start] === 0x0d && buf[start + 1] === 0x0a) start += 2;
    else if (buf[start] === 0x0a) start += 1;
    const next = buf.indexOf(delim, start);
    if (next < 0) throw new DicomWebError('MALFORMED_MULTIPART', 'unterminated part');
    // Part = headers CRLFCRLF body; trailing CRLF before the next boundary is not part of the body.
    const headerEnd = buf.indexOf(Buffer.from('\r\n\r\n'), start);
    if (headerEnd < 0 || headerEnd > next) throw new DicomWebError('MALFORMED_MULTIPART', 'part headers missing');
    const headerText = buf.subarray(start, headerEnd).toString('latin1');
    const headers: Record<string, string> = {};
    for (const line of headerText.split('\r\n')) {
      const c = line.indexOf(':');
      if (c > 0) headers[line.slice(0, c).trim().toLowerCase()] = line.slice(c + 1).trim();
    }
    let bodyStart = headerEnd + 4;
    let bodyEnd = next;
    // Strip the single CRLF that precedes the boundary delimiter (belongs to the transport, not the body).
    if (buf[bodyEnd - 2] === 0x0d && buf[bodyEnd - 1] === 0x0a) bodyEnd -= 2;
    parts.push({ headers, body: buf.subarray(bodyStart, bodyEnd) });
    idx = next;
  }
  return parts;
}

/**
 * Return the EXACT bytes of the single `application/dicom` part. Throws MALFORMED_MULTIPART if absent or if
 * more than one DICOM part is present (a single-instance WADO retrieval is expected in C3).
 */
export function extractSingleDicomPart(buf: Buffer, contentType: string | null): Buffer {
  const boundary = boundaryFromContentType(contentType);
  const parts = splitParts(buf, boundary);
  const dicom = parts.filter((p) => /application\/dicom/i.test(p.headers['content-type'] ?? ''));
  if (dicom.length === 0) throw new DicomWebError('MALFORMED_MULTIPART', 'no application/dicom part in response');
  if (dicom.length > 1) throw new DicomWebError('MALFORMED_MULTIPART', 'more than one DICOM part (expected a single instance)');
  return Buffer.from(dicom[0].body); // a fresh copy of the exact native bytes
}
