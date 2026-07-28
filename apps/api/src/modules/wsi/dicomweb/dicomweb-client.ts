import { Injectable, Logger } from '@nestjs/common';
import { DicomWebError } from './dicomweb-errors';
import { assertOutboundUrlAllowed } from './ssrf-guard';
import { extractSingleDicomPart } from './multipart';

/**
 * Program 5C · C3 — a NARROW server-side DICOMweb client built on native fetch (mirrors the repo's fhir/
 * powertranz outbound pattern — zero new dependency). It performs ONLY the QIDO-RS discovery + WADO-RS single-
 * instance retrieval C3 needs, and preserves the native DICOM bytes byte-for-byte. Every request passes the
 * SSRF guard first (HTTPS + host allowlist + private-IP rejection), blocks redirects, times out, and caps the
 * response size. It NEVER logs credentials or full URLs (which may carry PHI in query params).
 */
export interface ResolvedDicomWebEndpoint {
  baseUrl: string;
  allowedHosts: string[];
  /** Prebuilt Authorization header (the import service decrypts the credential); undefined = no auth. */
  authHeader?: string;
}
export interface DicomWebSeriesSummary {
  studyInstanceUID: string;
  seriesInstanceUID: string;
  modality: string | null;
  accessionNumber: string | null;
  numberOfInstances: number | null;
}
export interface DicomWebInstanceSummary {
  sopInstanceUID: string;
  sopClassUID: string | null;
}

interface ClientConfig {
  timeoutMs: number;
  maxJsonBytes: number;
  maxObjectBytes: number;
  allowLoopback: boolean;
}
export function loadDicomWebConfig(): ClientConfig {
  const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    timeoutMs: num(process.env.WSI_DICOMWEB_TIMEOUT_MS, 30_000),
    maxJsonBytes: num(process.env.WSI_DICOMWEB_MAX_JSON_BYTES, 8_000_000),
    maxObjectBytes: num(process.env.WSI_DICOMWEB_MAX_OBJECT_BYTES, 3_000_000_000),
    allowLoopback: process.env.WSI_DICOMWEB_ALLOW_LOOPBACK === 'true',
  };
}

const j = (obj: Record<string, any>, tag: string): string | null => {
  const v = obj?.[tag]?.Value?.[0];
  if (v == null) return null;
  if (typeof v === 'object' && 'Alphabetic' in v) return String(v.Alphabetic); // PN value
  return String(v);
};

@Injectable()
export class DicomWebClient {
  private readonly logger = new Logger(DicomWebClient.name);
  private readonly cfg = loadDicomWebConfig();

  /** QIDO-RS series query (optionally scoped to a study/series). */
  async qidoSeries(ep: ResolvedDicomWebEndpoint, q: { studyInstanceUID?: string; seriesInstanceUID?: string; limit?: number; offset?: number }): Promise<DicomWebSeriesSummary[]> {
    const u = new URL(`${ep.baseUrl.replace(/\/$/, '')}/series`);
    if (q.studyInstanceUID) u.searchParams.set('StudyInstanceUID', q.studyInstanceUID);
    if (q.seriesInstanceUID) u.searchParams.set('SeriesInstanceUID', q.seriesInstanceUID);
    u.searchParams.set('limit', String(q.limit ?? 100));
    if (q.offset) u.searchParams.set('offset', String(q.offset));
    const json = await this.getJson(ep, u);
    if (!Array.isArray(json)) throw new DicomWebError('INVALID_QIDO_RESPONSE', 'QIDO series response is not a JSON array');
    return json.map((o) => ({
      studyInstanceUID: j(o, '0020000D') ?? '',
      seriesInstanceUID: j(o, '0020000E') ?? '',
      modality: j(o, '00080060'),
      accessionNumber: j(o, '00080050'),
      numberOfInstances: j(o, '00201209') != null ? Number(j(o, '00201209')) : null,
    }));
  }

