import { Injectable } from '@nestjs/common';
import { EncryptionService } from '../../../../common/encryption.service';
import { DicomWebClient } from '../../dicomweb/dicomweb-client';
import { DicomWebError } from '../../dicomweb/dicomweb-errors';
import type { IngestionSourceHealthChecker, ResolvedIngestionSource, SourceHealthResult } from '../source-health';

/**
 * Program 5C · C5 — DICOMWEB import-connection health. Reuses the ACCEPTED C3 client (HTTPS + host allowlist +
 * private-IP rejection + redirect block + timeout + size cap + credential decrypt + redaction) to issue the
 * SMALLEST QIDO request (a series query) and validate reachability + auth + a well-formed DICOM-JSON response.
 * It NEVER invokes WADO, retrieves an instance, imports a series, persists any response, or triggers intake.
 * SSRF/credential behaviour is C3's, unchanged.
 */
@Injectable()
export class DicomWebHealthChecker implements IngestionSourceHealthChecker {
  constructor(
    private readonly client: DicomWebClient,
    private readonly encryption: EncryptionService,
  ) {}

  supports(source: ResolvedIngestionSource): boolean {
    return source.kind === 'DICOMWEB';
  }

  async check(source: ResolvedIngestionSource): Promise<SourceHealthResult> {
    const started = Date.now();
    const rt = () => ({ responseTimeMs: Date.now() - started });
    if (!source.endpointBaseUrl) return { state: 'MISCONFIGURED', errorCode: 'SOURCE_MISCONFIGURED', ...rt() };

    let authHeader: string | undefined;
    if (source.authType && source.credentialCipher) {
      try {
        const cred = this.encryption.decrypt(source.credentialCipher); // in-process only
        authHeader = source.authType === 'BEARER' ? `Bearer ${cred}` : `Basic ${Buffer.from(cred, 'utf8').toString('base64')}`;
      } catch {
        return { state: 'MISCONFIGURED', errorCode: 'SOURCE_MISCONFIGURED', ...rt() };
      }
    }
    const host = (() => { try { return new URL(source.endpointBaseUrl!).hostname; } catch { return ''; } })();
    if (!host) return { state: 'MISCONFIGURED', errorCode: 'SOURCE_MISCONFIGURED', ...rt() };

    try {
      // A minimal QIDO series query (limit=1 via the accepted client contract) — reachability + auth + shape.
      await this.client.qidoSeries({ baseUrl: source.endpointBaseUrl, allowedHosts: [host], authHeader }, { limit: 1 });
      return { state: 'HEALTHY', ...rt() };
    } catch (e) {
      if (e instanceof DicomWebError) return { ...this.mapError(e), ...rt() };
      return { state: 'UNREACHABLE', errorCode: 'CHECK_INTERNAL_ERROR', ...rt() };
    }
  }

  private mapError(e: DicomWebError): { state: SourceHealthResult['state']; errorCode: SourceHealthResult['errorCode'] } {
    switch (e.code) {
      case 'HOST_NOT_ALLOWED':
        return { state: 'MISCONFIGURED', errorCode: 'DICOMWEB_HOST_REJECTED' };
      case 'AUTH_REJECTED':
      case 'FORBIDDEN':
        return { state: 'AUTH_REJECTED', errorCode: 'DICOMWEB_AUTH_REJECTED' };
      case 'TIMEOUT':
        return { state: 'UNREACHABLE', errorCode: 'HEALTH_CHECK_TIMEOUT' };
      case 'INVALID_QIDO_RESPONSE':
      case 'MALFORMED_MULTIPART':
        return { state: 'MISCONFIGURED', errorCode: 'DICOMWEB_INVALID_RESPONSE' };
      case 'REDIRECT_REJECTED':
        return { state: 'MISCONFIGURED', errorCode: 'DICOMWEB_HOST_REJECTED' };
      default:
        return { state: 'UNREACHABLE', errorCode: 'DICOMWEB_UNREACHABLE' };
    }
  }
}
