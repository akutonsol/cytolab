/**
 * Patient mapper — the reviewed TEMPLATE all other entity mappers follow.
 *
 * Pattern: stream legacy rows in batches; resolve id + FKs via the deterministic
 * idMap; build the typed Osieri payload (coercions + enum transforms); collect
 * the batch and flush it in ONE round-trip via writeBatch (createMany on a full
 * load, upsert on incremental). Runs inside the customer cloud (PHI stays local).
 *
 * IDENTITY DE-DUPLICATION (one real-world patient => one row, many records):
 * legacy data holds the same person under multiple rows (repeat visits captured
 * as fresh patients, different registration numbers). We collapse them here using
 * the SAME fingerprint the app uses at runtime (computeIdentityKey): the FIRST
 * legacy row for an identity is the survivor; each later duplicate is ALIASED to
 * the survivor's uuid in the idMap and NOT inserted, so the record mapper's
 * `require('patient', ...)` resolves the duplicate's records onto the survivor.
 *
 * ⚠️ The ETL MUST run with the SAME `ENCRYPTION_KEY` as the target app — the key
 * is HMAC input, so a mismatched key yields identity fingerprints that never line
 * up with app-generated ones, and a returning patient would duplicate after
 * cutover. (Also required for computeIdentityKey to run at all.)
 */
import { EtlContext } from '../core/context';
import { writeBatch, UpsertRow } from '../core/writer';
import { deterministicUuid } from '../core/id-map';
import { cleanString, parseDate } from '../transforms/coerce';
import { mapGender } from '../transforms/enums';
import { computeIdentityKey } from '../../../src/common/util/patient-identity';

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
  let deduped = 0;
  // identityKey -> survivor patient uuid, for duplicates seen earlier in THIS run.
  const identityToUuid = new Map<string, string>();

  for await (const batch of legacy.stream<LegacyPatient>('patient', { incremental: ctx.incremental })) {
    const rows: UpsertRow[] = [];
    for (const row of batch) {
      // Compute the fingerprint from the RAW names (no 'Unknown' fallback) so
      // nameless rows resolve to a null key and are never merged on a placeholder.
      const firstName = cleanString(row.firstname);
      const lastName = cleanString(row.lastname);
      const gender = mapGender(row.gender) as 'Male' | 'Female' | null;
      const dateOfBirth = parseDate(row.dateofbirth);
      const identityToken = cleanString(row.identity_token);
      const identityKey = computeIdentityKey({ firstName, lastName, dateOfBirth, gender, identityToken });

      // Identity resolution: is this a duplicate of an already-kept patient?
      if (identityKey) {
        let survivor = identityToUuid.get(identityKey);
        // Incremental runs may not have re-streamed the survivor this pass — look
        // it up in the target DB it was written to on the original full load.
        if (!survivor && ctx.incremental) {
          const existing = await ctx.prisma.patient.findFirst({
            where: { labId, identityKey },
            select: { id: true },
          });
          if (existing) {
            survivor = existing.id;
            identityToUuid.set(identityKey, survivor);
          }
        }
        // A survivor that is a DIFFERENT legacy row (not this patient re-syncing
        // itself) => real duplicate: alias its future FKs to the survivor, skip it.
        if (survivor && survivor !== deterministicUuid('patient', row.id)) {
          await idMap.set('patient', row.id, survivor);
          deduped++;
          continue;
        }
      }

      const id = await idMap.getOrCreate('patient', row.id);
      if (identityKey) identityToUuid.set(identityKey, id);
      // workspace_id -> the paired Osieri Client (mapping §3). Optional: a handful
      // of legacy patients have no workspace.
      const clientId = await idMap.optional('workspace', row.workspace_id);
      const registrationNo = cleanString(row.registrationno) ?? `LEG-${row.id}`;
      const data = {
        id,
        labId,
        registrationNo,
        identityKey,
        firstName: firstName ?? 'Unknown',
        lastName: lastName ?? 'Unknown',
        middleName: cleanString(row.middlename),
        phoneNumber: cleanString(row.phonenumber),
        bloodGroup: cleanString(row.bloodgroup),
        gender,
        height: row.height ?? null,
        weight: row.weight ?? null,
        email: cleanString(row.email),
        dateOfBirth,
        identityToken,
        motherMaidenName: cleanString(row.mothermaidenname),
        clientId,
        createdAt: parseDate(row.datecreated) ?? undefined,
      };
      rows.push({ where: { labId_registrationNo: { labId, registrationNo } }, data });
      count++;
    }
    await writeBatch(ctx, 'patient', rows);
    ctx.log(`  patient: ${count} kept, ${deduped} deduped`);
  }

  const source = await legacy.count('patient', ctx.incremental);
  ctx.recon.push({
    table: 'patient',
    source,
    target: count,
    skipped: deduped,
    note: deduped ? `${deduped} identity duplicates merged` : undefined,
  });
}
