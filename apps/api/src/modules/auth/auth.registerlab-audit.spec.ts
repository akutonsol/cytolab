import { AuthService } from './auth.service';

/**
 * Program 2 · P2-6C — tenant provisioning (lab genesis) emits ENTITY_CREATED{Lab} after the
 * bootstrap transaction commits, and nothing on a bootstrap failure.
 */
function tx() {
  return {
    lab: { create: jest.fn().mockResolvedValue({ id: 'lab1' }) },
    account: { create: jest.fn().mockResolvedValue({ id: 'acc1' }) },
    workspace: { create: jest.fn().mockResolvedValue({ id: 'w1' }) },
    role: { upsert: jest.fn().mockResolvedValue({ id: 'role1' }) },
    user: { create: jest.fn().mockResolvedValue({ id: 'u1' }) },
    passwordHistory: { create: jest.fn().mockResolvedValue({}) },
  };
}

function make(txClient = tx()) {
  const audit = { recordEntityCreated: jest.fn() };
  const prisma = {
    lab: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((fn: any) => fn(txClient)),
  } as any;
  const labContext = { runSystem: (fn: any) => fn() } as any;
  const passwordPolicy = { assertCompliant: jest.fn().mockResolvedValue(undefined) } as any;
  const svc = new AuthService(prisma, {} as any, {} as any, labContext, passwordPolicy, {} as any, {} as any, {} as any, {} as any, audit as any);
  const dto = { labName: 'Acme', labSlug: 'acme', email: 'A@b.co', password: 'Sup3rSecret!', firstName: 'A', lastName: 'B' } as any;
  return { svc, audit, dto, prisma };
}

describe('AuthService.registerLab — P2-6C tenant provisioning audit', () => {
  it('emits ENTITY_CREATED{Lab} after the bootstrap transaction commits', async () => {
    const { svc, audit, dto } = make();
    await svc.registerLab(dto);
    expect(audit.recordEntityCreated).toHaveBeenCalledWith({ resource: { type: 'Lab', id: 'lab1', labId: 'lab1' }, producerModule: 'auth' });
  });

  it('does NOT emit if the slug is already taken (validation failure)', async () => {
    const { svc, audit, dto, prisma } = make();
    prisma.lab.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(svc.registerLab(dto)).rejects.toThrow();
    expect(audit.recordEntityCreated).not.toHaveBeenCalled();
  });

  it('does NOT emit if the bootstrap transaction fails', async () => {
    const failing = tx();
    failing.user.create.mockRejectedValue(new Error('db'));
    const { svc, audit, dto } = make(failing);
    await expect(svc.registerLab(dto)).rejects.toThrow();
    expect(audit.recordEntityCreated).not.toHaveBeenCalled();
  });
});
