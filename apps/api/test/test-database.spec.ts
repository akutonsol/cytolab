/**
 * Program 2 · P2-R016A — unit tests for the fail-closed test-database isolation guard. Pure (no DB).
 */
import {
  assertIsolatedTestDatabase,
  deriveTestUrl,
  resolveTestDatabaseUrl,
  redactDbUrl,
  TestDatabaseIsolationError,
} from './test-database';

const U = (db: string, host = 'localhost') => `postgresql://user:secret@${host}:5432/${db}`;

describe('P2-R016A — database identity guard (fail-closed)', () => {
  it('accepts an explicitly-approved isolated test database', () => {
    expect(() => assertIsolatedTestDatabase(U('cytolab_test'))).not.toThrow();
    expect(() => assertIsolatedTestDatabase(U('audit_test'))).not.toThrow();
  });

  it('rejects the development database', () => {
    expect(() => assertIsolatedTestDatabase(U('cytolab'))).toThrow(TestDatabaseIsolationError);
  });

  it('rejects a production-like (non-test) database name', () => {
    expect(() => assertIsolatedTestDatabase(U('cytolab_prod'))).toThrow(TestDatabaseIsolationError);
    expect(() => assertIsolatedTestDatabase(U('production'))).toThrow(TestDatabaseIsolationError);
  });

  it('rejects a missing test marker', () => {
    expect(() => assertIsolatedTestDatabase(U('cytolab_dev'))).toThrow(/must contain "test"/);
  });

  it('rejects a remote/production-like host even if the name has "test"', () => {
    expect(() => assertIsolatedTestDatabase(U('cytolab_test', 'db.prod.internal'))).toThrow(/not a permitted local test host/);
  });

  it('rejects an ambiguous / unparseable connection identity', () => {
    expect(() => assertIsolatedTestDatabase('not-a-url')).toThrow(TestDatabaseIsolationError);
    expect(() => assertIsolatedTestDatabase('postgresql://localhost:5432/')).toThrow(/no database name/);
  });

  it('rejects everything under NODE_ENV=production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => assertIsolatedTestDatabase(U('cytolab_test'))).toThrow(/NODE_ENV=production/);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('never leaks credentials in errors or redaction', () => {
    let msg = '';
    try {
      assertIsolatedTestDatabase(U('cytolab'));
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).not.toContain('secret');
    expect(msg).not.toContain('user:');
    expect(redactDbUrl(U('cytolab'))).toBe('localhost/cytolab');
    expect(redactDbUrl(U('cytolab'))).not.toContain('secret');
  });
});

describe('P2-R016A — URL derivation & resolution', () => {
  it('derives the isolated _test sibling (idempotent)', () => {
    expect(deriveTestUrl(U('cytolab'))).toBe(U('cytolab_test'));
    expect(deriveTestUrl(U('cytolab_test'))).toBe(U('cytolab_test')); // idempotent
  });

  it('resolveTestDatabaseUrl prefers TEST_DATABASE_URL, else derives, never returns dev unchanged', () => {
    const prevTest = process.env.TEST_DATABASE_URL;
    const prevDev = process.env.DATABASE_URL;
    try {
      process.env.TEST_DATABASE_URL = U('explicit_test');
      expect(resolveTestDatabaseUrl()).toBe(U('explicit_test'));
      delete process.env.TEST_DATABASE_URL;
      process.env.DATABASE_URL = U('cytolab');
      expect(resolveTestDatabaseUrl()).toBe(U('cytolab_test')); // never the raw dev url
    } finally {
      if (prevTest === undefined) delete process.env.TEST_DATABASE_URL;
      else process.env.TEST_DATABASE_URL = prevTest;
      process.env.DATABASE_URL = prevDev;
    }
  });
});
