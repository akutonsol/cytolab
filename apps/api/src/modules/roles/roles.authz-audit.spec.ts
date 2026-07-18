import { RolesService } from './roles.service';

/**
 * Program 2 · P2-6D — RolesService authorization-governance emit placement: the right helper fires
 * after successful persistence; nothing fires on validation/persistence failure.
 */
function rec() {
  return {
    recordRoleCreated: jest.fn(),
    recordRoleUpdated: jest.fn(),
    recordRoleDeleted: jest.fn(),
  };
}

describe('RolesService — P2-6D authorization governance audit', () => {
  it('createRole emits ROLE_CREATED after persistence', async () => {
    const audit = rec();
    const prisma = { role: { create: jest.fn().mockResolvedValue({ id: 'role1' }) } } as any;
    const svc = new RolesService(prisma, audit as any);
    await svc.createRole({ name: 'Reviewer' } as any);
    expect(audit.recordRoleCreated).toHaveBeenCalledWith({ roleId: 'role1', producerModule: 'roles' });
  });

  it('createRole does NOT emit if persistence fails', async () => {
    const audit = rec();
    const prisma = { role: { create: jest.fn().mockRejectedValue(new Error('db')) } } as any;
    const svc = new RolesService(prisma, audit as any);
    await expect(svc.createRole({ name: 'Reviewer' } as any)).rejects.toThrow();
    expect(audit.recordRoleCreated).not.toHaveBeenCalled();
  });

  it('updateRole emits ROLE_UPDATED with field names incl. permissions', async () => {
    const audit = rec();
    const prisma = { role: { findUnique: jest.fn().mockResolvedValue({ id: 'role1' }), update: jest.fn().mockResolvedValue({ id: 'role1' }) } } as any;
    const svc = new RolesService(prisma, audit as any);
    await svc.updateRole('role1', { name: 'Renamed', permissionIds: ['p1', 'p2'] } as any);
    expect(audit.recordRoleUpdated).toHaveBeenCalledWith({ roleId: 'role1', changedFields: ['name', 'permissions'], producerModule: 'roles' });
  });

  it('updateRole does NOT emit when the role is not found (validation failure)', async () => {
    const audit = rec();
    const prisma = { role: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() } } as any;
    const svc = new RolesService(prisma, audit as any);
    await expect(svc.updateRole('missing', { name: 'X' } as any)).rejects.toThrow();
    expect(audit.recordRoleUpdated).not.toHaveBeenCalled();
  });

  it('deleteRole emits ROLE_DELETED after the delete commits', async () => {
    const audit = rec();
    const prisma = { role: { findUnique: jest.fn().mockResolvedValue({ id: 'role1' }), delete: jest.fn().mockResolvedValue({}) } } as any;
    const svc = new RolesService(prisma, audit as any);
    await svc.deleteRole('role1');
    expect(audit.recordRoleDeleted).toHaveBeenCalledWith({ roleId: 'role1', producerModule: 'roles' });
  });

  it('deleteRole does NOT emit when the role is not found', async () => {
    const audit = rec();
    const prisma = { role: { findUnique: jest.fn().mockResolvedValue(null), delete: jest.fn() } } as any;
    const svc = new RolesService(prisma, audit as any);
    await expect(svc.deleteRole('missing')).rejects.toThrow();
    expect(audit.recordRoleDeleted).not.toHaveBeenCalled();
  });
});
