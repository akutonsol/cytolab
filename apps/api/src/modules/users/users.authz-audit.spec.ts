import { UsersService } from './users.service';

/**
 * Program 2 · P2-6D — UsersService role-set assignment emit placement: ONE ROLE_ASSIGNMENT_CHANGED
 * per successful replacement, counts only; no-op re-submission emits nothing; failures emit nothing.
 */
function rec() {
  return {
    recordEntityCreated: jest.fn(),
    recordEntityUpdated: jest.fn(),
    recordEntityStateChanged: jest.fn(),
    recordRoleAssignmentChanged: jest.fn(),
  };
}
// `create` returns already-select-shaped data; findOne() re-flattens findFirst results, so a
// findFirst mock must use the RAW nested shape (roles: [{ role: { id } }]) that flatten() maps.
const created = { id: 'u1', isActive: true, roles: [] };
const rawUser = (roleIds: string[] = []) => ({ id: 'u1', isActive: true, roles: roleIds.map((id) => ({ role: { id, name: id } })) });

describe('UsersService — P2-6D role assignment audit', () => {
  it('create with roleIds emits ROLE_ASSIGNMENT_CHANGED (added=N, removed=0)', async () => {
    const audit = rec();
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(created) },
      account: { findFirst: jest.fn().mockResolvedValue({ id: 'acc1' }) },
    } as any;
    const svc = new UsersService(prisma, audit as any, { suspend: jest.fn(), reactivate: jest.fn() } as any);
    await svc.create({ email: 'a@b.co', password: 'x', firstName: 'A', lastName: 'B', roleIds: ['r1', 'r2'] } as any);
    expect(audit.recordRoleAssignmentChanged).toHaveBeenCalledWith({ userId: 'u1', rolesAddedCount: 2, rolesRemovedCount: 0, resultingRoleCount: 2, producerModule: 'users' });
  });

  it('create WITHOUT roleIds emits no assignment event', async () => {
    const audit = rec();
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(created) },
      account: { findFirst: jest.fn().mockResolvedValue({ id: 'acc1' }) },
    } as any;
    const svc = new UsersService(prisma, audit as any, { suspend: jest.fn(), reactivate: jest.fn() } as any);
    await svc.create({ email: 'a@b.co', password: 'x', firstName: 'A', lastName: 'B' } as any);
    expect(audit.recordRoleAssignmentChanged).not.toHaveBeenCalled();
  });

  it('update replacing the role set emits ONE event with correct added/removed/resulting', async () => {
    const audit = rec();
    // prev roles: r1, r2 → new roles: r2, r3  ⇒ added 1 (r3), removed 1 (r1), resulting 2
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue(rawUser(['r1', 'r2'])), update: jest.fn().mockResolvedValue(created) } } as any;
    const svc = new UsersService(prisma, audit as any, { suspend: jest.fn(), reactivate: jest.fn() } as any);
    await svc.update('u1', { roleIds: ['r2', 'r3'] } as any);
    expect(audit.recordRoleAssignmentChanged).toHaveBeenCalledTimes(1);
    expect(audit.recordRoleAssignmentChanged).toHaveBeenCalledWith({ userId: 'u1', rolesAddedCount: 1, rolesRemovedCount: 1, resultingRoleCount: 2, producerModule: 'users' });
  });

  it('update re-submitting the identical role set (no-op) emits nothing', async () => {
    const audit = rec();
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue(rawUser(['r1', 'r2'])), update: jest.fn().mockResolvedValue(created) } } as any;
    const svc = new UsersService(prisma, audit as any, { suspend: jest.fn(), reactivate: jest.fn() } as any);
    await svc.update('u1', { roleIds: ['r1', 'r2'] } as any);
    expect(audit.recordRoleAssignmentChanged).not.toHaveBeenCalled();
  });

  it('update without roleIds does not emit an assignment event', async () => {
    const audit = rec();
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue(rawUser(['r1'])), update: jest.fn().mockResolvedValue(created) } } as any;
    const svc = new UsersService(prisma, audit as any, { suspend: jest.fn(), reactivate: jest.fn() } as any);
    await svc.update('u1', { firstName: 'New' } as any);
    expect(audit.recordRoleAssignmentChanged).not.toHaveBeenCalled();
  });

  it('does NOT emit an assignment event if the update persistence fails', async () => {
    const audit = rec();
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue(rawUser(['r1'])), update: jest.fn().mockRejectedValue(new Error('db')) } } as any;
    const svc = new UsersService(prisma, audit as any, { suspend: jest.fn(), reactivate: jest.fn() } as any);
    await expect(svc.update('u1', { roleIds: ['r2'] } as any)).rejects.toThrow();
    expect(audit.recordRoleAssignmentChanged).not.toHaveBeenCalled();
  });
});
