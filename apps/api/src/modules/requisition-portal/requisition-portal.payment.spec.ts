import { BatchStatus, PaymentStatus } from '@prisma/client';
import { RequisitionPortalService } from './requisition-portal.service';

/**
 * R-003 (idempotency dimension): duplicate PowerTranz callbacks and re-confirms
 * must not produce duplicate financial effects — no second gateway settlement
 * (complete() capture), and no overwrite of the first settlement's recorded state.
 *
 * These tests drive the real service methods; only the gateway, Prisma, and the
 * system-scope runner are mocked. The settlement decision logic under test is real.
 */
describe('RequisitionPortalService — R-003 payment idempotency', () => {
  const makeService = (over: {
    batch?: any;
    completeApproved?: boolean;
    updateManyCount?: number;
  } = {}) => {
    const complete = jest.fn().mockResolvedValue({
      approved: over.completeApproved ?? true,
      transactionId: 'tx-gateway',
      message: 'declined',
    });
    const requisitionBatch = {
      findUnique: jest.fn().mockResolvedValue(over.batch ?? { paymentStatus: PaymentStatus.PENDING }),
      findFirst: jest.fn().mockResolvedValue(over.batch ?? { id: 'b1', paymentStatus: PaymentStatus.PENDING, forms: [] }),
      updateMany: jest.fn().mockResolvedValue({ count: over.updateManyCount ?? 1 }),
      update: jest.fn().mockResolvedValue({ id: 'b1', paymentStatus: PaymentStatus.PAID }),
    };
    const prisma = { requisitionBatch } as any;
    const labContext = { runSystem: (fn: any) => fn() } as any;
    const powertranz = { complete } as any;
    const service = new RequisitionPortalService(
      prisma, labContext, {} as any, {} as any, {} as any, {} as any, {} as any, powertranz,
    );
    return { service, requisitionBatch, complete };
  };

  // Body that passes the 3DS-complete gate (spiToken present + settled ISO code).
  const approvedBody = { SpiToken: 'tok-1', IsoResponseCode: 'SP4' };

  describe('handlePaymentCallback', () => {
    it('settles a PENDING batch once: calls gateway complete() + atomic markPaid', async () => {
      const { service, requisitionBatch, complete } = makeService({ batch: { paymentStatus: PaymentStatus.PENDING } });

      const res = await service.handlePaymentCallback('b1', approvedBody);

      expect(complete).toHaveBeenCalledTimes(1);
      expect(requisitionBatch.updateMany).toHaveBeenCalledTimes(1);
      // Atomic guard: the transition only touches a batch that is not already PAID.
      expect(requisitionBatch.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'b1', paymentStatus: { not: PaymentStatus.PAID } },
          data: expect.objectContaining({ paymentStatus: PaymentStatus.PAID, status: BatchStatus.PAID }),
        }),
      );
      expect(res).toEqual({ status: 'payment_processing', orderId: 'b1' });
    });

    it('IDEMPOTENT: a duplicate callback on an already-PAID batch does NOT re-settle', async () => {
      const { service, requisitionBatch, complete } = makeService({ batch: { paymentStatus: PaymentStatus.PAID } });

      const res = await service.handlePaymentCallback('b1', approvedBody);

      expect(complete).not.toHaveBeenCalled(); // no second gateway capture
      expect(requisitionBatch.updateMany).not.toHaveBeenCalled(); // no re-write
      expect(requisitionBatch.update).not.toHaveBeenCalled();
      expect(res).toEqual({ status: 'payment_processing', orderId: 'b1' });
    });

    it('a decline on a PENDING batch writes FAILED with the not-PAID guard (cannot clobber a paid batch)', async () => {
      const { service, requisitionBatch } = makeService({
        batch: { paymentStatus: PaymentStatus.PENDING },
        completeApproved: false,
      });

      const res = await service.handlePaymentCallback('b1', approvedBody);

      expect(requisitionBatch.updateMany).toHaveBeenCalledWith({
        where: { id: 'b1', paymentStatus: { not: PaymentStatus.PAID } },
        data: { paymentStatus: PaymentStatus.FAILED },
      });
      expect(res).toEqual(expect.objectContaining({ status: 'declined', orderId: 'b1' }));
    });
  });

  describe('markPaid (atomic settlement primitive)', () => {
    it('returns true when THIS call performed the transition (count > 0)', async () => {
      const { service } = makeService({ updateManyCount: 1 });
      const did = await (service as any).markPaid('b1', 'ref');
      expect(did).toBe(true);
    });

    it('returns false when the batch was already settled by a prior callback (count 0)', async () => {
      const { service } = makeService({ updateManyCount: 0 });
      const did = await (service as any).markPaid('b1', 'ref');
      expect(did).toBe(false);
    });
  });

  describe('confirmPayment', () => {
    it('IDEMPOTENT: an already-PAID batch is returned without a second write', async () => {
      const { service, requisitionBatch } = makeService({
        batch: { id: 'b1', paymentStatus: PaymentStatus.PAID, forms: [] },
      });

      const res = await service.confirmPayment('b1', { paymentRef: 'new-ref' } as any);

      expect(requisitionBatch.update).not.toHaveBeenCalled();
      expect(res).toEqual(expect.objectContaining({ paymentStatus: PaymentStatus.PAID }));
    });

    it('settles a not-yet-paid batch', async () => {
      const { service, requisitionBatch } = makeService({
        batch: { id: 'b1', paymentStatus: PaymentStatus.PENDING, forms: [] },
      });

      await service.confirmPayment('b1', { paymentRef: 'ref-1' } as any);

      expect(requisitionBatch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'b1' },
          data: expect.objectContaining({
            paymentStatus: PaymentStatus.PAID,
            paymentRef: 'ref-1',
            status: BatchStatus.PAID,
          }),
        }),
      );
    });
  });
});
