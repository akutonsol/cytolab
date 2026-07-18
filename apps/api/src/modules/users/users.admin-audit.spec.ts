import { UsersService } from './users.service';

/**
 * Program 2 · P2-6C — UsersService administrative-lifecycle emit placement: the right helper fires
 * after successful persistence, with the correct resource/producer; nothing fires on failure. Role-set
 * changes are NOT audited here (AUTHORIZATION, deferred to P2-6D).
 */
function rec() {
  return {
    recordEntityCreated: jest.fn(),
    recordEntityUpdated: jest.fn(),
    recordEntityStateChanged: jest.fn(),
    recordEntityDeleted: jest.fn(),
  };
}
const flat = (o: any) => ({ id: 'u1', isActive: true, roles: [], ...o });

describe('UsersService — P2-6C administrative lifecycle audit', () => {
  it('create emits ENTITY_CREATED{User} after persistence', async () => {
    const audit = rec();
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(flat({})) },
      account: { findFirst: jest.fn().mockResolvedValue({ id: 'acc1' }) },
    } as any;
    const svc = new UsersService(prisma, audit as any);
    await svc.create({ email: 'A@b.co', password: 'x', firstName: 'A', lastName: 'B' } as any);
    expect(audit.recordEntityCreated).toHaveBeenCalledWith({ resource: { type: 'User', id: 'u1' }, producerModule: 'users' });
  });

  it('create does NOT emit if persistence fails', async () => {
    const audit = rec();
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockRejectedValue(new Error('db')) },
      account: { findFirst: jest.fn().mockResolvedValue({ id: 'acc1' }) },
    } as any;
    const svc = new UsersService(prisma, audit as any);
    await expect(svc.create({ email: 'A@b.co', password: 'x', firstName: 'A', lastName: 'B' } as any)).rejects.toThrow();
    expect(audit.recordEntityCreated).not.toHaveBeenCalled();
  });

  it('update emits ENTITY_UPDATED with profile field names only', async () => {
    const audit = rec();
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue(flat({})), update: jest.fn().mockResolvedValue(flat({})) } } as any;
    const svc = new UsersService(prisma, audit as any);
    await svc.update('u1', { firstName: 'New' } as any);
    expect(audit.recordEntityUpdated).toHaveBeenCalledWith({ resource: { type: 'User', id: 'u1' }, changedFields: ['firstName'], producerModule: 'users' });
  });

  it('update does NOT emit ENTITY_UPDATED for a role-only change (that is P2-6D)', async () => {
    const audit = rec();
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue(flat({})), update: jest.fn().mockResolvedValue(flat({})) } } as any;
    const svc = new UsersService(prisma, audit as any);
    await svc.update('u1', { roleIds: ['r1'] } as any);
    expect(audit.recordEntityUpdated).not.toHaveBeenCalled();
  });

  it('setActive emits ENTITY_STATE_CHANGED{account_active} with before/after', async () => {
    const audit = rec();
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue(flat({ isActive: true })), update: jest.fn().mockResolvedValue(flat({ isActive: false })) } } as any;
    const svc = new UsersService(prisma, audit as any);
    await svc.setActive('u1', false);
    expect(audit.recordEntityStateChanged).toHaveBeenCalledWith({
      resource: { type: 'User', id: 'u1' },
      stateKey: 'account_active',
      previousValue: true,
      newValue: false,
      producerModule: 'users',
    });
  });
});
