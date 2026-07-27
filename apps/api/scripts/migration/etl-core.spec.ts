/**
 * Unit tests for the ETL core — the layer we can prove locally with fakes (no
 * real database): the id-map (determinism + aliasing), reconciliation math and
 * report artifact, patient identity de-duplication, and identifier counter
 * seeding. The DB-touching engine wiring runs inside the customer cloud.
 */
import { mkdtemp, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

// The identity fingerprint is an HMAC keyed on ENCRYPTION_KEY — set before any
// import that transitively pulls in the crypto module.
process.env.ENCRYPTION_KEY = 'a'.repeat(64);

import { IdMap, MemoryIdMapStore, deterministicUuid } from './core/id-map';
import { buildReport, formatReport, writeReportArtifact } from './core/reconcile';
import { patientStage } from './mappers/patient';
import { seedSequencesStage } from './mappers/sequences';
import type { EtlContext } from './core/context';

describe('id-map', () => {
  it('is deterministic and uuid-shaped', () => {
    const a = deterministicUuid('patient', 42);
    const b = deterministicUuid('patient', 42);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(deterministicUuid('patient', 43)).not.toBe(a);
    expect(deterministicUuid('record', 42)).not.toBe(a);
  });

  it('an alias overrides the deterministic id for FK resolution', async () => {
    const idMap = new IdMap(new MemoryIdMapStore());
    await idMap.set('patient', 2, deterministicUuid('patient', 1)); // 2 is a dup of 1
    expect(await idMap.require('patient', 2)).toBe(deterministicUuid('patient', 1));
    // an un-aliased id still resolves to its own deterministic uuid
    expect(await idMap.require('patient', 3)).toBe(deterministicUuid('patient', 3));
  });
});

describe('reconcile', () => {
  it('OK only when counts reconcile AND no orphans', () => {
    const rows = [{ table: 'patient', source: 10, target: 9, skipped: 1 }];
    expect(buildReport(rows).ok).toBe(true);
    expect(buildReport(rows, [{ relation: 'Record.patientId -> Patient', orphans: 0 }]).ok).toBe(true);
    expect(buildReport(rows, [{ relation: 'Record.patientId -> Patient', orphans: 3 }]).ok).toBe(false);
    expect(buildReport([{ table: 'patient', source: 10, target: 8 }]).ok).toBe(false);
  });

  it('formats counts, integrity and the verdict', () => {
    const text = formatReport(
      buildReport(
        [{ table: 'patient', source: 10, target: 9, skipped: 1, note: '1 identity duplicates merged' }],
        [{ relation: 'Record.patientId -> Patient', orphans: 0 }],
      ),
    );
    expect(text).toContain('patient');
    expect(text).toContain('referential integrity');
    expect(text).toContain('RESULT: ALL OK');
  });

  it('persists a report artifact', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'recon-'));
    process.env.MIGRATION_REPORT_DIR = dir;
    const path = await writeReportArtifact(buildReport([{ table: 'patient', source: 1, target: 1 }]), '2026-07-26T00:00:00Z');
    expect(path).toBe(join(dir, 'recon-2026-07-26T00-00-00Z.txt'));
    expect(await readFile(path, 'utf8')).toContain('RESULT: ALL OK');
    delete process.env.MIGRATION_REPORT_DIR;
  });
});

// ── Fakes for stage-level tests ────────────────────────────────────────────

function fakeLegacy(rows: Record<string, unknown>[]) {
  return {
    async *stream() {
      yield rows;
    },
    async count() {
      return rows.length;
    },
  };
}

function baseCtx(over: Partial<EtlContext>): EtlContext {
  return {
    labId: 'lab-1',
    accountId: 'acct-1',
    workspaceId: 'ws-1',
    dryRun: false,
    incremental: false,
    bulk: true,
    log: () => undefined,
    recon: [],
    ...over,
  } as EtlContext;
}

