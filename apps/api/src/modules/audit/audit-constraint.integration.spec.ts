import { PrismaClient } from '@prisma/client';
import { createTestPrisma } from '@test/test-database';

/**
 * Program 2 · P2-1R — database-layer verification of the organization-scope CHECK
 * constraint. Uses a RAW PrismaClient (no tenancy extension, no owner validation) to prove
 * the invariant is enforced by the database itself, not only by TypeScript. Invalid
 * combinations must be rejected even if a script bypasses AuditPersistenceService.
 *
 * Requires the local/test Postgres (the same DB the migration was applied to).
 */
const prisma = createTestPrisma();
const MARKER = 'p2-1r-constraint-test';

function baseRow(overrides: Record<string, unknown>) {
  return {
    occurredAt: new Date(),
    eventVersion: 1,
    category: 'SYSTEM' as const,
    severity: 'INFO' as const,
    dataClass: 'INTERNAL' as const,
    retentionClass: 'STANDARD' as const,
    durabilityClass: 'OPERATIONAL' as const,
    actorType: 'SYSTEM' as const,
    organizationScope: 'SYSTEM' as const,
    resourceType: 'Test',
    actionCode: 'CONSTRAINT_PROBE',
    outcome: 'SUCCESS' as const,
    producerModule: MARKER,
    changedFields: [],
    ...overrides,
  };
}

afterAll(async () => {
  await prisma.auditEvent.deleteMany({ where: { producerModule: MARKER } });
  await prisma.$disconnect();
});

describe('AuditEvent organization-scope CHECK constraint (database layer)', () => {
  it('accepts LAB with a scopeLabId', async () => {
    const created = await prisma.auditEvent.create({
      data: baseRow({ organizationScope: 'LAB', scopeLabId: 'lab-1' }),
      select: { id: true },
    });
    expect(created.id).toBeTruthy();
  });

  it('accepts SYSTEM and CROSS_LAB with a null scopeLabId', async () => {
    const sys = await prisma.auditEvent.create({
      data: baseRow({ organizationScope: 'SYSTEM', scopeLabId: null }),
      select: { id: true },
    });
    const cross = await prisma.auditEvent.create({
      data: baseRow({ organizationScope: 'CROSS_LAB', scopeLabId: null }),
      select: { id: true },
    });
    expect(sys.id).toBeTruthy();
    expect(cross.id).toBeTruthy();
  });

  it('REJECTS LAB without a scopeLabId', async () => {
    await expect(
      prisma.auditEvent.create({
        data: baseRow({ organizationScope: 'LAB', scopeLabId: null }),
      }),
    ).rejects.toThrow();
  });

  it('REJECTS SYSTEM carrying a scopeLabId (no sentinel tenant)', async () => {
    await expect(
      prisma.auditEvent.create({
        data: baseRow({ organizationScope: 'SYSTEM', scopeLabId: 'lab-1' }),
      }),
    ).rejects.toThrow();
  });

  it('REJECTS CROSS_LAB carrying a scopeLabId', async () => {
    await expect(
      prisma.auditEvent.create({
        data: baseRow({ organizationScope: 'CROSS_LAB', scopeLabId: 'lab-1' }),
      }),
    ).rejects.toThrow();
  });
});
