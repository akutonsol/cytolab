import {
  serializeAuditExportCsv,
  serializeAuditExportNdjson,
  auditExportCsvColumns,
  ExportableAuditEvent,
} from './audit-export.serializer';
import { AuditEventPhiView, AuditEventView } from './audit-query.types';

/** The frozen certified leaf-field manifest (order is part of the contract). */
const EXPECTED_BASE_COLUMNS = [
  'id', 'occurredAt', 'recordedAt', 'schemaVersion', 'eventVersion', 'category', 'actionCode',
  'severity', 'dataClass', 'phiIndicator', 'outcome', 'actor.type', 'actor.id', 'organization.scope',
  'organization.labId', 'organization.organizationId', 'resource.type', 'resource.id',
  'request.requestId', 'session.sessionId', 'correlationId', 'producerModule', 'metadataStatus', 'metadata',
];

function view(overrides: Partial<AuditEventView> = {}): AuditEventView {
  return {
    id: 'evt-1',
    occurredAt: new Date('2026-07-18T10:00:00.000Z'),
    recordedAt: new Date('2026-07-18T10:00:01.000Z'),
    schemaVersion: 1,
    eventVersion: 1,
    category: 'SECURITY',
    actionCode: 'ACCOUNT_UNLOCKED',
    severity: 'NOTICE',
    dataClass: 'CONFIDENTIAL',
    phiIndicator: false,
    outcome: 'SUCCESS',
    actor: { type: 'USER', id: 'user-1' },
    organization: { scope: 'LAB', labId: 'lab-1', organizationId: null },
    resource: { type: 'User', id: 'user-2' },
    request: { requestId: 'req-1' },
    session: { sessionId: null },
    correlationId: 'corr-1',
    producerModule: 'security',
    metadataStatus: 'included',
    metadata: { terminationScope: 'all', terminatedCount: 3 },
    ...overrides,
  } as AuditEventView;
}

const parseCsv = (csv: string) => csv.replace(/\r\n$/, '').split('\r\n');

describe('P2-9A serializer — CSV certified leaf-field manifest', () => {
  it('emits exactly the frozen base columns in order (no extra, none omitted)', () => {
    expect(auditExportCsvColumns('base').map((c) => c.column)).toEqual(EXPECTED_BASE_COLUMNS);
    const header = parseCsv(serializeAuditExportCsv([], 'base'))[0];
    expect(header).toBe(EXPECTED_BASE_COLUMNS.join(','));
  });

  it('appends patientRef exactly once for the PHI projection', () => {
    expect(auditExportCsvColumns('phi').map((c) => c.column)).toEqual([...EXPECTED_BASE_COLUMNS, 'patientRef']);
  });

  it('renders scalar/Date/boolean cells and canonical (sorted-key) metadata JSON', () => {
    const rows = parseCsv(serializeAuditExportCsv([view()], 'base'));
    const cells = rows[1].split(',');
    expect(cells[0]).toBe('evt-1');
    expect(cells[1]).toBe('2026-07-18T10:00:00.000Z'); // occurredAt ISO
    expect(cells[9]).toBe('false'); // phiIndicator boolean
    // metadata is the last base column; keys sorted deterministically.
    expect(rows[1]).toContain('"{""terminatedCount"":3,""terminationScope"":""all""}"');
  });

  it('leaves absent optional fields empty rather than synthesizing them', () => {
    const rows = parseCsv(serializeAuditExportCsv([view({ session: { sessionId: null }, metadata: null })], 'base'));
    const cells = rows[1].split(',');
    expect(cells[19]).toBe(''); // session.sessionId
    expect(cells[EXPECTED_BASE_COLUMNS.indexOf('metadata')]).toBe(''); // null metadata → empty, not "null"
  });

  it('base export never exposes a patientRef value even if the object carries one', () => {
    const phiObj = { ...view(), patientRef: 'pt-secret' } as AuditEventPhiView;
    const csv = serializeAuditExportCsv([phiObj], 'base');
    expect(csv).not.toContain('pt-secret');
  });

  it('PHI export uses only the returned patientRef (empty when null)', () => {
    const withRef = { ...view(), patientRef: 'pt-9' } as AuditEventPhiView;
    const nullRef = { ...view(), patientRef: null } as AuditEventPhiView;
    const rows = parseCsv(serializeAuditExportCsv([withRef, nullRef], 'phi'));
    expect(rows[1].split(',').pop()).toBe('pt-9');
    expect(rows[2].split(',').pop()).toBe('');
  });

  it('neutralizes spreadsheet formula injection', () => {
    const evil = view({ actionCode: '=cmd|/c calc', resource: { type: '+SUM(A1)', id: '@x' } });
    const csv = serializeAuditExportCsv([evil], 'base');
    expect(csv).toContain(`"'=cmd|/c calc"`); // leading = neutralized with apostrophe + quoted
    expect(csv).toContain(`"'+SUM(A1)"`);
    expect(csv).toContain(`"'@x"`);
  });

  it('escapes embedded quotes/commas and terminates with CRLF', () => {
    const q = view({ producerModule: 'a,"b"' });
    const csv = serializeAuditExportCsv([q], 'base');
    expect(csv).toContain('"a,""b"""');
    expect(csv.endsWith('\r\n')).toBe(true);
  });
});

describe('P2-9A serializer — NDJSON', () => {
  it('emits one line per event, each structurally equivalent to the certified DTO', () => {
    const items: ExportableAuditEvent[] = [view(), view({ id: 'evt-2' })];
    const lines = serializeAuditExportNdjson(items).trimEnd().split('\n');
    expect(lines).toHaveLength(2);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.id).toBe('evt-1');
    expect(parsed.occurredAt).toBe('2026-07-18T10:00:00.000Z'); // Date → ISO, as the HTTP API serializes
    expect(parsed.metadata).toEqual({ terminationScope: 'all', terminatedCount: 3 });
    expect(parsed).not.toHaveProperty('patientRef'); // base projection carries no patientRef
  });

  it('includes patientRef for the PHI projection input', () => {
    const line = serializeAuditExportNdjson([{ ...view(), patientRef: 'pt-1' } as AuditEventPhiView]).trimEnd();
    expect(JSON.parse(line).patientRef).toBe('pt-1');
  });

  it('produces an empty string for a zero-row export', () => {
    expect(serializeAuditExportNdjson([])).toBe('');
  });
});
