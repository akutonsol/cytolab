import { BatchStatus, PaymentStatus } from '@prisma/client';
import { RequisitionPortalService } from './requisition-portal.service';

/**
 * R-003 payment security regression suite.
 *
 * Covers all three closed dimensions of R-003:
 *  - settlement idempotency + duplicate-callback + paid-state overwrite protection
 *  - amount verification (gateway-settled amount === batch billed total)
 *  - token↔batch binding (an approved token for batch A must never settle batch B)
 *
 * Drives the real service logic; only the gateway, Prisma, and the system-scope
 * runner are mocked. All validation decisions under test are real code.
 */
describe('RequisitionPortalService — R-003 payment security', () => {
  // Canonical happy-path batch: billed J$2,500.00 (250000 cents), transaction 'txn-1'.
  const makeService = (over: any = {}) => {
    const batch = {
      id: 'b1',
      paymentStatus: PaymentStatus.PENDING,
      paymentRef: 'txn-1',
      batchNumber: 'B-1',
      totalAmountCents: 250000,
      forms: [],
      ...(over.batch ?? {}),
    };
    const complete = jest.fn().mockResolvedValue({
      approved: over.completeApproved ?? true,
      transactionId: 'completeTxn' in over ? over.completeTxn : 'txn-1',
      settledAmount: 'settledAmount' in over ? over.settledAmount : 2500, // dollars, 2dp
      message: 'declined',
    });
    const requisitionBatch = {
      findUnique: jest.fn().mockResolvedValue(batch),
      findFirst: jest.fn().mockResolvedValue(batch),
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

  // 3DS-complete callback body (spiToken + settled ISO code). `extra` adds identifiers.
  const body = (extra: Record<string, unknown> = {}) => ({ SpiToken: 'tok-1', IsoResponseCode: 'SP4', ...extra });

  describe('happy path', () => {
    it('(1,9) matching token + matching amount → settles once, batch becomes PAID', async () => {
      const { service, requisitionBatch, complete } = makeService();

      const res = await service.handlePaymentCallback('b1', body());

      expect(complete).toHaveBeenCalledTimes(1);
      expect(requisitionBatch.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'b1', paymentStatus: { not: PaymentStatus.PAID } },
          data: expect.objectContaining({ paymentStatus: PaymentStatus.PAID, status: BatchStatus.PAID }),
        }),
      );
      expect(res).toEqual({ status: 'payment_processing', orderId: 'b1' });
    });
  });

  describe('amount verification', () => {
    it('(2) amount mismatch → NOT marked PAID, no overwrite, validation failure returned', async () => {
      const { service, requisitionBatch, complete } = makeService({ settledAmount: 9999 }); // $9,999 ≠ $2,500

      const res = await service.handlePaymentCallback('b1', body());

      expect(complete).toHaveBeenCalledTimes(1);
      expect(requisitionBatch.updateMany).not.toHaveBeenCalled(); // no PAID, no FAILED overwrite
      expect(res).toEqual(expect.objectContaining({ status: 'declined', message: 'Payment validation failed' }));
    });

    it('(5) missing/malformed settled amount → fails closed, no PAID transition', async () => {
      const { service, requisitionBatch } = makeService({ settledAmount: undefined });

      const res = await service.handlePaymentCallback('b1', body());

      expect(requisitionBatch.updateMany).not.toHaveBeenCalled();
      expect(res).toEqual(expect.objectContaining({ status: 'declined', message: 'Payment validation failed' }));
    });
  });

  describe('token↔batch binding', () => {
    it('(3) callback names another batch\'s transaction → complete() NOT called, no mutation', async () => {
      const { service, requisitionBatch, complete } = makeService();

      const res = await service.handlePaymentCallback('b1', body({ TransactionIdentifier: 'txn-OTHER' }));

      expect(complete).not.toHaveBeenCalled(); // refused pre-capture
      expect(requisitionBatch.updateMany).not.toHaveBeenCalled();
      expect(res).toEqual(expect.objectContaining({ status: 'declined', message: 'Payment validation failed' }));
    });

    it('(3b) forged matching body but gateway settles a different txn → no PAID (authoritative catch)', async () => {
      const { service, requisitionBatch, complete } = makeService({ completeTxn: 'txn-OTHER' });

      const res = await service.handlePaymentCallback('b1', body({ TransactionIdentifier: 'txn-1' }));

      expect(complete).toHaveBeenCalledTimes(1);
      expect(requisitionBatch.updateMany).not.toHaveBeenCalled();
      expect(res).toEqual(expect.objectContaining({ status: 'declined', message: 'Payment validation failed' }));
    });

    it('(4a) gateway returns no transaction id → fails closed, no capture applied', async () => {
      const { service, requisitionBatch } = makeService({ completeTxn: undefined });

      const res = await service.handlePaymentCallback('b1', body());

      expect(requisitionBatch.updateMany).not.toHaveBeenCalled();
      expect(res).toEqual(expect.objectContaining({ status: 'declined', message: 'Payment validation failed' }));
    });

    it('(4b) batch has no stored paymentRef → fails closed', async () => {
      const { service, requisitionBatch } = makeService({ batch: { paymentRef: null } });

      const res = await service.handlePaymentCallback('b1', body());

      expect(requisitionBatch.updateMany).not.toHaveBeenCalled();
      expect(res).toEqual(expect.objectContaining({ status: 'declined', message: 'Payment validation failed' }));
    });
  });

  describe('idempotency & overwrite protection (preserved)', () => {
    it('(6) duplicate valid callback on an already-PAID batch → no second complete(), no write', async () => {
      const { service, requisitionBatch, complete } = makeService({ batch: { paymentStatus: PaymentStatus.PAID } });

      const res = await service.handlePaymentCallback('b1', body());

      expect(complete).not.toHaveBeenCalled();
      expect(requisitionBatch.updateMany).not.toHaveBeenCalled();
      expect(requisitionBatch.update).not.toHaveBeenCalled();
      expect(res).toEqual({ status: 'payment_processing', orderId: 'b1' });
    });

    it('(7) late declined 3DS callback after PAID → PAID state untouched', async () => {
      const { service, requisitionBatch, complete } = makeService({ batch: { paymentStatus: PaymentStatus.PAID } });

      const res = await service.handlePaymentCallback('b1', { IsoResponseCode: 'XX' }); // not 3DS-complete

      expect(complete).not.toHaveBeenCalled();
      expect(requisitionBatch.updateMany).not.toHaveBeenCalled();
      expect(requisitionBatch.update).not.toHaveBeenCalled();
      expect(res.status).toBe('declined');
    });

    it('a genuine gateway decline writes FAILED with the not-PAID guard', async () => {
      const { service, requisitionBatch } = makeService({ completeApproved: false });

      const res = await service.handlePaymentCallback('b1', body());

      expect(requisitionBatch.updateMany).toHaveBeenCalledWith({
        where: { id: 'b1', paymentStatus: { not: PaymentStatus.PAID } },
        data: { paymentStatus: PaymentStatus.FAILED },
      });
      expect(res).toEqual(expect.objectContaining({ status: 'declined', orderId: 'b1' }));
    });
  });

  describe('(8) markPaid atomic primitive — at most one PAID transition', () => {
    it('returns true when THIS call performed the transition (count > 0)', async () => {
      const { service } = makeService({ updateManyCount: 1 });
      expect(await (service as any).markPaid('b1', 'ref')).toBe(true);
    });

    it('returns false when a prior callback already settled the batch (count 0)', async () => {
      const { service } = makeService({ updateManyCount: 0 });
      expect(await (service as any).markPaid('b1', 'ref')).toBe(false);
    });
  });

  describe('confirmPayment', () => {
    it('idempotent: an already-PAID batch is returned without a second write', async () => {
      const { service, requisitionBatch } = makeService({ batch: { paymentStatus: PaymentStatus.PAID } });

      const res = await service.confirmPayment('b1', { paymentRef: 'new-ref' } as any);

      expect(requisitionBatch.update).not.toHaveBeenCalled();
      expect(res).toEqual(expect.objectContaining({ paymentStatus: PaymentStatus.PAID }));
    });

    it('settles a not-yet-paid batch', async () => {
      const { service, requisitionBatch } = makeService();

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
