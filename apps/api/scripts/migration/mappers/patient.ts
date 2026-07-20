/**
 * Patient mapper — the reviewed TEMPLATE all other entity mappers follow.
 *
 * Pattern: stream legacy rows in batches; resolve id + FKs via the deterministic
 * idMap; build the typed Osieri payload (coercions + enum transforms); collect
 * the batch and flush it in ONE round-trip via writeBatch (createMany on a full
 * load, upsert on incremental). Runs inside the customer cloud (PHI stays local).
 */
import { EtlContext } from '../core/context';
import { writeBatch, UpsertRow } from '../core/writer';
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
  const { legacy, idMap, labId } = ctx;
  let count = 0;

  for await (const batch of legacy.stream<LegacyPatient>('patient', { incremental: ctx.incremental })) {
    const rows: UpsertRow[] = [];
    for (const row of batch) {
      const id = await idMap.getOrCreate('patient', row.id);
      // workspace_id -> the paired Osieri Client (mapping §3). Optional: a handful
      // of legacy patients have no workspace.
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
      rows.push({ where: { labId_registrationNo: { labId, registrationNo } }, data });
      count++;
    }
    await writeBatch(ctx, 'patient', rows);
    ctx.log(`  patient: ${count} processed`);
  }

  const source = await legacy.count('patient', ctx.incremental);
  ctx.recon.push({ table: 'patient', source, target: count });
}
