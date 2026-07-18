import { ClientsService } from './clients.service';

/**
 * Program 2 · P2-6C — ClientsService administrative-lifecycle emit placement, incl. the
 * update() split: active/blocked → ENTITY_STATE_CHANGED; other attributes → ENTITY_UPDATED.
 */
function rec() {
  return {
    recordEntityCreated: jest.fn(),
    recordEntityUpdated: jest.fn(),
    recordEntityStateChanged: jest.fn(),
    recordEntityDeleted: jest.fn(),
  };
}
const labContext = { getLabId: () => 'lab1' } as any;
const portal = {} as any;
const prevClient = { id: 'c1', active: true, blocked: false } as any;

describe('ClientsService — P2-6C administrative lifecycle audit', () => {
  it('create emits ENTITY_CREATED{Client} after the client row persists', async () => {
    const audit = rec();
    const prisma = {
      lab: { findUnique: jest.fn().mockResolvedValue({ slug: 'cylb' }) },
      $queryRaw: jest.fn().mockResolvedValue([{ value: 1n }]),
      client: { create: jest.fn().mockResolvedValue({ id: 'c1' }) },
    } as any;
    const svc = new ClientsService(prisma, portal, labContext, audit as any);
    await svc.create({ firstName: 'A' } as any);
    expect(audit.recordEntityCreated).toHaveBeenCalledWith({ resource: { type: 'Client', id: 'c1', labId: 'lab1' }, producerModule: 'clients' });
  });

  it('create does NOT emit if the client create fails', async () => {
    const audit = rec();
    const prisma = {
      lab: { findUnique: jest.fn().mockResolvedValue({ slug: 'cylb' }) },
      $queryRaw: jest.fn().mockResolvedValue([{ value: 1n }]),
      client: { create: jest.fn().mockRejectedValue(new Error('db')) },
    } as any;
    const svc = new ClientsService(prisma, portal, labContext, audit as any);
    await expect(svc.create({ firstName: 'A' } as any)).rejects.toThrow();
    expect(audit.recordEntityCreated).not.toHaveBeenCalled();
  });

  it('update: activating emits ENTITY_STATE_CHANGED{client_active}, not ENTITY_UPDATED', async () => {
    const audit = rec();
    const prisma = { client: { findFirst: jest.fn().mockResolvedValue({ ...prevClient, active: false }), update: jest.fn().mockResolvedValue(prevClient) } } as any;
    const svc = new ClientsService(prisma, portal, labContext, audit as any);
    await svc.update('c1', { active: true } as any);
    expect(audit.recordEntityStateChanged).toHaveBeenCalledWith({
      resource: { type: 'Client', id: 'c1', labId: 'lab1' },
      stateKey: 'client_active',
      previousValue: false,
      newValue: true,
      producerModule: 'clients',
    });
    expect(audit.recordEntityUpdated).not.toHaveBeenCalled();
  });

  it('update: blocking emits ENTITY_STATE_CHANGED{client_blocked}', async () => {
    const audit = rec();
    const prisma = { client: { findFirst: jest.fn().mockResolvedValue({ ...prevClient, blocked: false }), update: jest.fn().mockResolvedValue(prevClient) } } as any;
    const svc = new ClientsService(prisma, portal, labContext, audit as any);
    await svc.update('c1', { blocked: true } as any);
    expect(audit.recordEntityStateChanged).toHaveBeenCalledWith(expect.objectContaining({ stateKey: 'client_blocked', previousValue: false, newValue: true }));
  });

  it('update: attribute change emits ENTITY_UPDATED with field names, no state change', async () => {
    const audit = rec();
    const prisma = { client: { findFirst: jest.fn().mockResolvedValue(prevClient), update: jest.fn().mockResolvedValue(prevClient) } } as any;
    const svc = new ClientsService(prisma, portal, labContext, audit as any);
    await svc.update('c1', { firstName: 'Rename', email: 'x@y.co' } as any);
    expect(audit.recordEntityUpdated).toHaveBeenCalledWith({ resource: { type: 'Client', id: 'c1', labId: 'lab1' }, changedFields: ['firstName', 'email'], producerModule: 'clients' });
    expect(audit.recordEntityStateChanged).not.toHaveBeenCalled();
  });

  it('update: a no-op active value (unchanged) emits nothing', async () => {
    const audit = rec();
    const prisma = { client: { findFirst: jest.fn().mockResolvedValue(prevClient), update: jest.fn().mockResolvedValue(prevClient) } } as any;
    const svc = new ClientsService(prisma, portal, labContext, audit as any);
    await svc.update('c1', { active: true } as any); // prev.active already true
    expect(audit.recordEntityStateChanged).not.toHaveBeenCalled();
    expect(audit.recordEntityUpdated).not.toHaveBeenCalled();
  });

  it('remove emits ENTITY_DELETED{Client} after the delete commits', async () => {
    const audit = rec();
    const prisma = { client: { findFirst: jest.fn().mockResolvedValue(prevClient), delete: jest.fn().mockResolvedValue({}) } } as any;
    const svc = new ClientsService(prisma, portal, labContext, audit as any);
    await svc.remove('c1');
    expect(audit.recordEntityDeleted).toHaveBeenCalledWith({ resource: { type: 'Client', id: 'c1', labId: 'lab1' }, producerModule: 'clients' });
  });

  it('createClientType emits ENTITY_CREATED{ClientType}', async () => {
    const audit = rec();
    const prisma = { clientType: { create: jest.fn().mockResolvedValue({ id: 'ct1' }) } } as any;
    const svc = new ClientsService(prisma, portal, labContext, audit as any);
    await svc.createClientType({ type: 'Doctor' } as any);
    expect(audit.recordEntityCreated).toHaveBeenCalledWith({ resource: { type: 'ClientType', id: 'ct1', labId: 'lab1' }, producerModule: 'clients' });
  });
});
