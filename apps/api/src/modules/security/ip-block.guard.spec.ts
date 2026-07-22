import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { IpBlockGuard } from './ip-block.guard';

/** R-007 — regression coverage for the global IP denylist guard. */
const ctxFor = (req: any): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => req }) }) as any;
const req = { headers: {}, ip: '9.9.9.9', socket: { remoteAddress: '9.9.9.9' } };

const make = (blocked: boolean) => {
  const isIpBlocked = jest.fn().mockResolvedValue(blocked);
  const guard = new IpBlockGuard({ isIpBlocked } as any);
  return { guard, isIpBlocked };
};

describe('IpBlockGuard', () => {
  it('allows a non-blocked IP', async () => {
    const { guard } = make(false);
    expect(await guard.canActivate(ctxFor(req))).toBe(true);
  });

  it('NEGATIVE: rejects a blocked IP before any handler runs (403)', async () => {
    const { guard } = make(true);
    await expect(guard.canActivate(ctxFor(req))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('memoises the lookup within the TTL (does not hit the store on every request)', async () => {
    const { guard, isIpBlocked } = make(false);
    await guard.canActivate(ctxFor(req));
    await guard.canActivate(ctxFor(req));
    expect(isIpBlocked).toHaveBeenCalledTimes(1); // second call served from cache
  });

  it('a cached block keeps rejecting without re-querying', async () => {
    const { guard, isIpBlocked } = make(true);
    await expect(guard.canActivate(ctxFor(req))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard.canActivate(ctxFor(req))).rejects.toBeInstanceOf(ForbiddenException);
    expect(isIpBlocked).toHaveBeenCalledTimes(1);
  });
});
