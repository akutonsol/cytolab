import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { RequisitionsService } from './requisitions.service';
import { ClientsService } from '../clients/clients.service';

/**
 * Concurrency proof for the seeded identifiers — requisition referenceNo and
 * client accountNo — reusing the patient-regno pattern: many concurrent creates
 * each get a distinct id from the atomic LabSequence allocator. Gated on
 * DATABASE_URL.
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('Requisition Ref# and Client AC# — concurrency (integration)', () => {
  const raw = new PrismaClient();
  const labContext = new LabContext();
  const prisma = new PrismaService(labContext);
  const realtimeStub = { emitToLab() {}, emitToUser() {}, emitToSuperusers() {} } as any;
  const requisitions = new RequisitionsService(prisma, labContext, realtimeStub);
  // ClientsService only touches PortalUsersService when createPortalLogin is set,
  // which these creates don't — so a stub is safe.
  const clients = new ClientsService(prisma, {} as any, labContext, {
    recordEntityCreated: async () => {},
    recordEntityUpdated: async () => {},
    recordEntityStateChanged: async () => {},
    recordEntityDeleted: async () => {},
  } as any);

  const tag = `ids-${Date.now().toString(36)}`;
  let labId: string;

  beforeAll(async () => {
    const lab = await raw.lab.create({ data: { name: `Ids ${tag}`, slug: `cylb${tag}` } });
    labId = lab.id;
  });

  afterAll(async () => {
    await raw.requisitionLine.deleteMany({ where: { labId } });
    await raw.requisition.deleteMany({ where: { labId } });
    await raw.portalAccessToken.deleteMany({ where: { labId } }).catch(() => undefined);
    await raw.portalUser.deleteMany({ where: { labId } }).catch(() => undefined);
    await raw.client.deleteMany({ where: { labId } });
    await raw.labSequence.deleteMany({ where: { labId } });
    await raw.lab.deleteMany({ where: { id: labId } });
    await prisma.$disconnect();
    await raw.$disconnect();
  });

  it('N concurrent requisition creates get N distinct, sequential Ref#s', async () => {
    const N = 20;
    const created = await labContext.run({ labId }, () =>
      Promise.all(Array.from({ length: N }, () => requisitions.create({ lines: [{ amount: 500 }] } as any))),
    );
    const refs = created.map((r) => r.referenceNo!);
    expect(new Set(refs).size).toBe(N); // no duplicates

    const numeric = refs.map(Number).sort((a, b) => a - b);
    expect(numeric[0]).toBe(1001); // REF_BASE + 1
    expect(numeric[N - 1]).toBe(1000 + N);
  });

  it('N concurrent client creates get N distinct account numbers', async () => {
    const N = 20;
    const created = await labContext.run({ labId }, () =>
      Promise.all(
        Array.from({ length: N }, (_, i) => clients.create({ firstName: 'C', lastName: `AC${i}` } as any)),
      ),
    );
    const accts = created.map((c) => c.accountNo!);
    expect(new Set(accts).size).toBe(N); // no duplicates

    // All share the lab-derived prefix; the numeric part is the sequence.
    const nums = accts.map((a) => Number(a.split('-')[1])).sort((x, y) => x - y);
    expect(nums[0]).toBe(100001); // ACCT_BASE + 1
    expect(nums[N - 1]).toBe(100000 + N);
    expect(accts.every((a) => a.startsWith(accts[0].split('-')[0] + '-'))).toBe(true);
  });
});
