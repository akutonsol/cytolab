import * as fs from 'fs';
import * as path from 'path';
import { LabContext, TenantStore } from '../tenancy/lab-context';
import { ExecutionContextService } from './execution-context.service';
import { MalformedCorrelationIdError } from './correlation.util';
import { isValidCorrelationId } from './correlation.util';

const labContext = new LabContext();
const svc = new ExecutionContextService(labContext);

/** Minimal express-like request with a couple of sensitive fields that must NOT be captured. */
function fakeRequest(overrides: Record<string, any> = {}) {
  return {
    method: 'GET',
    ip: '203.0.113.7',
    socket: { remoteAddress: '203.0.113.7' },
    headers: {
      'user-agent': 'Mozilla/5.0 (Macintosh)',
      authorization: 'Bearer super-secret-token',
      cookie: 'session=abc; token=xyz',
      ...overrides.headers,
    },
    body: { patientName: 'Jane Doe', diagnosis: 'REDACTED' },
    route: { path: '/:id' },
    baseUrl: '/records',
    ...overrides,
  };
}

describe('ExecutionContextService — HTTP population', () => {
  it('establishes correlation + request attribution without any PHI or secrets', () => {
    labContext.run({}, () => {
      svc.initHttpRequest(fakeRequest() as any);
      const attr = svc.getAttribution()!;
      expect(isValidCorrelationId(attr.correlationId)).toBe(true);
      expect(isValidCorrelationId(attr.request!.requestId)).toBe(true);
      expect(attr.request!.ipAddress).toBe('203.0.113.7');
      expect(attr.request!.httpMethod).toBe('GET');
      expect(attr.execution.source).toBe('http');

      // No secrets or PHI anywhere in the serialized attribution.
      const serialized = JSON.stringify(attr);
      expect(serialized).not.toContain('super-secret-token');
      expect(serialized).not.toContain('session=abc');
      expect(serialized).not.toContain('Jane Doe');
      expect(serialized).not.toContain('diagnosis');
    });
  });

  it('reuses a valid inbound correlation id and rejects a malformed one', () => {
    labContext.run({}, () => {
      const good = '11111111-1111-4111-8111-111111111111';
      svc.initHttpRequest(fakeRequest({ headers: { 'x-correlation-id': good } }) as any);
      expect(svc.getCorrelationId()).toBe(good);
    });
    labContext.run({}, () => {
      expect(() =>
        svc.initHttpRequest(fakeRequest({ headers: { 'x-correlation-id': 'bad' } }) as any),
      ).toThrow(MalformedCorrelationIdError);
    });
  });

  it('binds a staff principal: actor, LAB org, session, device id, route template', () => {
    labContext.run({}, () => {
      svc.initHttpRequest(fakeRequest() as any);
      svc.bindPrincipal({ kind: 'staff', userId: 'u1', labId: 'lab1', sessionId: 's1' }, '/records/:id');
      const attr = svc.getAttribution()!;
      expect(attr.actor).toEqual({ actorType: 'STAFF', actorId: 'u1' });
      expect(attr.organization).toEqual({ scope: 'LAB', labId: 'lab1' });
      expect(attr.session).toEqual({ sessionId: 's1', sessionKind: 'staff' });
      expect(attr.request!.apiRoute).toBe('/records/:id');
      expect(typeof attr.request!.deviceId).toBe('string');
      expect(attr.request!.deviceId!.length).toBeGreaterThan(0);
    });
  });

  it('marks portal principals with source=portal', () => {
    labContext.run({}, () => {
      svc.initHttpRequest(fakeRequest() as any);
      svc.bindPrincipal({ kind: 'portal', portalUserId: 'pu1', labId: 'lab1', clientId: 'c1' });
      expect(svc.getAttribution()!.execution.source).toBe('portal');
      expect(svc.getActor()).toEqual({ actorType: 'PORTAL', actorId: 'pu1' });
    });
  });

  it('resolves an anonymous request to ANONYMOUS / SYSTEM org', () => {
    labContext.run({}, () => {
      svc.initHttpRequest(fakeRequest() as any);
      svc.bindPrincipal(undefined);
      expect(svc.getActor()).toEqual({ actorType: 'ANONYMOUS' });
      expect(svc.getOrganization()).toEqual({ scope: 'SYSTEM' });
    });
  });

  it('does not alter tenancy fields on the store', () => {
    const store: TenantStore = { labId: 'lab1' };
    labContext.run(store, () => {
      svc.initHttpRequest(fakeRequest() as any);
      svc.bindPrincipal({ kind: 'staff', userId: 'u1', labId: 'lab1' });
    });
    // Attribution wrote only into `attribution`; tenancy labId/system are untouched.
    expect(store.labId).toBe('lab1');
    expect(store.system).toBeUndefined();
  });
});

