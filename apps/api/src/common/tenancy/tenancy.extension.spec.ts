import { LabContext } from './lab-context';
import { isClientScopedModel, isTenantModel, scopeArgs } from './tenancy.extension';

/**
 * These tests exercise the pure core of the tenancy guard (`scopeArgs`) — the
 * exact transformation the Prisma extension applies to every query before it
 * reaches the database. If a read is always rewritten to filter by the current
 * lab (and refuses to run when there is no lab context), then a query that
 * forgot its own `where: { labId }` can never return another lab's rows.
 */
describe('tenancy guard — scopeArgs', () => {
  const LAB_A = 'lab-a';
  const LAB_B = 'lab-b';

  describe('cross-lab isolation', () => {
    it('forces an unfiltered read to the current lab, so another lab is unreachable', () => {
      // A service forgot to scope this query entirely.
      const out = scopeArgs(
        { model: 'Patient', operation: 'findMany', args: {} },
        { labId: LAB_A },
      );
      // The guard injected the filter: only LAB_A rows can ever come back.
      expect(out.where).toEqual({ labId: LAB_A });
      expect(out.where.labId).not.toBe(LAB_B);
    });

    it('overrides a caller-supplied labId with the context lab (never trusts input)', () => {
      // A malicious/buggy caller tries to read another lab's rows.
      const out = scopeArgs(
        { model: 'Patient', operation: 'findMany', args: { where: { labId: LAB_B } } },
        { labId: LAB_A },
      );
      expect(out.where.labId).toBe(LAB_A);
    });

    it('refuses to run a tenant query when there is no lab context (fails closed)', () => {
      expect(() =>
        scopeArgs({ model: 'Patient', operation: 'findMany', args: {} }, undefined),
      ).toThrow(/no lab context/i);
      expect(() =>
        scopeArgs({ model: 'Patient', operation: 'findMany', args: {} }, {}),
      ).toThrow(/no lab context/i);
    });

    it('merges the lab filter alongside other conditions', () => {
      const out = scopeArgs(
        { model: 'Client', operation: 'findFirst', args: { where: { id: 'c1' } } },
        { labId: LAB_A },
      );
      expect(out.where).toEqual({ id: 'c1', labId: LAB_A });
    });

    it('scopes findUnique/update/delete via the where filter', () => {
      for (const operation of ['findUnique', 'update', 'delete']) {
        const out = scopeArgs(
          { model: 'Patient', operation, args: { where: { id: 'p1' }, data: {} } },
          { labId: LAB_A },
        );
        expect(out.where).toMatchObject({ id: 'p1', labId: LAB_A });
      }
    });
  });

  describe('system / non-tenant passthrough', () => {
    it('does not touch a system-scoped query (auth / bootstrap)', () => {
      const args = { where: { email: 'x@y.z' } };
      const out = scopeArgs({ model: 'User', operation: 'findFirst', args }, { system: true });
      expect(out).toBe(args);
      expect(out.where).toEqual({ email: 'x@y.z' });
    });

    it('does not touch a non-tenant model (e.g. Lab)', () => {
      expect(isTenantModel('Lab')).toBe(false);
      const args = { where: { slug: 'acme' } };
      const out = scopeArgs({ model: 'Lab', operation: 'findUnique', args }, { labId: LAB_A });
      expect(out).toBe(args);
    });
  });

  describe('writes', () => {
    it('stamps the lab onto a create', () => {
      const out = scopeArgs(
        { model: 'Patient', operation: 'create', args: { data: { firstName: 'Ada' } } },
        { labId: LAB_A },
      );
      expect(out.data).toEqual({ firstName: 'Ada', labId: LAB_A });
    });

    it('stamps the lab onto nested tenant creates (Record -> specimens)', () => {
      const out = scopeArgs(
        {
          model: 'Record',
          operation: 'create',
          args: { data: { identifier: 'REC-1', specimens: { create: [{ label: 'S1' }, { label: 'S2' }] } } },
        },
        { labId: LAB_A },
      );
      expect(out.data.labId).toBe(LAB_A);
      expect(out.data.specimens.create).toEqual([
        { label: 'S1', labId: LAB_A },
        { label: 'S2', labId: LAB_A },
      ]);
    });

    it('refuses to move a row to another lab via update data', () => {
      const out = scopeArgs(
        {
          model: 'Patient',
          operation: 'update',
          args: { where: { id: 'p1' }, data: { labId: LAB_B, firstName: 'Grace' } },
        },
        { labId: LAB_A },
      );
      expect(out.where.labId).toBe(LAB_A);
      expect(out.data.labId).toBeUndefined();
      expect(out.data.firstName).toBe('Grace');
    });
  });
});

