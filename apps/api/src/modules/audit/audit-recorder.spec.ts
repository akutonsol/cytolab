import { LabContext } from '../../common/tenancy/lab-context';
import { ExecutionContextService } from '../../common/execution-context/execution-context.service';
import { PrismaService } from '../../database/prisma.service';
import { AuditPersistenceService } from './audit-persistence.service';
import { PhiAccessDedup } from './phi-access-dedup';
import {
  AuditRecorder,
  AuditCaptureError,
  AuditTransactionRequiredError,
  AuditDurabilityUnsupportedError,
} from './audit-recorder.service';
import { AuditRecordInput } from './audit.contract';

/**
 * Program 2 · P2-3/P2-4C — AuditRecorder unit tests. Persistence is mocked (we assert what the
 * recorder ENRICHES and how it handles durability + transactions); the ExecutionContext is real so
 * we prove attribution flows from P2-2, never from the producer. The mock prisma.$transaction runs
 * its callback with a sentinel tx client, so OPERATIONAL's recorder-owned transaction is observable.
 */
function setup(appendImpl?: jest.Mock) {
  const append = appendImpl ?? jest.fn().mockResolvedValue('evt-1');
  const persistence = { append } as unknown as AuditPersistenceService;
  const labContext = new LabContext();
  const execCtx = new ExecutionContextService(labContext);
  const ownTx = { __recorderOwnedTx: true } as any;
  const $transaction = jest.fn((fn: any) => fn(ownTx));
  const prisma = { $transaction } as unknown as PrismaService;
  const recorder = new AuditRecorder(persistence, execCtx, prisma, new PhiAccessDedup(execCtx));
  return { append, labContext, execCtx, recorder, prisma, $transaction, ownTx };
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
  it('CRITICAL appends on the owner-supplied transaction (no recorder-owned tx opened)', async () => {
    const { append, recorder, $transaction } = setup();
    const ownerTx = { __ownerTx: true } as any;
    await recorder.record(intent({ actionCode: 'RECORD_STATUS_CHANGED' }), { tx: ownerTx });
    expect(append).toHaveBeenCalledWith(expect.any(Object), ownerTx);
    expect($transaction).not.toHaveBeenCalled();
  });

  it('OPERATIONAL opens ONE recorder-owned transaction and appends inside it', async () => {
    const { append, recorder, $transaction, ownTx } = setup();
    await recorder.record(intent()); // RECORD_CREATED = OPERATIONAL
    expect($transaction).toHaveBeenCalledTimes(1);
    expect(append).toHaveBeenCalledWith(expect.any(Object), ownTx);
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

describe('AuditRecorder — recordPhiRead (P2-5C single-subject PHI capture)', () => {
  const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
  const UUID2 = '11111111-2222-4333-8444-555566667777';

  it('emits PATIENT_RECORD_VIEWED with derived patientRef and bounded phi.access.v2 metadata', async () => {
    const { append, labContext, recorder } = setup();
    await labContext.runScoped({ labId: 'lab1' }, async () => {
      await recorder.recordPhiRead({
        patientId: UUID,
        accessSurface: 'record_detail',
        accessMode: 'view',
        producerModule: 'records',
        resource: { type: 'Record', id: 'rec-1' },
      });
    });
    expect(append).toHaveBeenCalledTimes(1);
    const input = append.mock.calls[0][0] as AuditRecordInput;
    expect(input.category).toBe('PHI_ACCESS');
    expect(input.action.code).toBe('PATIENT_RECORD_VIEWED');
    expect(input.resource.patientRef).toBe(UUID); // owner-derived internal UUID, no raw PHI
    expect(input.metadata).toEqual({ accessSurface: 'record_detail', accessMode: 'view', producerModule: 'records' });
  });

  it('dedupes the same patient+surface within one execution, but not different surfaces/patients', async () => {
    const { append, labContext, recorder } = setup();
    await labContext.runScoped({ labId: 'lab1' }, async () => {
      await recorder.recordPhiRead({ patientId: UUID, accessSurface: 'record_detail', accessMode: 'view', producerModule: 'records', resource: { type: 'Record', id: 'r1' } });
      await recorder.recordPhiRead({ patientId: UUID, accessSurface: 'record_detail', accessMode: 'view', producerModule: 'records', resource: { type: 'Record', id: 'r1' } }); // dup → skip
      await recorder.recordPhiRead({ patientId: UUID, accessSurface: 'report_pdf', accessMode: 'view', producerModule: 'reports', resource: { type: 'Report', id: 'r1' } }); // diff surface
      await recorder.recordPhiRead({ patientId: UUID2, accessSurface: 'record_detail', accessMode: 'view', producerModule: 'records', resource: { type: 'Record', id: 'r2' } }); // diff patient
    });
    expect(append).toHaveBeenCalledTimes(3);
  });

  it('a new execution re-emits (dedup is request-scoped)', async () => {
    const { append, labContext, recorder } = setup();
    const once = () =>
      labContext.runScoped({ labId: 'lab1' }, () =>
        recorder.recordPhiRead({ patientId: UUID, accessSurface: 'patient_detail', accessMode: 'view', producerModule: 'patients', resource: { type: 'Patient', id: UUID } }),
      );
    await once();
    await once();
    expect(append).toHaveBeenCalledTimes(2);
  });

  it('is best-effort: an invalid patientId neither emits nor throws', async () => {
    const { append, labContext, recorder } = setup();
    await labContext.runScoped({ labId: 'lab1' }, async () => {
      await expect(
        recorder.recordPhiRead({ patientId: 'REG-000123', accessSurface: 'record_detail', accessMode: 'view', producerModule: 'records', resource: { type: 'Record', id: 'r1' } }),
      ).resolves.toBeUndefined();
    });
    expect(append).not.toHaveBeenCalled();
  });

  it('is best-effort: an append failure is swallowed (the read is unaffected)', async () => {
    const append = jest.fn().mockRejectedValue(new Error('db down'));
    const { labContext, recorder } = setup(append);
    await labContext.runScoped({ labId: 'lab1' }, async () => {
      await expect(
        recorder.recordPhiRead({ patientId: UUID, accessSurface: 'record_detail', accessMode: 'view', producerModule: 'records', resource: { type: 'Record', id: 'r1' } }),
      ).resolves.toBeUndefined();
    });
  });
});

describe('AuditRecorder — recordPhiList / recordPhiExport (P2-5D aggregate capture)', () => {
  it('recordPhiList emits PATIENT_LIST_QUERIED with patientRef null + bounded metadata', async () => {
    const { append, labContext, recorder } = setup();
    await labContext.runScoped({ labId: 'lab1' }, async () => {
      await recorder.recordPhiList({ accessSurface: 'list', producerModule: 'records', resultCount: 12, pageSize: 20, resourceType: 'RecordList' });
    });
    expect(append).toHaveBeenCalledTimes(1);
    const input = append.mock.calls[0][0] as AuditRecordInput;
    expect(input.action.code).toBe('PATIENT_LIST_QUERIED');
    expect(input.resource.patientRef ?? null).toBeNull();
    expect(input.metadata).toEqual({ accessSurface: 'list', accessMode: 'view', producerModule: 'records', resultCount: 12, pageSize: 20 });
  });

  it('recordPhiList emits NOTHING for a zero-result response', async () => {
    const { append, labContext, recorder } = setup();
    await labContext.runScoped({ labId: 'lab1' }, async () => {
      await recorder.recordPhiList({ accessSurface: 'list', producerModule: 'records', resultCount: 0, resourceType: 'RecordList' });
    });
    expect(append).not.toHaveBeenCalled();
  });

  it('search carries filterClass but never a raw term', async () => {
    const { append, labContext, recorder } = setup();
    await labContext.runScoped({ labId: 'lab1' }, async () => {
      await recorder.recordPhiList({ accessSurface: 'search', producerModule: 'search', resultCount: 3, filterClass: 'text', resourceType: 'SearchResults' });
    });
    const input = append.mock.calls[0][0] as AuditRecordInput;
    expect(input.metadata).toEqual({ accessSurface: 'search', accessMode: 'view', producerModule: 'search', resultCount: 3, filterClass: 'text' });
    expect(JSON.stringify(input.metadata)).not.toMatch(/term|query|keyword/i);
  });

  it('aggregate dedup: same action+surface once; different surface and different action each emit', async () => {
    const { append, labContext, recorder } = setup();
    await labContext.runScoped({ labId: 'lab1' }, async () => {
      await recorder.recordPhiList({ accessSurface: 'list', producerModule: 'records', resultCount: 1, resourceType: 'RecordList' });
      await recorder.recordPhiList({ accessSurface: 'list', producerModule: 'records', resultCount: 1, resourceType: 'RecordList' }); // dup → skip
      await recorder.recordPhiList({ accessSurface: 'search', producerModule: 'search', resultCount: 1, resourceType: 'SearchResults' }); // diff surface
      await recorder.recordPhiExport({ accessSurface: 'export', producerModule: 'coding', resultCount: 1, documentType: 'coding', resourceType: 'CodingExport' }); // diff action
    });
    expect(append).toHaveBeenCalledTimes(3);
  });

  it('recordPhiExport emits PHI_EXPORTED (patientRef null, accessMode export, documentType)', async () => {
    const { append, labContext, recorder } = setup();
    await labContext.runScoped({ labId: 'lab1' }, async () => {
      await recorder.recordPhiExport({ accessSurface: 'export', producerModule: 'coding', resultCount: 42, documentType: 'coding', filterClass: 'date_range', resourceType: 'CodingExport' });
    });
    const input = append.mock.calls[0][0] as AuditRecordInput;
    expect(input.action.code).toBe('PHI_EXPORTED');
    expect(input.resource.patientRef ?? null).toBeNull();
    expect(input.metadata).toEqual({ accessSurface: 'export', accessMode: 'export', producerModule: 'coding', documentType: 'coding', resultCount: 42, filterClass: 'date_range' });
  });

  it('recordPhiExport emits NOTHING for a known-empty export (resultCount 0)', async () => {
    const { append, labContext, recorder } = setup();
    await labContext.runScoped({ labId: 'lab1' }, async () => {
      await recorder.recordPhiExport({ accessSurface: 'export', producerModule: 'coding', resultCount: 0, documentType: 'coding', resourceType: 'CodingExport' });
    });
    expect(append).not.toHaveBeenCalled();
  });

  it('aggregate capture is best-effort — an append failure is swallowed', async () => {
    const append = jest.fn().mockRejectedValue(new Error('db down'));
    const { labContext, recorder } = setup(append);
    await labContext.runScoped({ labId: 'lab1' }, async () => {
      await expect(recorder.recordPhiList({ accessSurface: 'list', producerModule: 'records', resultCount: 5, resourceType: 'RecordList' })).resolves.toBeUndefined();
      await expect(recorder.recordPhiExport({ accessSurface: 'export', producerModule: 'coding', resultCount: 5, resourceType: 'CodingExport' })).resolves.toBeUndefined();
    });
  });
});

describe('AuditRecorder — recordSettingChanged (P2-6 administrative configuration capture)', () => {
  it('emits CONFIGURATION/SETTING_CHANGED with bounded { settingKey, scope } metadata', async () => {
    const { append, labContext, recorder } = setup();
    await labContext.runScoped({ labId: 'lab1' }, async () => {
      await recorder.recordSettingChanged({
        settingKey: 'password_policy',
        scope: 'system',
        producerModule: 'security',
        resource: { type: 'SystemConfig', id: 'password_policy' },
      });
    });
    expect(append).toHaveBeenCalledTimes(1);
    const input = append.mock.calls[0][0] as AuditRecordInput;
    expect(input.category).toBe('CONFIGURATION');
    expect(input.action.code).toBe('SETTING_CHANGED');
    expect(input.producerModule).toBe('security');
    expect(input.resource).toEqual({ type: 'SystemConfig', id: 'password_policy', labId: null });
    expect(input.metadata).toEqual({ settingKey: 'password_policy', scope: 'system' });
    expect(input.resource.patientRef ?? null).toBeNull(); // administrative — no patient
  });

  it('never carries the changed values — only the setting key/scope', async () => {
    const { append, labContext, recorder } = setup();
    await labContext.runScoped({ labId: 'lab1' }, async () => {
      await recorder.recordSettingChanged({ settingKey: 'mfa_required', scope: 'user', producerModule: 'security', resource: { type: 'User', id: 'u1' } });
    });
    const input = append.mock.calls[0][0] as AuditRecordInput;
    expect(JSON.stringify(input.metadata)).not.toMatch(/true|false|password|secret|token/i);
  });

  it('is best-effort — an append failure is swallowed (the admin change is unaffected)', async () => {
    const append = jest.fn().mockRejectedValue(new Error('db down'));
    const { labContext, recorder } = setup(append);
    await labContext.runScoped({ labId: 'lab1' }, async () => {
      await expect(
        recorder.recordSettingChanged({ settingKey: 'company_profile', scope: 'lab', producerModule: 'lab', resource: { type: 'Lab', id: 'lab1', labId: 'lab1' } }),
      ).resolves.toBeUndefined();
    });
  });
});

describe('AuditRecorder — P2-6C administrative lifecycle helpers', () => {
  it('recordEntityCreated → ADMINISTRATIVE/ENTITY_CREATED, resource carried, no metadata', async () => {
    const { append, labContext, recorder } = setup();
    await labContext.runScoped({ labId: 'lab1' }, async () => {
      await recorder.recordEntityCreated({ resource: { type: 'User', id: 'u1' }, producerModule: 'users' });
    });
    const input = append.mock.calls[0][0] as AuditRecordInput;
    expect(input.category).toBe('ADMINISTRATIVE');
    expect(input.action.code).toBe('ENTITY_CREATED');
    expect(input.resource).toEqual({ type: 'User', id: 'u1', labId: null });
    expect(input.outcome.status).toBe('SUCCESS');
    expect(input.producerModule).toBe('users');
    expect(input.metadata).toBeUndefined();
  });

  it('recordEntityUpdated → change.changedFields (names only), no values, no metadata', async () => {
    const { append, labContext, recorder } = setup();
    await labContext.runScoped({ labId: 'lab1' }, async () => {
      await recorder.recordEntityUpdated({ resource: { type: 'Client', id: 'c1', labId: 'lab1' }, changedFields: ['firstName', 'email'], producerModule: 'clients' });
    });
    const input = append.mock.calls[0][0] as AuditRecordInput;
    expect(input.category).toBe('ADMINISTRATIVE');
    expect(input.action.code).toBe('ENTITY_UPDATED');
    expect(input.change).toEqual({ changedFields: ['firstName', 'email'] });
    expect(input.metadata).toBeUndefined();
  });

  it('recordEntityStateChanged → admin.state_change.v1 metadata (stateKey + booleans only)', async () => {
    const { append, labContext, recorder } = setup();
    await labContext.runScoped({ labId: 'lab1' }, async () => {
      await recorder.recordEntityStateChanged({ resource: { type: 'User', id: 'u1' }, stateKey: 'account_active', previousValue: true, newValue: false, producerModule: 'users' });
    });
    const input = append.mock.calls[0][0] as AuditRecordInput;
    expect(input.category).toBe('ADMINISTRATIVE');
    expect(input.action.code).toBe('ENTITY_STATE_CHANGED');
    expect(input.metadata).toEqual({ stateKey: 'account_active', newValue: false, previousValue: true });
  });

  it('recordEntityDeleted → ADMINISTRATIVE/ENTITY_DELETED', async () => {
    const { append, labContext, recorder } = setup();
    await labContext.runScoped({ labId: 'lab1' }, async () => {
      await recorder.recordEntityDeleted({ resource: { type: 'Workspace', id: 'w1' }, producerModule: 'workspaces' });
    });
    const input = append.mock.calls[0][0] as AuditRecordInput;
    expect(input.action.code).toBe('ENTITY_DELETED');
    expect(input.category).toBe('ADMINISTRATIVE');
  });

  it('all four helpers are best-effort — an append failure is swallowed', async () => {
    const append = jest.fn().mockRejectedValue(new Error('db down'));
    const { labContext, recorder } = setup(append);
    await labContext.runScoped({ labId: 'lab1' }, async () => {
      await expect(recorder.recordEntityCreated({ resource: { type: 'User', id: 'u1' }, producerModule: 'users' })).resolves.toBeUndefined();
      await expect(recorder.recordEntityUpdated({ resource: { type: 'User', id: 'u1' }, changedFields: ['firstName'], producerModule: 'users' })).resolves.toBeUndefined();
      await expect(recorder.recordEntityStateChanged({ resource: { type: 'User', id: 'u1' }, stateKey: 'account_active', newValue: true, producerModule: 'users' })).resolves.toBeUndefined();
      await expect(recorder.recordEntityDeleted({ resource: { type: 'User', id: 'u1' }, producerModule: 'users' })).resolves.toBeUndefined();
    });
  });
});

describe('AuditRecorder — P2-6D authorization governance helpers', () => {
  it('recordRoleCreated → AUTHORIZATION/ROLE_CREATED, resource=Role, no metadata', async () => {
    const { append, labContext, recorder } = setup();
    await labContext.runScoped({ labId: 'lab1' }, async () => {
      await recorder.recordRoleCreated({ roleId: 'role1', producerModule: 'roles' });
    });
    const input = append.mock.calls[0][0] as AuditRecordInput;
    expect(input.category).toBe('AUTHORIZATION');
    expect(input.action.code).toBe('ROLE_CREATED');
    expect(input.resource).toEqual({ type: 'Role', id: 'role1' });
    expect(input.metadata).toBeUndefined();
  });

  it('recordRoleUpdated → change.changedFields (names only, e.g. permissions), no metadata', async () => {
    const { append, labContext, recorder } = setup();
    await labContext.runScoped({ labId: 'lab1' }, async () => {
      await recorder.recordRoleUpdated({ roleId: 'role1', changedFields: ['name', 'permissions'], producerModule: 'roles' });
    });
    const input = append.mock.calls[0][0] as AuditRecordInput;
    expect(input.action.code).toBe('ROLE_UPDATED');
    expect(input.change).toEqual({ changedFields: ['name', 'permissions'] });
    expect(input.metadata).toBeUndefined();
  });

  it('recordRoleDeleted → AUTHORIZATION/ROLE_DELETED', async () => {
    const { append, labContext, recorder } = setup();
    await labContext.runScoped({ labId: 'lab1' }, async () => {
      await recorder.recordRoleDeleted({ roleId: 'role1', producerModule: 'roles' });
    });
    const input = append.mock.calls[0][0] as AuditRecordInput;
    expect(input.action.code).toBe('ROLE_DELETED');
    expect(input.category).toBe('AUTHORIZATION');
  });

  it('recordRoleAssignmentChanged → resource=User, counts-only metadata, NO ids/names', async () => {
    const { append, labContext, recorder } = setup();
    await labContext.runScoped({ labId: 'lab1' }, async () => {
      await recorder.recordRoleAssignmentChanged({ userId: 'u1', rolesAddedCount: 2, rolesRemovedCount: 1, resultingRoleCount: 3, producerModule: 'users' });
    });
    const input = append.mock.calls[0][0] as AuditRecordInput;
    expect(input.category).toBe('AUTHORIZATION');
    expect(input.action.code).toBe('ROLE_ASSIGNMENT_CHANGED');
    expect(input.resource).toEqual({ type: 'User', id: 'u1' });
    expect(input.metadata).toEqual({ rolesAddedCount: 2, rolesRemovedCount: 1, resultingRoleCount: 3 });
    // No role ids / names / permission lists anywhere in the payload.
    expect(JSON.stringify(input.metadata)).not.toMatch(/role[-_]?id|name|permission|Admin/i);
  });

  it('all four authz helpers are best-effort — an append failure is swallowed', async () => {
    const append = jest.fn().mockRejectedValue(new Error('db down'));
    const { labContext, recorder } = setup(append);
    await labContext.runScoped({ labId: 'lab1' }, async () => {
      await expect(recorder.recordRoleCreated({ roleId: 'r1', producerModule: 'roles' })).resolves.toBeUndefined();
      await expect(recorder.recordRoleUpdated({ roleId: 'r1', changedFields: ['name'], producerModule: 'roles' })).resolves.toBeUndefined();
      await expect(recorder.recordRoleDeleted({ roleId: 'r1', producerModule: 'roles' })).resolves.toBeUndefined();
      await expect(recorder.recordRoleAssignmentChanged({ userId: 'u1', rolesAddedCount: 1, rolesRemovedCount: 0, producerModule: 'users' })).resolves.toBeUndefined();
    });
  });
});

describe('AuditRecorder — P2-6E0 system-as-current-actor enrichment', () => {
  it('wrapping record() in runSystemAsCurrentActor emits SYSTEM org (null scopeLabId) + preserved actor', async () => {
    const { append, labContext, execCtx, recorder } = setup();
    await labContext.runScoped({ labId: 'lab1' }, async () => {
      execCtx.initHttpRequest(fakeReq());
      execCtx.bindPrincipal({ kind: 'staff', userId: 'admin1', labId: 'lab1', sessionId: 'sess1' });
      await execCtx.runSystemAsCurrentActor(() =>
        recorder.record(intent({ category: 'SYSTEM', actionCode: 'JOB_COMPLETED', resource: { type: 'Job', id: 'x' } })),
      );
    });
    const input = append.mock.calls[0][0] as AuditRecordInput;
    // Organization: SYSTEM, scopeLabId null (no tenant fabricated from the admin's labId).
    expect(input.organization).toEqual({ scope: 'SYSTEM', labId: null, organizationId: null });
    // Actor + request + session accountability preserved (this is the whole point of the bridge).
    expect(input.actor).toEqual({ type: 'STAFF', id: 'admin1', onBehalfOfId: null, servicePrincipal: null });
    expect(input.request?.requestId).toBeTruthy();
    expect(input.session).toEqual({ sessionId: 'sess1', sessionKind: 'staff' });
  });

  it('the same record() WITHOUT the bridge enriches as LAB (proves the bridge is what changes scope)', async () => {
    const { append, labContext, execCtx, recorder } = setup();
    await labContext.runScoped({ labId: 'lab1' }, async () => {
      execCtx.initHttpRequest(fakeReq());
      execCtx.bindPrincipal({ kind: 'staff', userId: 'admin1', labId: 'lab1', sessionId: 'sess1' });
      await recorder.record(intent({ category: 'SYSTEM', actionCode: 'JOB_COMPLETED', resource: { type: 'Job', id: 'x' } }));
    });
    const input = append.mock.calls[0][0] as AuditRecordInput;
    expect(input.organization).toEqual({ scope: 'LAB', labId: 'lab1', organizationId: null });
  });
});

describe('AuditRecorder — P2-6E security-administration helpers', () => {
  it('recordAccountUnlocked → SECURITY/ACCOUNT_UNLOCKED, resource=User, no metadata', async () => {
    const { append, labContext, recorder } = setup();
    await labContext.runScoped({ labId: 'lab1' }, () => recorder.recordAccountUnlocked({ userId: 'u1', producerModule: 'security' }));
    const input = append.mock.calls[0][0] as AuditRecordInput;
    expect(input.category).toBe('SECURITY');
    expect(input.action.code).toBe('ACCOUNT_UNLOCKED');
    expect(input.resource).toEqual({ type: 'User', id: 'u1' });
    expect(input.metadata).toBeUndefined();
  });

  it('recordPasswordResetForced / recordUserMfaReset → correct action, resource=User, no metadata', async () => {
    const { append, labContext, recorder } = setup();
    await labContext.runScoped({ labId: 'lab1' }, async () => {
      await recorder.recordPasswordResetForced({ userId: 'u1', producerModule: 'security' });
      await recorder.recordUserMfaReset({ userId: 'u1', producerModule: 'security' });
    });
    expect((append.mock.calls[0][0] as AuditRecordInput).action.code).toBe('PASSWORD_RESET_FORCED');
    expect((append.mock.calls[1][0] as AuditRecordInput).action.code).toBe('USER_MFA_RESET');
    expect((append.mock.calls[1][0] as AuditRecordInput).metadata).toBeUndefined();
  });

  it('recordSessionTerminated(all) → resource=User, bounded scope+count metadata', async () => {
    const { append, labContext, recorder } = setup();
    await labContext.runScoped({ labId: 'lab1' }, () =>
      recorder.recordSessionTerminated({ scope: 'all', terminatedCount: 3, resource: { type: 'User', id: 'u1' }, producerModule: 'security' }),
    );
    const input = append.mock.calls[0][0] as AuditRecordInput;
    expect(input.action.code).toBe('SESSION_TERMINATED');
    expect(input.resource).toEqual({ type: 'User', id: 'u1' });
    expect(input.metadata).toEqual({ terminationScope: 'all', terminatedCount: 3 });
  });

  it('recordIpBlockAdded → resource=BlockedIp row id + only { permanent } (never the raw IP)', async () => {
    const { append, labContext, recorder } = setup();
    await labContext.runScoped({ labId: 'lab1' }, () =>
      recorder.recordIpBlockAdded({ blockedIpId: 'blk1', permanent: true, producerModule: 'security' }),
    );
    const input = append.mock.calls[0][0] as AuditRecordInput;
    expect(input.action.code).toBe('IP_BLOCK_ADDED');
    expect(input.resource).toEqual({ type: 'BlockedIp', id: 'blk1' });
    expect(input.metadata).toEqual({ permanent: true });
    expect(JSON.stringify(input)).not.toMatch(/\d+\.\d+\.\d+\.\d+/); // no dotted-quad IP anywhere
  });

  it('recordIpBlockRemoved / recordTrustedDeviceRevoked / recordSecurityAlertResolved → row id, no metadata', async () => {
    const { append, labContext, recorder } = setup();
    await labContext.runScoped({ labId: 'lab1' }, async () => {
      await recorder.recordIpBlockRemoved({ blockedIpId: 'blk1', producerModule: 'security' });
      await recorder.recordTrustedDeviceRevoked({ trustedDeviceId: 'dev1', producerModule: 'security' });
      await recorder.recordSecurityAlertResolved({ alertId: 'al1', producerModule: 'security' });
    });
    expect((append.mock.calls[0][0] as AuditRecordInput).resource).toEqual({ type: 'BlockedIp', id: 'blk1' });
    expect((append.mock.calls[1][0] as AuditRecordInput).resource).toEqual({ type: 'TrustedDevice', id: 'dev1' });
    expect((append.mock.calls[2][0] as AuditRecordInput).resource).toEqual({ type: 'SecurityAlert', id: 'al1' });
    expect((append.mock.calls[2][0] as AuditRecordInput).metadata).toBeUndefined();
  });

  it('all P2-6E helpers are best-effort — an append failure is swallowed', async () => {
    const append = jest.fn().mockRejectedValue(new Error('db down'));
    const { labContext, recorder } = setup(append);
    await labContext.runScoped({ labId: 'lab1' }, async () => {
      await expect(recorder.recordAccountUnlocked({ userId: 'u1', producerModule: 'security' })).resolves.toBeUndefined();
      await expect(recorder.recordSessionTerminated({ scope: 'all', terminatedCount: 0, resource: { type: 'User', id: 'u1' }, producerModule: 'security' })).resolves.toBeUndefined();
      await expect(recorder.recordIpBlockAdded({ blockedIpId: 'b', permanent: false, producerModule: 'security' })).resolves.toBeUndefined();
    });
  });
});

describe('AuditRecorder — P2-7C recordAuditEventPhiAccessed (fail-closed)', () => {
  it('appends SECURITY/AUDIT_EVENT_PHI_ACCESSED with bounded metadata + resource, inside a tx', async () => {
    const { append, labContext, execCtx, recorder, $transaction } = setup();
    await labContext.runScoped({ labId: 'lab1' }, async () => {
      execCtx.initHttpRequest(fakeReq());
      execCtx.bindPrincipal({ kind: 'staff', userId: 'admin1', labId: 'lab1', sessionId: 's1' });
      await recorder.recordAuditEventPhiAccessed({
        accessMode: 'list',
        queryScope: 'LAB',
        resultCount: 5,
        pageSize: 50,
        hasMore: false,
        resource: { type: 'AuditEventCollection', id: 'audit-events' },
      });
    });
    expect($transaction).toHaveBeenCalledTimes(1); // recorder-owned tx
    const input = append.mock.calls[0][0] as AuditRecordInput;
    expect(input.category).toBe('SECURITY');
    expect(input.action.code).toBe('AUDIT_EVENT_PHI_ACCESSED');
    expect(input.resource).toEqual({ type: 'AuditEventCollection', id: 'audit-events' });
    expect(input.metadata).toEqual({ accessMode: 'list', queryScope: 'LAB', resultCount: 5, pageSize: 50, hasMore: false });
    expect(input.actor).toEqual({ type: 'STAFF', id: 'admin1', onBehalfOfId: null, servicePrincipal: null });
  });

  it('PROPAGATES an append failure (fail-closed) — NOT swallowed like best-effort producers', async () => {
    const append = jest.fn().mockRejectedValue(new Error('db down'));
    const { labContext, recorder } = setup(append);
    await labContext.runScoped({ labId: 'lab1' }, async () => {
      await expect(
        recorder.recordAuditEventPhiAccessed({ accessMode: 'detail', queryScope: 'LAB', resultCount: 1, resource: { type: 'AuditEvent', id: 'e1' } }),
      ).rejects.toBeTruthy();
    });
  });
});
