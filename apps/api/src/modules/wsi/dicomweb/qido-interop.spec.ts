import * as http from 'node:http';
import { DicomWebClient, type ResolvedDicomWebEndpoint } from './dicomweb-client';
import { DicomWebError } from './dicomweb-errors';

/**
 * Program 5C · C6 — QIDO-RS interoperability CHARACTERISATION. Proves the accepted C3 client discovers a series
 * using ONLY standard tags and the DICOM+JSON response shape, tolerating benign standards-compliant variation:
 * omitted optional attributes, reordered keys, extra standard attributes, extra PRIVATE attributes, and PN
 * `Alphabetic` value wrapping. Manufacturer/vendor fields are never used for selection. This does NOT add
 * automatic pagination and does NOT widen the accepted single-page behaviour — it characterises what exists.
 */
const uid = (v: string) => ({ vr: 'UI', Value: [v] });

async function serve(body: unknown): Promise<{ ep: ResolvedDicomWebEndpoint; close: () => Promise<void> }> {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/dicom+json' }).end(JSON.stringify(body));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return {
    ep: { baseUrl: `http://127.0.0.1:${port}/dicomweb`, allowedHosts: ['127.0.0.1'] },
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

describe('P5C-C6 QIDO interoperability characterisation', () => {
  let client: DicomWebClient;
  beforeAll(() => {
    process.env.WSI_DICOMWEB_ALLOW_LOOPBACK = 'true'; // permit the in-process 127.0.0.1 test server
    client = new DicomWebClient();
  });

  it('extracts study/series across benign standards-compliant QIDO variations', async () => {
    const S = '1.2.826.0.1.3680043.2.9999.6.1';
    const series = [
      // (a) minimal — only the two identity UIDs present (optional attributes omitted)
      { '0020000D': uid(`${S}.a`), '0020000E': uid(`${S}.a.1`) },
      // (b) reordered keys + Modality present
      { '00080060': { vr: 'CS', Value: ['SM'] }, '0020000E': uid(`${S}.b.1`), '0020000D': uid(`${S}.b`) },
      // (c) extra STANDARD attributes (StudyDate, NumberOfSeriesRelatedInstances, AccessionNumber)
      { '0020000D': uid(`${S}.c`), '0020000E': uid(`${S}.c.1`), '00080020': { vr: 'DA', Value: ['20260101'] }, '00201209': { vr: 'IS', Value: ['1'] }, '00080050': { vr: 'SH', Value: ['ACC-C6-Q'] } },
      // (d) extra PRIVATE attributes present (must be ignored, not break parsing)
      { '0020000D': uid(`${S}.d`), '0020000E': uid(`${S}.d.1`), '00090010': { vr: 'LO', Value: ['ACME_PRIVATE'] }, '00091001': { vr: 'LO', Value: ['x'] } },
      // (e) PN value wrapped as { Alphabetic } (ReferringPhysicianName) — must not disturb identity extraction
      { '0020000D': uid(`${S}.e`), '0020000E': uid(`${S}.e.1`), '00080090': { vr: 'PN', Value: [{ Alphabetic: 'DOE^JANE' }] } },
      // (f) a Manufacturer field present — never used for selection
      { '0020000D': uid(`${S}.f`), '0020000E': uid(`${S}.f.1`), '00080070': { vr: 'LO', Value: ['Some Vendor'] } },
    ];
    const { ep, close } = await serve(series);
    try {
      const out = await client.qidoSeries(ep, { limit: 10 });
      expect(out.map((s) => s.studyInstanceUID)).toEqual([`${S}.a`, `${S}.b`, `${S}.c`, `${S}.d`, `${S}.e`, `${S}.f`]);
      expect(out.map((s) => s.seriesInstanceUID)).toEqual([`${S}.a.1`, `${S}.b.1`, `${S}.c.1`, `${S}.d.1`, `${S}.e.1`, `${S}.f.1`]);
      // Optional standard fields when present are surfaced; when omitted they are null (never invented).
      expect(out[0].modality).toBeNull();
      expect(out[1].modality).toBe('SM');
      expect(out[2].accessionNumber).toBe('ACC-C6-Q');
      expect(out[2].numberOfInstances).toBe(1);
      expect(out[0].accessionNumber).toBeNull();
    } finally {
      await close();
    }
  });

  it('a non-array QIDO body is a deterministic INVALID_QIDO_RESPONSE', async () => {
    const { ep, close } = await serve({ not: 'an array' });
    try {
      await expect(client.qidoSeries(ep, {})).rejects.toMatchObject({ code: 'INVALID_QIDO_RESPONSE' });
    } finally {
      await close();
    }
    expect(new DicomWebError('INVALID_QIDO_RESPONSE', 'x').code).toBe('INVALID_QIDO_RESPONSE');
  });
});