/**
 * Portal (external client) requests add a SECOND structural dimension on top of
 * lab-scoping: every query is also forced to the portal user's clientId, and any
 * tenant table that can't be client-scoped is refused outright (Rule B). This is
 * what guarantees a portal user can't reach another client's data — or any
 * un-scopable table like Report — even with a crafted id and a forgotten filter.
 */
describe('tenancy guard — portal client-scoping', () => {
  const LAB_A = 'lab-a';
  const CLIENT_1 = 'client-1';
  const CLIENT_2 = 'client-2';
  const portalStore = { labId: LAB_A, clientId: CLIENT_1, portal: true };

  it('knows which models are client-scoped (column-derived)', () => {
    expect(isClientScopedModel('Record')).toBe(true);
    expect(isClientScopedModel('ChangeRequest')).toBe(true);
    // labId-only tenant tables are NOT client-scoped.
    expect(isClientScopedModel('Report')).toBe(false);
    expect(isClientScopedModel('ResultSheet')).toBe(false);
    expect(isClientScopedModel('RecordStatusEvent')).toBe(false);
  });

  it('forces an unfiltered portal read to BOTH the lab and the client', () => {
    const out = scopeArgs({ model: 'Record', operation: 'findMany', args: {} }, portalStore);
    expect(out.where).toEqual({ labId: LAB_A, clientId: CLIENT_1 });
  });

  it('overrides a crafted clientId with the context client (never trusts input)', () => {
    // A portal user tries to read another client's records by passing its id.
    const out = scopeArgs(
      { model: 'Record', operation: 'findFirst', args: { where: { id: 'rec-x', clientId: CLIENT_2 } } },
      portalStore,
    );
    expect(out.where.clientId).toBe(CLIENT_1);
    expect(out.where.clientId).not.toBe(CLIENT_2);
  });

  it('Rule B: refuses any portal query against a non-client-scoped table', () => {
    for (const model of ['Report', 'ResultSheet', 'RecordStatusEvent']) {
      expect(() => scopeArgs({ model, operation: 'findFirst', args: {} }, portalStore)).toThrow(
        /not client-scoped/i,
      );
    }
  });

  it('Rule B also blocks portal WRITES to a non-client-scoped table', () => {
    expect(() =>
      scopeArgs({ model: 'Report', operation: 'create', args: { data: {} } }, portalStore),
    ).toThrow(/not client-scoped/i);
  });

  it('stamps both lab and client onto a portal create (incl. nested)', () => {
    const out = scopeArgs(
      {
        model: 'ChangeRequest',
        operation: 'create',
        args: { data: { subject: 'Fix DOB', messages: { create: [{ body: 'please' }] } } },
      },
      portalStore,
    );
    expect(out.data).toMatchObject({ labId: LAB_A, clientId: CLIENT_1, subject: 'Fix DOB' });
    expect(out.data.messages.create[0]).toMatchObject({ labId: LAB_A, clientId: CLIENT_1, body: 'please' });
  });

  it('refuses a portal request with no client context (fails closed)', () => {
    expect(() =>
      scopeArgs({ model: 'Record', operation: 'findMany', args: {} }, { labId: LAB_A, portal: true }),
    ).toThrow(/no client context/i);
  });

  it('prevents moving a portal row to another client via update data', () => {
    const out = scopeArgs(
      {
        model: 'ChangeRequest',
        operation: 'update',
        args: { where: { id: 'cr1' }, data: { clientId: CLIENT_2, subject: 'x' } },
      },
      portalStore,
    );
    expect(out.where).toMatchObject({ labId: LAB_A, clientId: CLIENT_1 });
    expect(out.data.clientId).toBeUndefined();
    expect(out.data.subject).toBe('x');
  });

  it('does NOT client-scope a normal staff request (no portal flag)', () => {
    // Same client-columned model, but a staff (lab-only) context.
    const out = scopeArgs({ model: 'Record', operation: 'findMany', args: {} }, { labId: LAB_A });
    expect(out.where).toEqual({ labId: LAB_A });
    expect(out.where.clientId).toBeUndefined();
  });
});

describe('LabContext', () => {
  it('exposes the active lab id within run(), and undefined outside it', () => {
    const ctx = new LabContext();
    expect(ctx.getLabId()).toBeUndefined();
    ctx.run({}, () => {
      ctx.setLabId('lab-a');
      expect(ctx.getLabId()).toBe('lab-a');
    });
    expect(ctx.getLabId()).toBeUndefined();
  });

  it('reports no lab id inside a system scope', () => {
    const ctx = new LabContext();
    ctx.runSystem(() => {
      expect(ctx.getStore()?.system).toBe(true);
      expect(ctx.getLabId()).toBeUndefined();
    });
  });
});
