import {
  classifyAuditExportError,
  AUDIT_EXPORT_ERROR_COPY,
  parseContentDispositionFilename,
  safeExportFilename,
  exportFilenameFallback,
} from './audit-export';
import { filtersToExportBody, AuditFilterState } from './audit-filters';

jest.mock('../api', () => ({ api: { get: jest.fn(), post: jest.fn() } }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { api } = require('../api');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AuditQueryClient } = require('./audit-query-client');

const base = (over: Partial<AuditFilterState> = {}): AuditFilterState => ({ pageSize: 50, phi: false, ...over });

describe('P2-9B — filtersToExportBody (predicate reuse; cursor/pageSize/phi excluded)', () => {
  it('maps the predicate + explicit format/projection; excludes cursor, pageSize, and phi', () => {
    const body = filtersToExportBody(
      base({ phi: true, scope: 'SYSTEM', labIds: ['l1', 'l2'], category: ['SECURITY'], actionCode: ['AUDIT_EXPORTED'], actorId: 'u1', timeFrom: '2026-07-01T00:00:00Z' }),
      { format: 'ndjson', projection: 'base' },
    );
    expect(body).toEqual({
      format: 'ndjson',
      projection: 'base',
      scope: 'system',
      labIds: ['l1', 'l2'],
      category: ['SECURITY'],
      actionCode: ['AUDIT_EXPORTED'],
      actorId: 'u1',
      timeFrom: '2026-07-01T00:00:00Z',
    });
    expect(body).not.toHaveProperty('phi'); // projection is the single source of truth
    expect(body).not.toHaveProperty('pageSize');
    expect(body).not.toHaveProperty('cursor');
  });

  it('carries an explicit PHI projection independently of the list phi flag', () => {
    expect(filtersToExportBody(base({ phi: false }), { format: 'csv', projection: 'phi' }).projection).toBe('phi');
    expect(filtersToExportBody(base({ phi: true }), { format: 'csv', projection: 'base' }).projection).toBe('base');
  });

  it('omits empty predicate fields', () => {
    expect(filtersToExportBody(base(), { format: 'csv', projection: 'base' })).toEqual({ format: 'csv', projection: 'base' });
  });
});

describe('P2-9B — error classification (status only; generic copy)', () => {
  it('maps status → kind', () => {
    expect(classifyAuditExportError({ response: { status: 403 } })).toBe('forbidden');
    expect(classifyAuditExportError({ response: { status: 400 } })).toBe('invalid');
    expect(classifyAuditExportError({ response: { status: 404 } })).toBe('concealed');
    expect(classifyAuditExportError({ response: { status: 500 } })).toBe('failed');
    expect(classifyAuditExportError(new Error('network'))).toBe('failed');
    expect(classifyAuditExportError(null)).toBe('failed');
  });

  it('failure copy never mentions internals and says no file was produced', () => {
    expect(AUDIT_EXPORT_ERROR_COPY.failed).toMatch(/no file was produced/i);
    for (const copy of Object.values(AUDIT_EXPORT_ERROR_COPY)) {
      expect(copy.toLowerCase()).not.toMatch(/chain|sequence|r-016|registry|transaction|database|prisma|stack/);
    }
  });
});

describe('P2-9B — filename safety', () => {
  it('parses filename and filename* from Content-Disposition', () => {
    expect(parseContentDispositionFilename('attachment; filename="audit-export-base.csv"')).toBe('audit-export-base.csv');
    expect(parseContentDispositionFilename("attachment; filename*=UTF-8''audit-export-phi.ndjson")).toBe('audit-export-phi.ndjson');
    expect(parseContentDispositionFilename(null)).toBeNull();
    expect(parseContentDispositionFilename('attachment')).toBeNull();
  });

  it('accepts a safe name matching the requested format', () => {
    expect(safeExportFilename('audit-export-base.csv', { format: 'csv', projection: 'base' })).toBe('audit-export-base.csv');
    expect(safeExportFilename('audit-export-phi.ndjson', { format: 'ndjson', projection: 'phi' })).toBe('audit-export-phi.ndjson');
  });

  it('falls back deterministically for unsafe, mismatched, or missing names', () => {
    const req = { format: 'csv', projection: 'base' } as const;
    const fb = exportFilenameFallback(req);
    expect(fb).toBe('audit-export-base.csv');
    expect(safeExportFilename(null, req)).toBe(fb);
    expect(safeExportFilename('../../etc/passwd', req)).toBe(fb); // path traversal
    expect(safeExportFilename('a/b.csv', req)).toBe(fb); // path separator
    expect(safeExportFilename('evil.ndjson', req)).toBe(fb); // wrong extension for the requested format
    expect(safeExportFilename('name with spaces.csv', req)).toBe(fb); // disallowed chars
    expect(safeExportFilename(`${'x'.repeat(200)}.csv`, req)).toBe(fb); // too long
  });
});

describe('P2-9B — AuditQueryClient.exportAuditEvents (sole transport)', () => {
  beforeEach(() => (api.post as jest.Mock).mockReset());

  it('POSTs the export body as a blob and returns filename + truncation from headers', async () => {
    (api.post as jest.Mock).mockResolvedValue({
      data: new Blob(['id\r\n'], { type: 'text/csv' }),
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="audit-export-base.csv"',
        'x-audit-export-truncated': 'false',
      },
    });
    const result = await AuditQueryClient.exportAuditEvents(base({ category: ['SECURITY'] }), { format: 'csv', projection: 'base' });
    expect(api.post).toHaveBeenCalledWith(
      '/audit/events/export',
      { format: 'csv', projection: 'base', category: ['SECURITY'] },
      { responseType: 'blob' },
    );
    expect(result.filename).toBe('audit-export-base.csv');
    expect(result.truncated).toBe(false);
    expect(result.contentType).toContain('text/csv');
  });

  it('parses a truthful truncation header', async () => {
    (api.post as jest.Mock).mockResolvedValue({
      data: new Blob(['x']),
      headers: { 'x-audit-export-truncated': 'true', 'content-type': 'application/x-ndjson' },
    });
    const r = await AuditQueryClient.exportAuditEvents(base(), { format: 'ndjson', projection: 'base' });
    expect(r.truncated).toBe(true);
    expect(r.filename).toBe('audit-export-base.ndjson'); // no Content-Disposition → deterministic fallback
  });

  it('propagates the axios error (caller classifies by status; body never read)', async () => {
    (api.post as jest.Mock).mockRejectedValue({ response: { status: 403 } });
    await expect(AuditQueryClient.exportAuditEvents(base(), { format: 'csv', projection: 'phi' })).rejects.toEqual({ response: { status: 403 } });
  });
});
