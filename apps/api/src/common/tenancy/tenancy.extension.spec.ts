import { LabContext } from './lab-context';
import { isTenantModel, scopeArgs } from './tenancy.extension';

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
