/**
 * Client mapper (mapping §3). Each legacy Client-domain `workspace` becomes one
 * Osieri `Client` + a primary `PortalUser`. Because workspace↔client is 1:1
 * (paired via records: ws5→client7, ws6→client8, ws7→client9), we alias BOTH
 * legacy keys to the same Osieri Client uuid so FKs from `record.workspace_id`,
 * `patient.workspace_id`, and `record.client_id` all resolve to one row.
 *
 * The legacy `client` row (contact name/phone) and its linked `users` row
 * (portal login email) are looked up per workspace — only 3 clients, so the
 * extra queries are cheap. PortalUser creation is best-effort: it needs an
 * email; absent one, staff invite the client later (passwords are never set by
 * staff — PortalUser.passwordHash stays null until the invite is accepted).
 */
import { EtlContext } from '../core/context';
import { cleanString } from '../transforms/coerce';

interface LegacyWorkspace {
  id: number;
  name: string | null;
  domain: string | null; // Client | Global | Developer
  identifier: string | null;
}

interface LegacyClientRow {
  id: number;
  firstname: string | null;
  lastname: string | null;
  officename: string | null;
  phonenumber: string | null;
  mobilenumber: string | null;
  officenumber: string | null;
  faxnumber: string | null;
  client_type_id: number | null;
  labcode_id: number | null;
  user_id: number | null;
}

export async function clientStage(ctx: EtlContext): Promise<void> {
  const { legacy, prisma, idMap, labId } = ctx;
  let clientCount = 0;
  let portalCount = 0;

  const workspaces = await legacy.query<LegacyWorkspace>(
    "SELECT id, name, domain, identifier FROM public.workspace WHERE domain = 'Client' ORDER BY id",
  );

  for (const ws of workspaces) {
    const clientUuid = await idMap.getOrCreate('workspace', ws.id);

    // Pair the workspace to its dominant legacy client_id (1:1 in practice).
    const paired = await legacy.query<{ client_id: number }>(
      'SELECT client_id FROM public.record WHERE workspace_id = $1 GROUP BY client_id ORDER BY count(*) DESC LIMIT 1',
      [ws.id],
    );
    const legacyClientId = paired[0]?.client_id ?? null;
    let clientRow: LegacyClientRow | undefined;
    if (legacyClientId != null) {
      await idMap.set('client', legacyClientId, clientUuid); // alias the client FK
      clientRow = (
        await legacy.query<LegacyClientRow>('SELECT * FROM public.client WHERE id = $1', [legacyClientId])
      )[0];
    }

    const accountNo = cleanString(ws.identifier) ?? `WS-${ws.id}`;
    const data = {
      id: clientUuid,
      labId,
      officeName: cleanString(ws.name) ?? cleanString(clientRow?.officename),
      firstName: cleanString(clientRow?.firstname) ?? cleanString(ws.name) ?? 'Client',
      lastName: cleanString(clientRow?.lastname) ?? '',
      accountNo,
      phoneNumber: cleanString(clientRow?.phonenumber),
      mobileNumber: cleanString(clientRow?.mobilenumber),
      officeNumber: cleanString(clientRow?.officenumber),
      faxNumber: cleanString(clientRow?.faxnumber),
      clientTypeId: await idMap.optional('client_type', clientRow?.client_type_id),
      labCodeId: await idMap.optional('labcode', clientRow?.labcode_id),
    };

    if (!ctx.dryRun) {
      await prisma.client.upsert({
        where: { labId_accountNo: { labId, accountNo } },
        create: data,
        update: data,
      });
    }
    clientCount++;

    // Best-effort primary portal login from the legacy client's linked user email.
    const email = clientRow?.user_id
      ? cleanString(
          (
            await legacy.query<{ email: string | null }>('SELECT email FROM public.users WHERE id = $1', [
              clientRow.user_id,
            ])
          )[0]?.email,
        )
      : null;
    if (email) {
      const portalId = await idMap.getOrCreate('portalUserForClient', ws.id);
      const portalData = {
        id: portalId,
        labId,
        clientId: clientUuid,
        email,
        firstName: data.firstName,
        lastName: data.lastName || data.firstName,
        isPrimary: true,
        isActive: true,
        // passwordHash intentionally omitted — invite-based; staff never set it.
      };
      if (!ctx.dryRun) {
        await prisma.portalUser.upsert({
          where: { labId_email: { labId, email } },
          create: portalData,
          update: portalData,
        });
      }
      portalCount++;
    }
  }

  ctx.recon.push({ table: 'client (from workspace)', source: workspaces.length, target: clientCount });
  ctx.recon.push({ table: 'portalUser', source: clientCount, target: portalCount, skipped: clientCount - portalCount, note: 'no email → manual invite' });
}
