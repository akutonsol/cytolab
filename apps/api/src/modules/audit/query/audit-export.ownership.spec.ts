import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * P2-9A ownership guard — the export path is a governed EGRESS boundary, not a second query. It must
 * reuse the frozen AuditQueryService and NEVER touch Prisma, build a query, or paginate by offset.
 */
const EXPORT_IMPL = [
  'audit-export.coordinator.ts',
  'audit-export.assembler.ts',
  'audit-export.serializer.ts',
  'audit-export.filter-class.ts',
  'audit-export.controller.ts',
  'dto/audit-export.dto.ts',
];

const read = (f: string) => readFileSync(join(__dirname, f), 'utf8');

describe('P2-9A export ownership — no second query, no Prisma', () => {
  it.each(EXPORT_IMPL)('%s does not import Prisma or the PrismaService', (f) => {
    const src = read(f);
    expect(src).not.toMatch(/@prisma\/client/);
    expect(src).not.toMatch(/PrismaService/);
    expect(src).not.toMatch(/prisma\./);
  });

  it.each(EXPORT_IMPL)('%s builds no Prisma query and no offset pagination', (f) => {
    const src = read(f);
    expect(src).not.toMatch(/findMany|findFirst|findUnique|queryRaw/);
    expect(src).not.toMatch(/\b(offset|skip)\b\s*:/); // no offset/skip pagination
    expect(src).not.toMatch(/auditEvent\b/); // never references the Prisma model
  });

  it('the coordinator reuses AuditQueryService (composition over the frozen reader)', () => {
    const src = read('audit-export.coordinator.ts');
    expect(src).toMatch(/AuditQueryService/);
    expect(src).toMatch(/this\.query\.list\(/); // assembles via the frozen public read method
  });

  it('the transactional capture lives in the recorder, not the export path', () => {
    // No export file opens a transaction itself; capture goes through the recorder helper.
    for (const f of EXPORT_IMPL) {
      expect(read(f)).not.toMatch(/\$transaction/);
    }
    expect(read('audit-export.coordinator.ts')).toMatch(/recordAuditExported/);
  });
});