describe('patient identity de-duplication', () => {
  const dup = { firstname: 'María', lastname: "O'Brien", gender: 'Female', dateofbirth: '1990-05-14' };

  it('keeps the first, aliases duplicates to it, and skips their rows', async () => {
    const legacyRows = [
      { id: 1, ...dup, registrationno: '10000001' },
      { id: 2, firstname: 'maria', lastname: 'obrien', gender: 'Female', dateofbirth: '1990-05-14T09:00:00Z', registrationno: '10000002' }, // dup of 1
      { id: 3, firstname: 'John', lastname: 'Roe', gender: 'Male', dateofbirth: '1980-01-01', registrationno: '10000003' }, // distinct
    ];
    const created: any[] = [];
    const prisma = { patient: { createMany: async ({ data }: any) => created.push(...data) } };
    const idMap = new IdMap(new MemoryIdMapStore());
    const recon: any[] = [];
    const ctx = baseCtx({ legacy: fakeLegacy(legacyRows) as any, prisma: prisma as any, idMap, recon });

    await patientStage(ctx);

    // Only 2 rows written (patient 2 skipped as a duplicate).
    expect(created).toHaveLength(2);
    expect(created.every((r) => typeof r.identityKey === 'string')).toBe(true);
    // Patient 2's records will resolve onto patient 1 (the survivor).
    expect(await idMap.require('patient', 2)).toBe(deterministicUuid('patient', 1));
    // Patient 3 keeps its own identity.
    expect(await idMap.require('patient', 3)).toBe(deterministicUuid('patient', 3));
    // Reconciliation accounts for the merge.
    expect(recon[0]).toMatchObject({ table: 'patient', source: 3, target: 2, skipped: 1 });
  });

  it('does not dedup rows with insufficient identity (no dob, no national id)', async () => {
    const legacyRows = [
      { id: 1, firstname: 'A', lastname: 'B', registrationno: 'r1' },
      { id: 2, firstname: 'A', lastname: 'B', registrationno: 'r2' }, // same name, but no dob → null key
    ];
    const created: any[] = [];
    const prisma = { patient: { createMany: async ({ data }: any) => created.push(...data) } };
    const recon: any[] = [];
    const ctx = baseCtx({ legacy: fakeLegacy(legacyRows) as any, prisma: prisma as any, idMap: new IdMap(new MemoryIdMapStore()), recon });

    await patientStage(ctx);

    expect(created).toHaveLength(2);
    expect(created.every((r) => r.identityKey === null)).toBe(true);
    expect(recon[0]).toMatchObject({ target: 2, skipped: 0 });
  });
});

describe('sequence seeding', () => {
  it('seeds patientRegNo and per-month recordLabNo above the imported max', async () => {
    const seeded: { name: string; value: bigint }[] = [];
    const prisma = {
      $queryRawUnsafe: async (sql: string) =>
        sql.includes('"Patient"') ? [{ max: 10_050_000n }] : [{ max: null }],
      lab: { findUnique: async () => ({ slug: 'cytolabs' }) }, // prefix -> CYT
      record: {
        findMany: async () => [
          { labNumber: 'CYT24-05-007' },
          { labNumber: 'CYT24-05-012' },
          { labNumber: 'CYT24-06-003' },
          { labNumber: 'OLD24-05-999' }, // different prefix — must be ignored
          { labNumber: 'garbage' },
        ],
      },
      $executeRaw: async (_strings: TemplateStringsArray, ..._vals: unknown[]) => 0,
    };
    // Capture seedSequence's parameters by intercepting the tagged-template call.
    (prisma as any).$executeRaw = async (_s: TemplateStringsArray, ...vals: unknown[]) => {
      seeded.push({ name: vals[2] as string, value: vals[3] as bigint });
      return 0;
    };
    const ctx = baseCtx({ prisma: prisma as any });

    await seedSequencesStage(ctx);

    const byName = Object.fromEntries(seeded.map((s) => [s.name, s.value]));
    expect(byName['patientRegNo']).toBe(10_050_000n);
    expect(byName['recordLabNo:2024-05']).toBe(12n);
    expect(byName['recordLabNo:2024-06']).toBe(3n);
    expect(byName['clientAccountNo']).toBeUndefined(); // no numeric account nos
    expect(seeded.some((s) => s.value === 999n)).toBe(false); // OLD-prefixed ignored
  });

  it('is a no-op in dry-run', async () => {
    let touched = false;
    const prisma = { $queryRawUnsafe: async () => { touched = true; return [{ max: null }]; } };
    await seedSequencesStage(baseCtx({ prisma: prisma as any, dryRun: true }));
    expect(touched).toBe(false);
  });
});
