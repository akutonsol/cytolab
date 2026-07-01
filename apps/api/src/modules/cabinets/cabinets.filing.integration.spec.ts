import { ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { CabinetsService } from './cabinets.service';

/**
 * Cabinet filing (automatic-by-client):
 *  - a cabinet's records = its linked client's records (not per-record cabinetId);
 *  - the reference code embeds the client account number;
 *  - one cabinet per client (unique);
 *  - the A–Z surname index filters by patient last name within the client.
 * Gated on DATABASE_URL.
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('Cabinet filing (integration)', () => {
  const raw = new PrismaClient();
  const labContext = new LabContext();
  const prisma = new PrismaService(labContext);
  const cabinets = new CabinetsService(prisma);

  const tag = `cab-${Date.now().toString(36)}`;
  let labId: string;
  let clientAId: string;
  let clientBId: string;

  const run = <T>(fn: () => Promise<T>) => labContext.run({ labId }, fn);

  beforeAll(async () => {
    const lab = await raw.lab.create({ data: { name: `Cab ${tag}`, slug: `cab-${tag}` } });
    labId = lab.id;
    const clientA = await raw.client.create({
      data: { labId, firstName: 'Micro', lastName: 'Labs', officeName: 'Microlabs', accountNo: `CYLB-${tag}A` },
    });
    const clientB = await raw.client.create({
      data: { labId, firstName: 'Gynae', lastName: 'Plus', officeName: 'Gynae Plus', accountNo: `CYLB-${tag}B` },
    });
    clientAId = clientA.id;
    clientBId = clientB.id;

    // Client A: three patients (two surnames start with A), each with a record.
    for (const [first, last] of [['Ada', 'Anderson'], ['Al', 'Adams'], ['Bea', 'Baker']]) {
      const p = await raw.patient.create({ data: { labId, registrationNo: `${tag}-${last}`, firstName: first, lastName: last } });
      await raw.record.create({ data: { labId, identifier: `${tag}-rec-${last}`, patientId: p.id, clientId: clientAId } });
    }
    // Client B: one record that must NOT show up in Client A's cabinet.
    const pb = await raw.patient.create({ data: { labId, registrationNo: `${tag}-Zed`, firstName: 'Zed', lastName: 'Zephyr' } });
    await raw.record.create({ data: { labId, identifier: `${tag}-rec-Zed`, patientId: pb.id, clientId: clientBId } });
  });

  afterAll(async () => {
    await raw.cabinet.deleteMany({ where: { labId } });
    await raw.record.deleteMany({ where: { labId } });
    await raw.patient.deleteMany({ where: { labId } });
    await raw.client.deleteMany({ where: { labId } });
    await raw.lab.deleteMany({ where: { id: labId } });
    await prisma.$disconnect();
    await raw.$disconnect();
  });

  it('links a client, generates a CB{accountNo}-XXXX reference code', () =>
    run(async () => {
      const cab = await cabinets.create({ label: 'Microlabs', color: 'red', clientId: clientAId });
      expect(cab.clientId).toBe(clientAId);
      expect(cab.identifier).toMatch(new RegExp(`^CBCYLB-${tag}A-[A-Z0-9]{4}$`));
      expect(cab.client?.officeName).toBe('Microlabs');
    }));

  it('auto-contains ALL the linked client records, and none from other clients', () =>
    run(async () => {
      const existing = (await cabinets.findAll()).find((c) => c.clientId === clientAId)!;
      const all = await cabinets.records(existing.id, {});
      expect(all.total).toBe(3); // the three Client-A records, not Client B's
      const surnames = all.data.map((r: any) => r.patient.lastName).sort();
      expect(surnames).toEqual(['Adams', 'Anderson', 'Baker']);
    }));

  it('rejects a second cabinet for the same client (ConflictException)', () =>
    run(async () => {
      await expect(cabinets.create({ label: 'dupe', clientId: clientAId })).rejects.toBeInstanceOf(ConflictException);
    }));

  it('A–Z surname index filters within the client', () =>
    run(async () => {
      const cab = (await cabinets.findAll()).find((c) => c.clientId === clientAId)!;
      const aOnly = await cabinets.records(cab.id, { surname: 'A' });
      expect(aOnly.data.map((r: any) => r.patient.lastName).sort()).toEqual(['Adams', 'Anderson']);
      const bOnly = await cabinets.records(cab.id, { surname: 'B' });
      expect(bOnly.data.map((r: any) => r.patient.lastName)).toEqual(['Baker']);
    }));

  it('an unlinked cabinet has no records', () =>
    run(async () => {
      const cab = await cabinets.create({ label: 'Empty drawer', color: 'green' });
      expect(cab.identifier).toBeNull();
      const res = await cabinets.records(cab.id, {});
      expect(res.total).toBe(0);
    }));
});
