import { NotFoundException } from '@nestjs/common';
import { AuditQueryController } from './audit-query.controller';
import { AuthUser } from '../../../common/decorators/current-user.decorator';

/**
 * P2-7B — the controller maps the TRUSTED principal + transport DTO to the frozen request model and
 * delegates; it builds no Prisma predicate, does no projection/redaction, and never trusts
 * caller-supplied identity/permissions.
 */
function make() {
  const query = { list: jest.fn().mockResolvedValue({ items: [], nextCursor: null }), getById: jest.fn() };
  const controller = new AuditQueryController(query as any);
  return { controller, query };
}
const user = (over: Partial<AuthUser> = {}): AuthUser => ({ userId: 'u1', labId: 'lab1', email: 'a@b.co', roles: [], permissions: ['audit:read'], ...over }) as AuthUser;

describe('AuditQueryController — P2-7B', () => {
  it('derives the principal from the authenticated user, never from query params', async () => {
    const { controller, query } = make();
    await controller.list({ scope: 'lab', labIds: 'evil-lab' } as any, user({ labId: 'lab1', permissions: ['audit:read'], isSuperRole: false }));
    const input = query.list.mock.calls[0][0];
    expect(input.principal).toEqual({ labId: 'lab1', permissions: ['audit:read'], isSuperRole: false });
    // labIds from the query string are passed through as a *requested* scope, but the service — not
    // the controller — decides whether a LAB reader may use them (it cannot).
    expect(input.requestedScope).toEqual({ scope: 'LAB', labIds: ['evil-lab'] });
  });

  it('splits comma-separated array filters and maps includePhi to a boolean', async () => {
    const { controller, query } = make();
    await controller.list(
      { category: 'SECURITY, CONFIGURATION', actionCode: 'SETTING_CHANGED', includePhi: 'true', pageSize: 10 } as any,
      user(),
    );
    const input = query.list.mock.calls[0][0];
    expect(input.filters.category).toEqual(['SECURITY', 'CONFIGURATION']);
    expect(input.filters.actionCode).toEqual(['SETTING_CHANGED']);
    expect(input.phi).toBe(true);
    expect(input.filters.pageSize).toBe(10);
  });

  it('maps the scope discriminant (lab/system/cross_lab) to the frozen kind', async () => {
    const { controller, query } = make();
    await controller.list({ scope: 'system' } as any, user());
    expect(query.list.mock.calls[0][0].requestedScope).toEqual({ scope: 'SYSTEM', labIds: undefined });
    await controller.list({ scope: 'cross_lab', labIds: 'a,b' } as any, user());
    expect(query.list.mock.calls[1][0].requestedScope).toEqual({ scope: 'CROSS_LAB', labIds: ['a', 'b'] });
  });

  it('omission yields no requested scope (service applies the least-privilege default)', async () => {
    const { controller, query } = make();
    await controller.list({} as any, user());
    expect(query.list.mock.calls[0][0].requestedScope).toBeUndefined();
    expect(query.list.mock.calls[0][0].phi).toBe(false);
  });

  it('detail passes id + includePhi and 404s a null result', async () => {
    const { controller, query } = make();
    query.getById.mockResolvedValue(null);
    await expect(controller.getById('evt1', { includePhi: 'false' } as any, user())).rejects.toThrow(NotFoundException);
    expect(query.getById.mock.calls[0][0]).toEqual({ principal: expect.any(Object), id: 'evt1', phi: false });

    query.getById.mockResolvedValue({ id: 'evt1' });
    await expect(controller.getById('evt1', {} as any, user())).resolves.toEqual({ id: 'evt1' });
  });
});
