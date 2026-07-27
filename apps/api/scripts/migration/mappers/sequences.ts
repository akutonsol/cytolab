/**
 * Post-load LabSequence seeding.
 *
 * App-generated identifiers (patient registration numbers, client account
 * numbers, monthly record lab numbers) come from per-lab `LabSequence` counters.
 * A fresh lab starts each counter at its base; but after importing legacy data
 * those counters are still at base, so the NEXT app-generated id would collide
 * with an imported one. This stage seeds each counter to the maximum value
 * already present in the imported target tables, so the app resumes numbering
 * ABOVE the legacy high-water mark. Idempotent: re-running only ever raises a
 * counter (GREATEST), never lowers it.
 *
 * Counters keyed on `LEG-…` strings (requisition referenceNo, requisition line
 * item ref) live in a disjoint namespace from the app's numeric ids and cannot
 * collide, so they need no seeding.
 */
import { randomUUID } from 'crypto';
import { EtlContext } from '../core/context';

/** Raise (never lower) a lab counter to `value`; next allocation returns value+1. */
async function seedSequence(ctx: EtlContext, name: string, value: bigint): Promise<void> {
  await ctx.prisma.$executeRaw`
    INSERT INTO "LabSequence" ("id", "labId", "name", "value", "updatedAt")
    VALUES (${randomUUID()}, ${ctx.labId}, ${name}, ${value}, now())
    ON CONFLICT ("labId", "name")
    DO UPDATE SET "value" = GREATEST("LabSequence"."value", EXCLUDED."value"), "updatedAt" = now();
  `;
}

/** MAX of a purely-numeric text column, or null when no numeric values exist. */
async function maxNumeric(ctx: EtlContext, table: string, column: string): Promise<bigint | null> {
  const rows = await ctx.prisma.$queryRawUnsafe<{ max: bigint | null }[]>(
    `SELECT MAX(("${column}")::bigint) AS max FROM "${table}" WHERE "labId" = $1 AND "${column}" ~ '^[0-9]+$'`,
    ctx.labId,
  );
  return rows[0]?.max ?? null;
}

export async function seedSequencesStage(ctx: EtlContext): Promise<void> {
  if (ctx.dryRun) {
    ctx.log('sequences: (dry-run) skipped');
    return;
  }

  // patientRegNo — Patient.registrationNo (numeric legacy values; LEG-* ignored).
  const maxRegNo = await maxNumeric(ctx, 'Patient', 'registrationNo');
  if (maxRegNo !== null) {
    await seedSequence(ctx, 'patientRegNo', maxRegNo);
    ctx.log(`sequences: patientRegNo -> ${maxRegNo}`);
  }

  // clientAccountNo — Client.accountNo (numeric legacy values; WS-* ignored).
  const maxAcct = await maxNumeric(ctx, 'Client', 'accountNo');
  if (maxAcct !== null) {
    await seedSequence(ctx, 'clientAccountNo', maxAcct);
    ctx.log(`sequences: clientAccountNo -> ${maxAcct}`);
  }

  // recordLabNo:{YYYY}-{MM} — one monthly-reset counter per year-month. The app
  // formats lab numbers as {PREFIX}{YY}-{MM}-{seq} where PREFIX derives from the
  // lab slug; only imported numbers in that exact shape can collide, so seed each
  // month's counter to the max sequence seen for that month.
  const lab = await ctx.prisma.lab.findUnique({ where: { id: ctx.labId }, select: { slug: true } });
  const prefix = (lab?.slug ?? 'lab').replace(/[^a-z0-9]/gi, '').slice(0, 3).toUpperCase() || 'LAB';
  const labNoRe = new RegExp(`^${prefix}(\\d{2})-(\\d{2})-(\\d+)`);

  const records = await ctx.prisma.record.findMany({
    where: { labId: ctx.labId, labNumber: { not: null } },
    select: { labNumber: true },
  });
  const monthMax = new Map<string, bigint>();
  for (const r of records) {
    const m = r.labNumber?.match(labNoRe);
    if (!m) continue;
    const key = `recordLabNo:20${m[1]}-${m[2]}`;
    const seq = BigInt(m[3]);
    const prev = monthMax.get(key);
    if (prev === undefined || seq > prev) monthMax.set(key, seq);
  }
  for (const [name, value] of monthMax) {
    await seedSequence(ctx, name, value);
    ctx.log(`sequences: ${name} -> ${value}`);
  }
  if (monthMax.size === 0) {
    ctx.log(`sequences: no ${prefix}YY-MM-N lab numbers imported — recordLabNo counters unchanged`);
  }
}
