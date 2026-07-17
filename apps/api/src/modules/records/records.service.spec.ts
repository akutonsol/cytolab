import { RecordStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { RecordsService } from './records.service';

/**
 * findBillable must only surface Approved-and-unbilled records. Legacy made a
 * record billable solely on reaching Approved (not merely Completed), and our
 * issue-bill transition advances Approved -> Billed — so a Completed-but-not-yet
 * Approved record must never appear as billable.
 */
describe('RecordsService.findBillable', () => {
  function makeService() {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = { record: { findMany, count } } as unknown as PrismaService;
    return { service: new RecordsService(prisma, {} as any, { notifyUser: async () => {}, notifyPermission: async () => {} } as any, { record: async () => {} } as any), findMany, count };
  }

  it('queries only Approved, unbilled records', async () => {
    const { service, findMany, count } = makeService();

    await service.findBillable({});

    const expectedWhere = { billed: false, status: RecordStatus.Approved };
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expectedWhere }));
    expect(count).toHaveBeenCalledWith(expect.objectContaining({ where: expectedWhere }));
  });

  it('does not include Completed records (Completed is not billable until Approved)', async () => {
    const { service, findMany } = makeService();

    await service.findBillable({});

    const { where } = findMany.mock.calls[0][0];
    // A bare status equals Approved — never an `in` list that admits Completed.
    expect(where.status).toBe(RecordStatus.Approved);
    expect(where.status).not.toEqual(
      expect.objectContaining({ in: expect.arrayContaining([RecordStatus.Completed]) }),
    );
  });
});
