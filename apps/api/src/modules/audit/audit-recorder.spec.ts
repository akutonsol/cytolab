import { LabContext } from '../../common/tenancy/lab-context';
import { ExecutionContextService } from '../../common/execution-context/execution-context.service';
import { AuditPersistenceService } from './audit-persistence.service';
import {
  AuditRecorder,
  AuditCaptureError,
  AuditTransactionRequiredError,
  AuditDurabilityUnsupportedError,
} from './audit-recorder.service';
import { AuditRecordInput } from './audit.contract';

/**
 * Program 2 · P2-3 — AuditRecorder unit tests. Persistence is mocked (we assert what the
 * recorder ENRICHES and how it handles durability); the ExecutionContext is real so we prove
 * attribution flows from P2-2, never from the producer.
 */
function setup(appendImpl?: jest.Mock) {
  const append = appendImpl ?? jest.fn().mockResolvedValue('evt-1');
  const persistence = { append } as unknown as AuditPersistenceService;
  const labContext = new LabContext();
  const execCtx = new ExecutionContextService(labContext);
  const recorder = new AuditRecorder(persistence, execCtx);
  return { append, labContext, execCtx, recorder };
}

const fakeReq = () =>
  ({
    method: 'POST',
    ip: '198.51.100.9',
    socket: { remoteAddress: '198.51.100.9' },
    headers: { 'user-agent': 'jest' },
  }) as any;

const intent = (over: Partial<any> = {}) => ({
  category: 'RECORD_LIFECYCLE' as const,
  actionCode: 'RECORD_CREATED',
  resource: { type: 'Record', id: 'r1' },
  outcome: { status: 'SUCCESS' as const },
  producerModule: 'records',
  ...over,
});

describe('AuditRecorder — enrichment from ExecutionContext', () => {
  it('takes actor/organization/request/session from the context, not the producer', async () => {
    const { append, labContext, execCtx, recorder } = setup();
    await labContext.runScoped({}, async () => {
      execCtx.initHttpRequest(fakeReq());
      execCtx.bindPrincipal({ kind: 'staff', userId: 'u1', labId: 'lab1', sessionId: 's1' });
      await recorder.record(intent());
    });
    expect(append).toHaveBeenCalledTimes(1);
    const input = append.mock.calls[0][0] as AuditRecordInput;
    expect(input.actor).toEqual({ type: 'STAFF', id: 'u1', onBehalfOfId: null, servicePrincipal: null });
    expect(input.organization).toEqual({ scope: 'LAB', labId: 'lab1', organizationId: null });
    expect(input.request?.correlationId).toBeTruthy();
    expect(input.session).toEqual({ sessionId: 's1', sessionKind: 'staff' });
    expect(input.producerModule).toBe('records');
    // Producer supplied only intent — no platform-owned fields appear on the input.
    expect((input as any).eventVersion).toBeUndefined();
    expect((input as any).sequence).toBeUndefined();
  });

  it('resolves anonymous attribution for an unauthenticated request', async () => {
    const { append, labContext, execCtx, recorder } = setup();
    await labContext.runScoped({}, async () => {
      execCtx.initHttpRequest(fakeReq());
      execCtx.bindPrincipal(undefined);
      await recorder.record(intent({ category: 'AUTHENTICATION', actionCode: 'LOGIN_FAILED', resource: { type: 'User' }, outcome: { status: 'FAILURE' } }));
    });
    const input = append.mock.calls[0][0] as AuditRecordInput;
    expect(input.actor).toEqual({ type: 'ANONYMOUS', id: null, onBehalfOfId: null, servicePrincipal: null });
    expect(input.organization).toEqual({ scope: 'SYSTEM', labId: null, organizationId: null });
  });
});

