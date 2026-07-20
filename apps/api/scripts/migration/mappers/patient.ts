/**
 * Patient mapper — the reviewed TEMPLATE all other entity mappers follow.
 *
 * Pattern:
 *   1. stream legacy rows in batches (incremental-aware),
 *   2. resolve id via idMap.getOrCreate (stable uuid, idempotent),
 *   3. resolve FKs via idMap.require/optional,
 *   4. build the typed Osieri payload (coercions + enum/money transforms),
 *   5. upsert on the natural unique key (safe to re-run + nightly sync),
 *   6. count for reconciliation.
 *
 * DB writes are gated by ctx.dryRun so a dry-run exercises the whole transform
 * without touching the target. Runs inside the customer cloud (PHI stays local).
 */
import { EtlContext } from '../core/context';
import { flush } from '../core/writer';
import { cleanString, parseDate } from '../transforms/coerce';
import { mapGender } from '../transforms/enums';

interface LegacyPatient {
  id: number;
  firstname: string;
  lastname: string;
  middlename: string | null;
  phonenumber: string | null;
  bloodgroup: string | null;
  gender: string | null;
  height: number | null;
  weight: number | null;
  email: string | null;
  dateofbirth: Date | string | null;
  identity_token: string | null;
  mothermaidenname: string | null;
  registrationno: string | null;
  workspace_id: number | null;
  datecreated: Date | string | null;
  dateupdated: Date | string | null;
}

export async function patientStage(ctx: EtlContext): Promise<void> {
  const { legacy, prisma, idMap, labId } = ctx;
  let count = 0;

  for await (const batch of legacy.stream<LegacyPatient>('patient', { incremental: ctx.incremental })) {
    const ops: unknown[] = [];
    for (const row of batch) {
      const id = await idMap.getOrCreate('patient', row.id);
      // workspace_id -> the paired Osieri Client (see mapping §3). Optional: a
      // handful of legacy patients have no workspace.
      const clientId = await idMap.optional('workspace', row.workspace_id);
      const registrationNo = cleanString(row.registrationno) ?? `LEG-${row.id}`;

      const data = {
        id,
        labId,
        registrationNo,
        firstName: cleanString(row.firstname) ?? 'Unknown',
        lastName: cleanString(row.lastname) ?? 'Unknown',
        middleName: cleanString(row.middlename),
        phoneNumber: cleanString(row.phonenumber),
        bloodGroup: cleanString(row.bloodgroup),
        gender: mapGender(row.gender) as 'Male' | 'Female' | null,
        height: row.height ?? null,
        weight: row.weight ?? null,
        email: cleanString(row.email),
        dateOfBirth: parseDate(row.dateofbirth),
        identityToken: cleanString(row.identity_token),
        motherMaidenName: cleanString(row.mothermaidenname),
        clientId,
        createdAt: parseDate(row.datecreated) ?? undefined,
      };

      if (!ctx.dryRun) {
        ops.push(
          prisma.patient.upsert({ where: { labId_registrationNo: { labId, registrationNo } }, create: data, update: data }),
        );
      }
      count++;
    }
    await flush(ctx, ops);
    ctx.log(`  patient: ${count} processed`);
  }

  const source = await legacy.count('patient', ctx.incremental);
  ctx.recon.push({ table: 'patient', source, target: count });
}
