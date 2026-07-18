import { WorkspacesService } from './workspaces.service';

/**
 * Program 2 · P2-6C — WorkspacesService administrative-lifecycle emit placement.
 */
function rec() {
  return {
    recordEntityCreated: jest.fn(),
    recordEntityUpdated: jest.fn(),
    recordEntityStateChanged: jest.fn(),
    recordEntityDeleted: jest.fn(),
  };
}

describe('WorkspacesService — P2-6C administrative lifecycle audit', () => {
  it('create emits ENTITY_CREATED{Workspace} after persistence', async () => {
    const audit = rec();
    const prisma = {
      account: { findFirst: jest.fn().mockResolvedValue({ id: 'acc1' }) },
      workspace: { create: jest.fn().mockResolvedValue({ id: 'w1', name: 'Global' }) },
    } as any;
    const svc = new WorkspacesService(prisma, audit as any);
    await svc.create({ name: 'Global' } as any);
    expect(audit.recordEntityCreated).toHaveBeenCalledWith({ resource: { type: 'Workspace', id: 'w1' }, producerModule: 'workspaces' });
  });

  it('create does NOT emit if persistence fails', async () => {
    const audit = rec();
    const prisma = {
      account: { findFirst: jest.fn().mockResolvedValue({ id: 'acc1' }) },
      workspace: { create: jest.fn().mockRejectedValue(new Error('db')) },
    } as any;
    const svc = new WorkspacesService(prisma, audit as any);
    await expect(svc.create({ name: 'Global' } as any)).rejects.toThrow();
    expect(audit.recordEntityCreated).not.toHaveBeenCalled();
  });

  it('update emits ENTITY_UPDATED{name}', async () => {
    const audit = rec();
    const prisma = { workspace: { findFirst: jest.fn().mockResolvedValue({ id: 'w1' }), update: jest.fn().mockResolvedValue({ id: 'w1' }) } } as any;
    const svc = new WorkspacesService(prisma, audit as any);
    await svc.update('w1', { name: 'New' } as any);
    expect(audit.recordEntityUpdated).toHaveBeenCalledWith({ resource: { type: 'Workspace', id: 'w1' }, changedFields: ['name'], producerModule: 'workspaces' });
  });

  it('remove emits ENTITY_DELETED{Workspace} after the delete commits', async () => {
    const audit = rec();
    const prisma = {
      workspace: {
        findFirst: jest.fn().mockResolvedValue({ id: 'w1', _count: { users: 0, records: 0, clients: 0 } }),
        delete: jest.fn().mockResolvedValue({}),
      },
    } as any;
    const svc = new WorkspacesService(prisma, audit as any);
    await svc.remove('w1');
    expect(audit.recordEntityDeleted).toHaveBeenCalledWith({ resource: { type: 'Workspace', id: 'w1' }, producerModule: 'workspaces' });
  });

  it('remove does NOT emit when the workspace still has references (validation failure)', async () => {
    const audit = rec();
    const prisma = {
      workspace: {
        findFirst: jest.fn().mockResolvedValue({ id: 'w1', _count: { users: 2, records: 0, clients: 0 } }),
        delete: jest.fn(),
      },
    } as any;
    const svc = new WorkspacesService(prisma, audit as any);
    await expect(svc.remove('w1')).rejects.toThrow();
    expect(audit.recordEntityDeleted).not.toHaveBeenCalled();
  });
});