describe('AuditRecorder — durability (registry is the sole authority; no false REQUIRED_DURABLE)', () => {
  const critical = () => intent({ actionCode: 'RECORD_STATUS_CHANGED' }); // CRITICAL_TRANSACTIONAL
  const operational = () =>
    intent({ category: 'AUTHENTICATION', actionCode: 'LOGOUT', resource: { type: 'Session' } });
  const requiredDurable = () =>
    intent({ category: 'CONFIGURATION', actionCode: 'LAB_FEATURE_TOGGLED', resource: { type: 'LabFeature', id: 'X' } });

  it('CRITICAL_TRANSACTIONAL with a tx appends inside that tx', async () => {
    const { append, recorder } = setup();
    const tx = { marker: 'tx' } as any;
    await recorder.record(critical(), { tx });
    expect(append).toHaveBeenCalledWith(expect.any(Object), tx);
  });

  it('CRITICAL_TRANSACTIONAL append failure propagates (owner tx rolls back)', async () => {
    const append = jest.fn().mockRejectedValue(new Error('db down'));
    const { recorder } = setup(append);
    await expect(recorder.record(critical(), { tx: {} as any })).rejects.toBeInstanceOf(
      AuditCaptureError,
    );
  });

  it('CRITICAL_TRANSACTIONAL without a tx fails closed and never appends', async () => {
    const { append, recorder } = setup();
    await expect(recorder.record(critical())).rejects.toBeInstanceOf(
      AuditTransactionRequiredError,
    );
    expect(append).not.toHaveBeenCalled();
  });

  it('REQUIRED_DURABLE fails closed (never logged-and-swallowed) and never appends', async () => {
    const { append, recorder } = setup();
    await expect(recorder.record(requiredDurable())).rejects.toBeInstanceOf(
      AuditDurabilityUnsupportedError,
    );
    expect(append).not.toHaveBeenCalled();
  });

  it('OPERATIONAL failure is logged and swallowed (best-effort, no durability claim)', async () => {
    const append = jest.fn().mockRejectedValue(new Error('db down'));
    const { recorder } = setup(append);
    await expect(recorder.record(operational())).resolves.toBeUndefined();
  });

  it('an unregistered event fails closed (propagates)', async () => {
    const append = jest.fn().mockRejectedValue(new Error('unknown'));
    const { recorder } = setup(append);
    await expect(recorder.record(intent({ actionCode: 'NOT_A_REAL_EVENT' }))).rejects.toBeInstanceOf(
      AuditCaptureError,
    );
  });

  it('a producer cannot override durability — the registry decides', async () => {
    // The intent smuggles a bogus durabilityClass (cast around the type); it is ignored. LOGOUT is
    // OPERATIONAL, so a failed append is swallowed rather than propagating as the forged CRITICAL.
    const append = jest.fn().mockRejectedValue(new Error('db down'));
    const { recorder } = setup(append);
    await expect(
      recorder.record({ ...operational(), durabilityClass: 'CRITICAL_TRANSACTIONAL' } as any),
    ).resolves.toBeUndefined();
    expect(append).toHaveBeenCalledTimes(1); // it DID attempt (OPERATIONAL), not fail-closed
  });
});

describe('AuditRecorder — transactions', () => {
  it('appends inside a supplied transaction client', async () => {
    const { append, recorder } = setup();
    const tx = { marker: 'tx' } as any;
    await recorder.record(intent(), { tx });
    expect(append).toHaveBeenCalledWith(expect.any(Object), tx);
  });

  it('appends without a transaction when none is supplied', async () => {
    const { append, recorder } = setup();
    await recorder.record(intent());
    expect(append).toHaveBeenCalledWith(expect.any(Object), undefined);
  });
});

describe('AuditRecorder — background job attribution', () => {
  it('records a SYSTEM actor + executionId and no fake HTTP request id', async () => {
    const { append, execCtx, recorder } = setup();
    await execCtx.runJob({ jobName: 'tat.sla-scan' }, async () => {
      await recorder.record(intent({ category: 'SYSTEM', actionCode: 'JOB_STARTED', resource: { type: 'Job', id: 'tat.sla-scan' }, producerModule: 'tat' }));
    });
    const input = append.mock.calls[0][0] as AuditRecordInput;
    expect(input.actor).toEqual({ type: 'SYSTEM', id: null, onBehalfOfId: null, servicePrincipal: null });
    expect(input.organization).toEqual({ scope: 'SYSTEM', labId: null, organizationId: null });
    expect(input.executionId).toBeTruthy();
    expect(input.request?.correlationId).toBeTruthy();
    expect(input.request?.requestId ?? null).toBeNull(); // no fabricated HTTP request id
  });
});
