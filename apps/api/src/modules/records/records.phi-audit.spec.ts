import { NotFoundException } from '@nestjs/common';
import { RecordsService } from './records.service';

const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

/**
 * P2-5C: RecordsService.findOne (the shared record-by-id boundary the aggregators funnel through)
 * emits a single-subject PHI read only after a successful query, with patientRef from record.patientId.
 */
describe('RecordsService.findOne — PHI capture placement', () => {
  const make = (findFirst: () => Promise<any>) => {
    const recordPhiRead = jest.fn();
    const prisma = { record: { findFirst } };
    // (prisma, labContext, notifs, audit) — only prisma + audit are exercised here.
    const svc = new RecordsService(prisma as any, {} as any, {} as any, { recordPhiRead } as any);
    return { svc, recordPhiRead };
  };

  it('emits recordPhiRead AFTER a successful read (record_detail, patientRef = record.patientId)', async () => {
    const { svc, recordPhiRead } = make(async () => ({ id: 'rec-1', patientId: UUID }));
    await svc.findOne('rec-1');
    expect(recordPhiRead).toHaveBeenCalledTimes(1);
    expect(recordPhiRead).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: UUID, accessSurface: 'record_detail', accessMode: 'view', producerModule: 'records' }),
    );
  });

  it('does NOT emit on not-found (404)', async () => {
    const { svc, recordPhiRead } = make(async () => null);
    await expect(svc.findOne('rec-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(recordPhiRead).not.toHaveBeenCalled();
  });

  it('does NOT emit if the query errors (no PHI exposed)', async () => {
    const { svc, recordPhiRead } = make(async () => {
      throw new Error('db error');
    });
    await expect(svc.findOne('rec-1')).rejects.toThrow('db error');
    expect(recordPhiRead).not.toHaveBeenCalled();
  });
});
