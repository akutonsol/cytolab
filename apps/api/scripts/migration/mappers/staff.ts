/**
 * Cabinet + User mappers.
 *
 * Users: legacy password/saltsecret are NOT migrated (incompatible scheme, only
 * 4 users). Each gets a sentinel passwordHash so no password ever matches —
 * staff reset via invite at cutover (mapping §9). Authorizer designation comes
 * from the legacy `authorizer` table (1:1 with a user). RBAC roles are not
 * migrated in this pass (assigned in-app).
 */
import { EtlContext } from '../core/context';
import { writeBatch, UpsertRow } from '../core/writer';
import { cleanString, parseBool } from '../transforms/coerce';
import { mapAuthorizerDesignation } from '../transforms/enums';

const SENTINEL_PASSWORD = 'MIGRATED::RESET_REQUIRED'; // not a valid hash — never matches

interface LegacyCabinet {
  id: number;
  color: string | null;
  identifier: string | null;
  label: string | null;
  client_id: number | null;
  dateupdated: Date | string | null;
}

export async function cabinetStage(ctx: EtlContext): Promise<void> {
  const { legacy, idMap, labId } = ctx;
  let count = 0;
  for await (const batch of legacy.stream<LegacyCabinet>('cabinet', { incremental: ctx.incremental })) {
    const rows: UpsertRow[] = [];
    for (const row of batch) {
      const id = await idMap.getOrCreate('cabinet', row.id);
      const data = {
        id,
        labId,
        label: cleanString(row.label) ?? `Cabinet ${row.id}`,
        identifier: cleanString(row.identifier),
        color: cleanString(row.color),
        clientId: await idMap.optional('client', row.client_id),
      };
      rows.push({ where: { id }, data });
      count++;
    }
    await writeBatch(ctx, 'cabinet', rows);
  }
  ctx.recon.push({ table: 'cabinet', source: await legacy.count('cabinet', ctx.incremental), target: count });
}

interface LegacyUser {
  id: number;
  email: string | null;
  firstname: string | null;
  lastname: string | null;
  isblocked: boolean | null;
  dateupdated: Date | string | null;
}

export async function userStage(ctx: EtlContext): Promise<void> {
  const { legacy, idMap, labId, accountId } = ctx;
  let count = 0;
  let skipped = 0;
  for await (const batch of legacy.stream<LegacyUser>('users', { incremental: ctx.incremental })) {
    const rows: UpsertRow[] = [];
    for (const row of batch) {
      const email = cleanString(row.email);
      if (!email) {
        skipped++; // cannot create an Osieri user without an email
        continue;
      }
      const id = await idMap.getOrCreate('users', row.id);
      // Authorizer designation (1:1 with a user, if any).
      const auth = (
        await legacy.query<{ type: string | null }>('SELECT type FROM public.authorizer WHERE user_id = $1', [row.id])
      )[0];
      const data = {
        id,
        labId,
        accountId,
        workspaceId: ctx.workspaceId,
        email,
        passwordHash: SENTINEL_PASSWORD,
        firstName: cleanString(row.firstname) ?? 'Staff',
        lastName: cleanString(row.lastname) ?? 'User',
        isActive: !parseBool(row.isblocked),
        authorizerDesignation: (mapAuthorizerDesignation(auth?.type) ?? null) as
          | 'Pathologist' | 'Cytologist' | null,
      };
      rows.push({ where: { labId_email: { labId, email } }, data });
      count++;
    }
    await writeBatch(ctx, 'user', rows);
  }
  ctx.recon.push({
    table: 'users',
    source: await legacy.count('users', ctx.incremental),
    target: count,
    skipped,
    note: skipped ? `${skipped} without email` : undefined,
  });
}