describe('ExecutionContextService — background jobs', () => {
  it('runs a system-scoped job with executionId + correlationId and NO request fields', async () => {
    await svc.runJob({ jobName: 'recall.sweep' }, () => {
      const attr = svc.getAttribution()!;
      expect(attr.execution.source).toBe('job');
      expect(attr.execution.jobName).toBe('recall.sweep');
      expect(isValidCorrelationId(attr.execution.executionId!)).toBe(true);
      expect(isValidCorrelationId(attr.correlationId)).toBe(true);
      expect(attr.request).toBeUndefined(); // no fake HTTP fields
      expect(attr.actor).toEqual({ actorType: 'SYSTEM' });
      expect(attr.organization).toEqual({ scope: 'SYSTEM' });
      expect(labContext.getStore()!.system).toBe(true);
    });
  });

  it('runs a lab-scoped job under LAB org', async () => {
    await svc.runJob({ jobName: 'tat.tick', labId: 'lab9' }, () => {
      expect(svc.getOrganization()).toEqual({ scope: 'LAB', labId: 'lab9' });
      expect(labContext.getStore()!.labId).toBe('lab9');
    });
  });
});

describe('ExecutionContextService — nested contexts & delegation', () => {
  it('a child inherits actor/org/correlation and adds execution metadata', async () => {
    const store: TenantStore = {
      labId: 'lab1',
      attribution: {
        correlationId: '22222222-2222-4222-8222-222222222222',
        organization: { scope: 'LAB', labId: 'lab1' },
        actor: { actorType: 'STAFF', actorId: 'u1' },
        execution: { source: 'http' },
      },
    };
    await labContext.runScoped(store, async () => {
      await svc.runChild({ jobName: 'batch.expand', source: 'job' }, () => {
        const attr = svc.getAttribution()!;
        expect(attr.correlationId).toBe('22222222-2222-4222-8222-222222222222'); // same trace
        expect(attr.actor).toEqual({ actorType: 'STAFF', actorId: 'u1' }); // unchanged
        expect(attr.organization).toEqual({ scope: 'LAB', labId: 'lab1' }); // unchanged
        expect(attr.execution.jobName).toBe('batch.expand'); // added
        expect(attr.execution.source).toBe('job');
      });
    });
  });

  it('delegation keeps the real actor and records onBehalfOfActorId', async () => {
    const store: TenantStore = {
      attribution: {
        correlationId: '33333333-3333-4333-8333-333333333333',
        actor: { actorType: 'STAFF', actorId: 'u1' },
        organization: { scope: 'LAB', labId: 'lab1' },
        execution: { source: 'http' },
      },
      labId: 'lab1',
    };
    await labContext.runScoped(store, async () => {
      await svc.runChild({ onBehalfOfActorId: 'u2' }, () => {
        expect(svc.getActor()).toEqual({
          actorType: 'STAFF',
          actorId: 'u1',
          onBehalfOfActorId: 'u2',
        });
      });
    });
  });

  it('a child of an attribution-less scope is rejected', async () => {
    await expect(
      labContext.runScoped({}, async () => svc.runChild({ jobName: 'x' }, () => 1)),
    ).rejects.toThrow();
  });
});

describe('architecture: execution-context does not depend on the Audit module', () => {
  it('no execution-context source imports the Audit owner or writes AuditEvent', () => {
    const dir = __dirname;
    for (const name of fs.readdirSync(dir)) {
      if (!/\.ts$/.test(name) || /\.spec\.ts$/.test(name)) continue;
      const text = fs.readFileSync(path.join(dir, name), 'utf8');
      expect(text).not.toMatch(/modules\/audit/);
      expect(text).not.toMatch(/AuditPersistenceService/);
      expect(text).not.toMatch(/\.auditEvent\b/);
    }
  });
});
