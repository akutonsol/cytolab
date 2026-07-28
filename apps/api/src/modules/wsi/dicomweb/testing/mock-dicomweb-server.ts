import * as http from 'node:http';

/**
 * Program 5C · C3 — a TINY deterministic in-process DICOMweb server for tests/acceptance (NOT a production
 * path). Serves QIDO-RS (series + instances, DICOM JSON) and WADO-RS (multipart/related; type=application/dicom)
 * for a fixed catalog of instances, optionally behind a Bearer token. No external PACS, no internet dependency.
 */
export interface MockInstance {
  studyInstanceUID: string;
  seriesInstanceUID: string;
  sopInstanceUID: string;
  sopClassUID: string;
  bytes: Buffer; // the exact native DICOM object bytes served by WADO
}
export interface MockDicomWebServer {
  baseUrl: string; // e.g. http://127.0.0.1:PORT/dicomweb
  close: () => Promise<void>;
}

const uid = (v: string) => ({ vr: 'UI', Value: [v] });

export async function startMockDicomWebServer(opts: { instances: MockInstance[]; bearerToken?: string }): Promise<MockDicomWebServer> {
  const { instances, bearerToken } = opts;
  const server = http.createServer((req, res) => {
    if (bearerToken && req.headers['authorization'] !== `Bearer ${bearerToken}`) {
      res.writeHead(401).end('unauthorized');
      return;
    }
    const url = new URL(req.url ?? '/', 'http://mock');
    const path = url.pathname.replace(/^\/dicomweb/, '');

    // QIDO series: /series
    if (path === '/series') {
      const seen = new Set<string>();
      const out: unknown[] = [];
      for (const i of instances) {
        const key = `${i.studyInstanceUID}/${i.seriesInstanceUID}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ '0020000D': uid(i.studyInstanceUID), '0020000E': uid(i.seriesInstanceUID), '00080060': { vr: 'CS', Value: ['SM'] } });
      }
      res.writeHead(200, { 'content-type': 'application/dicom+json' }).end(JSON.stringify(out));
      return;
    }

    // QIDO instances: /studies/{study}/series/{series}/instances
    let m = path.match(/^\/studies\/([^/]+)\/series\/([^/]+)\/instances$/);
    if (m) {
      const [study, series] = [decodeURIComponent(m[1]), decodeURIComponent(m[2])];
      const out = instances
        .filter((i) => i.studyInstanceUID === study && i.seriesInstanceUID === series)
        .map((i) => ({ '00080018': uid(i.sopInstanceUID), '00080016': uid(i.sopClassUID) }));
      res.writeHead(200, { 'content-type': 'application/dicom+json' }).end(JSON.stringify(out));
      return;
    }

    // WADO instance: /studies/{study}/series/{series}/instances/{sop}
    m = path.match(/^\/studies\/([^/]+)\/series\/([^/]+)\/instances\/([^/]+)$/);
    if (m) {
      const [study, series, sop] = m.slice(1).map(decodeURIComponent);
      const inst = instances.find((i) => i.studyInstanceUID === study && i.seriesInstanceUID === series && i.sopInstanceUID === sop);
      if (!inst) {
        res.writeHead(404).end('not found');
        return;
      }
      const boundary = 'MOCKBND';
      const head = Buffer.from(`--${boundary}\r\nContent-Type: application/dicom\r\n\r\n`, 'latin1');
      const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'latin1');
      res.writeHead(200, { 'content-type': `multipart/related; type="application/dicom"; boundary=${boundary}` });
      res.end(Buffer.concat([head, inst.bytes, tail]));
      return;
    }

    res.writeHead(404).end('not found');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}/dicomweb`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
