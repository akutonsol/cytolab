import { LabContext } from '../tenancy/lab-context';
import { ExecutionContextService, ExecutionContextReplacementError } from './execution-context.service';

/**
 * Program 2 · P2-6E0 — the SYSTEM-scoped actor-attribution bridge (runSystemAsCurrentActor).
 * Proves organization scope and actor attribution are independent context dimensions: the bridge
 * forces SYSTEM scope (scopeLabId null) while preserving actor/request/session/correlation, is
 * request-local, auto-restoring, and concurrency-isolated — with no producer-forgeable surface.
 */
function ctx() {
  const labContext = new LabContext();
  const execCtx = new ExecutionContextService(labContext);
  return { labContext, execCtx };
}

const fakeReq = () =>
  ({
    method: 'POST',
    ip: '198.51.100.9',
    socket: { remoteAddress: '198.51.100.9' },
    headers: { 'user-agent': 'jest' },
  }) as any;

// Run `fn` inside an authenticated LAB HTTP request scope, as `principal`.
function inLabRequest(
  labContext: LabContext,
  execCtx: ExecutionContextService,
  principal: { kind: 'staff'; userId: string; labId: string; sessionId: string },
  fn: () => any,
) {
  return labContext.runScoped({ labId: principal.labId }, async () => {
    execCtx.initHttpRequest(fakeReq());
    execCtx.bindPrincipal(principal);
    return fn();
  });
}

const P1 = { kind: 'staff' as const, userId: 'u1', labId: 'lab1', sessionId: 's1' };

describe('P2-6E0 — runSystemAsCurrentActor', () => {
  it('1. an authenticated LAB actor normally enriches as LAB', async () => {
    const { labContext, execCtx } = ctx();
    await inLabRequest(labContext, execCtx, P1, () => {
      expect(execCtx.getOrganization()).toEqual({ scope: 'LAB', labId: 'lab1' });
    });
  });

  it('2-7. the bridge yields SYSTEM scope (null labId) while preserving actor/request/session/correlation', async () => {
    const { labContext, execCtx } = ctx();
    await inLabRequest(labContext, execCtx, P1, async () => {
      const outerReqId = execCtx.getRequestId();
      const outerCorr = execCtx.getCorrelationId();
      await execCtx.runSystemAsCurrentActor(() => {
        const org = execCtx.getOrganization();
        expect(org).toEqual({ scope: 'SYSTEM' }); // 2. SYSTEM scope, 7. no labId
        expect(org?.labId).toBeUndefined();
        const actor = execCtx.getActor();
        expect(actor?.actorId).toBe('u1'); // 3. actor id preserved
        expect(actor?.actorType).toBe('STAFF'); // 3. actor type preserved
        expect(execCtx.getRequestId()).toBe(outerReqId); // 4. requestId preserved
        expect(execCtx.getAttribution()?.session?.sessionId).toBe('s1'); // 5. sessionId preserved
        expect(execCtx.getCorrelationId()).toBe(outerCorr); // 6. correlationId preserved
      });
    });
  });

  it('8. existing runSystem() still removes attribution (SYSTEM actor semantics) exactly as before', async () => {
    const { labContext, execCtx } = ctx();
    await inLabRequest(labContext, execCtx, P1, async () => {
      await labContext.runSystem(() => {
        expect(execCtx.getAttribution()).toBeUndefined();
        expect(execCtx.getActor()).toBeUndefined();
        expect(execCtx.getOrganization()).toBeUndefined();
      });
    });
  });

  it('9. restores the prior LAB context after the callback returns', async () => {
    const { labContext, execCtx } = ctx();
    await inLabRequest(labContext, execCtx, P1, async () => {
      await execCtx.runSystemAsCurrentActor(() => undefined);
      expect(execCtx.getOrganization()).toEqual({ scope: 'LAB', labId: 'lab1' });
      expect(execCtx.getActor()?.actorId).toBe('u1');
    });
  });

  it('10. restores the prior LAB context after the callback throws', async () => {
    const { labContext, execCtx } = ctx();
    await inLabRequest(labContext, execCtx, P1, async () => {
      await expect(
        execCtx.runSystemAsCurrentActor(() => {
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      expect(execCtx.getOrganization()).toEqual({ scope: 'LAB', labId: 'lab1' });
    });
  });

  it('11. nested invocation is deterministic (inner SYSTEM; outer SYSTEM restored; then LAB)', async () => {
    const { labContext, execCtx } = ctx();
    await inLabRequest(labContext, execCtx, P1, async () => {
      await execCtx.runSystemAsCurrentActor(async () => {
        expect(execCtx.getOrganization()).toEqual({ scope: 'SYSTEM' });
        await execCtx.runSystemAsCurrentActor(() => {
          expect(execCtx.getOrganization()).toEqual({ scope: 'SYSTEM' });
          expect(execCtx.getActor()?.actorId).toBe('u1');
        });
        expect(execCtx.getOrganization()).toEqual({ scope: 'SYSTEM' }); // outer bridge restored
      });
      expect(execCtx.getOrganization()).toEqual({ scope: 'LAB', labId: 'lab1' }); // request restored
    });
  });

  it('12. concurrent bridged contexts do not leak scope or actor', async () => {
    const { labContext, execCtx } = ctx();
    const P2 = { kind: 'staff' as const, userId: 'u2', labId: 'lab2', sessionId: 's2' };
    const seen: Record<string, { org: any; actor?: string }> = {};
    await Promise.all([
      inLabRequest(labContext, execCtx, P1, () =>
        execCtx.runSystemAsCurrentActor(async () => {
          await new Promise((r) => setTimeout(r, 5));
          seen.a = { org: execCtx.getOrganization(), actor: execCtx.getActor()?.actorId };
        }),
      ),
      inLabRequest(labContext, execCtx, P2, () =>
        execCtx.runSystemAsCurrentActor(async () => {
          await new Promise((r) => setTimeout(r, 2));
          seen.b = { org: execCtx.getOrganization(), actor: execCtx.getActor()?.actorId };
        }),
      ),
    ]);
    expect(seen.a).toEqual({ org: { scope: 'SYSTEM' }, actor: 'u1' });
    expect(seen.b).toEqual({ org: { scope: 'SYSTEM' }, actor: 'u2' });
  });

  it('refuses (throws) when there is no authenticated actor to preserve — never fabricates one', async () => {
    const { labContext, execCtx } = ctx();
    await labContext.runSystem(async () => {
      await expect(execCtx.runSystemAsCurrentActor(() => undefined)).rejects.toBeInstanceOf(
        ExecutionContextReplacementError,
      );
    });
  });
});