  /** QIDO-RS instances of a series (to select the single ingestable WSI SOP instance). */
  async qidoInstances(ep: ResolvedDicomWebEndpoint, studyInstanceUID: string, seriesInstanceUID: string): Promise<DicomWebInstanceSummary[]> {
    const u = new URL(`${ep.baseUrl.replace(/\/$/, '')}/studies/${encodeURIComponent(studyInstanceUID)}/series/${encodeURIComponent(seriesInstanceUID)}/instances`);
    const json = await this.getJson(ep, u);
    if (!Array.isArray(json)) throw new DicomWebError('INVALID_QIDO_RESPONSE', 'QIDO instances response is not a JSON array');
    return json.map((o) => ({ sopInstanceUID: j(o, '00080018') ?? '', sopClassUID: j(o, '00080016') }));
  }

  /** WADO-RS single-instance retrieval → the EXACT native DICOM object bytes (never transformed). */
  async wadoRetrieveInstance(ep: ResolvedDicomWebEndpoint, studyInstanceUID: string, seriesInstanceUID: string, sopInstanceUID: string): Promise<Buffer> {
    const u = new URL(`${ep.baseUrl.replace(/\/$/, '')}/studies/${encodeURIComponent(studyInstanceUID)}/series/${encodeURIComponent(seriesInstanceUID)}/instances/${encodeURIComponent(sopInstanceUID)}`);
    const res = await this.fetchGuarded(ep, u, {
      // Request an uncompressed representation; the endpoint may ignore it (handled truthfully by C2's gate).
      Accept: 'multipart/related; type="application/dicom"; transfer-syntax=1.2.840.10008.1.2.1',
    });
    if (res.status === 404) throw new DicomWebError('SERIES_NOT_FOUND', 'WADO instance not found');
    const body = await this.readCapped(res, this.cfg.maxObjectBytes);
    return extractSingleDicomPart(body, res.headers.get('content-type'));
  }

  // ── internals ─────────────────────────────────────────────────────────────────────────────────────────
  private async getJson(ep: ResolvedDicomWebEndpoint, u: URL): Promise<unknown> {
    const res = await this.fetchGuarded(ep, u, { Accept: 'application/dicom+json' });
    if (res.status === 404) return [];
    const body = await this.readCapped(res, this.cfg.maxJsonBytes);
    try {
      return JSON.parse(body.toString('utf8'));
    } catch {
      throw new DicomWebError('INVALID_QIDO_RESPONSE', 'QIDO response was not valid JSON');
    }
  }

  private async fetchGuarded(ep: ResolvedDicomWebEndpoint, u: URL, headers: Record<string, string>): Promise<Response> {
    await assertOutboundUrlAllowed(u.toString(), { allowedHosts: ep.allowedHosts, allowLoopback: this.cfg.allowLoopback });
    let res: Response;
    try {
      res = await fetch(u, {
        method: 'GET',
        headers: { ...headers, ...(ep.authHeader ? { Authorization: ep.authHeader } : {}) },
        redirect: 'error', // block redirects (SSRF)
        signal: AbortSignal.timeout(this.cfg.timeoutMs),
      });
    } catch (e) {
      const msg = (e as Error)?.name === 'TimeoutError' || /timeout/i.test((e as Error)?.message ?? '') ? 'TIMEOUT' : null;
      if (msg) throw new DicomWebError('TIMEOUT', 'DICOMweb request timed out');
      if (/redirect/i.test((e as Error)?.message ?? '')) throw new DicomWebError('REDIRECT_REJECTED', 'redirect not permitted');
      throw new DicomWebError('ENDPOINT_UNREACHABLE', 'DICOMweb endpoint unreachable'); // never include the raw error (may leak URL/creds)
    }
    if (res.status === 401) throw new DicomWebError('AUTH_REJECTED', 'DICOMweb authentication rejected');
    if (res.status === 403) throw new DicomWebError('FORBIDDEN', 'DICOMweb authorization rejected');
    return res;
  }

  private async readCapped(res: Response, maxBytes: number): Promise<Buffer> {
    if (!res.body) return Buffer.alloc(0);
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new DicomWebError('RESPONSE_TOO_LARGE', 'DICOMweb response exceeded the size cap');
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  }
}
