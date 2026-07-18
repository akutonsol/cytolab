import { NotFoundException } from '@nestjs/common';
import { PatientsService } from './patients.service';

const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

/** P2-5C: PatientsService.findOne emits a single-subject PHI read only after a successful query. */
describe('PatientsService.findOne — PHI capture placement', () => {
  it('emits recordPhiRead AFTER a successful read (patient_detail, owner-derived patientId)', async () => {
    const recordPhiRead = jest.fn();
    const prisma = { patient: { findFirst: async () => ({ id: UUID, firstName: 'x' }) } };
    const svc = new PatientsService(prisma as any, {} as any, { recordPhiRead } as any);
    const result = await svc.findOne('x');
    expect(result).toEqual({ id: UUID, firstName: 'x' }); // response unchanged
    expect(recordPhiRead).toHaveBeenCalledTimes(1);
    expect(recordPhiRead).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: UUID, accessSurface: 'patient_detail', accessMode: 'view', producerModule: 'patients' }),
    );
  });

  it('does NOT emit on not-found (404) — no PHI was exposed', async () => {
    const recordPhiRead = jest.fn();
    const prisma = { patient: { findFirst: async () => null } };
    const svc = new PatientsService(prisma as any, {} as any, { recordPhiRead } as any);
    await expect(svc.findOne('x')).rejects.toBeInstanceOf(NotFoundException);
    expect(recordPhiRead).not.toHaveBeenCalled();
  });
});
