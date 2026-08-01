import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { SCIM_CONTENT_TYPE, SCIM_ERROR_SCHEMA } from './scim.constants';

/**
 * Program 7 · Phase 7B.3 — an RFC 7644 §3.12 SCIM error. Carries a fixed, non-heuristic `scimType` + `detail` + HTTP
 * status. Every conflict/validation path throws one of these so the response is a deterministic SCIM error document,
 * never a heuristic reconciliation and never a raw framework error body. `detail` is a bounded, value-free message —
 * it NEVER embeds the raw SCIM payload, a token, a password, an email, or PHI.
 */
export class ScimException extends HttpException {
  constructor(status: HttpStatus, detail: string, scimType?: string) {
    super({ schemas: [SCIM_ERROR_SCHEMA], ...(scimType ? { scimType } : {}), detail, status: String(status) }, status);
  }
}

/**
 * Renders ANY exception thrown on a SCIM route (including guard 401/403 and validation 400) as the RFC 7644 error
 * schema with `Content-Type: application/scim+json`. A `ScimException` is rendered verbatim; any other HttpException is
 * mapped to the SCIM error envelope preserving its status; a non-HTTP error becomes a 500 with a value-free detail
 * (never the raw message — no payload/PHI leakage).
 */
@Catch()
export class ScimExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: Record<string, unknown> = { schemas: [SCIM_ERROR_SCHEMA], detail: 'internal error', status: String(status) };

    if (exception instanceof ScimException) {
      status = exception.getStatus();
      body = exception.getResponse() as Record<string, unknown>;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const raw = exception.getResponse();
      // Map framework/guard errors into the SCIM envelope WITHOUT echoing arbitrary raw content (bounded detail only).
      const detail =
        status === HttpStatus.UNAUTHORIZED ? 'authentication required'
        : status === HttpStatus.FORBIDDEN ? 'insufficient scope'
        : status === HttpStatus.NOT_FOUND ? 'resource not found'
        : typeof raw === 'object' && raw !== null && typeof (raw as { error?: unknown }).error === 'string' ? (raw as { error: string }).error
        : 'request could not be processed';
      body = { schemas: [SCIM_ERROR_SCHEMA], detail, status: String(status) };
    }

    res.status(status).type(SCIM_CONTENT_TYPE).json(body);
  }
}
