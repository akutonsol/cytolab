/**
 * Program 4 · D-1 — DB pool configuration (config-only, behavior-neutral).
 * `poolDatasourceOptions` applies connection_limit / pool_timeout to the datasource
 * URL when the env knobs are set, and returns undefined (unchanged behavior) otherwise.
 */
import { poolDatasourceOptions } from './prisma.service';

describe('poolDatasourceOptions (D-1 pool config)', () => {
  const ORIGINAL_URL = process.env.DATABASE_URL;
  afterEach(() => {
    delete process.env.DATABASE_CONNECTION_LIMIT;
    delete process.env.DATABASE_POOL_TIMEOUT;
    if (ORIGINAL_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = ORIGINAL_URL;
  });

  it('returns undefined when no override env is set (unchanged behavior)', () => {
    process.env.DATABASE_URL = 'postgresql://u:p@h:5432/db?schema=public';
    delete process.env.DATABASE_CONNECTION_LIMIT;
    delete process.env.DATABASE_POOL_TIMEOUT;
    expect(poolDatasourceOptions()).toBeUndefined();
  });

  it('applies connection_limit + pool_timeout, preserving existing params', () => {
    process.env.DATABASE_URL = 'postgresql://u:p@h:5432/db?schema=public&sslmode=require';
    process.env.DATABASE_CONNECTION_LIMIT = '5';
    process.env.DATABASE_POOL_TIMEOUT = '10';
    const opts = poolDatasourceOptions();
    expect(opts).toBeDefined();
    const url = new URL(opts!.datasources.db.url);
    expect(url.searchParams.get('connection_limit')).toBe('5');
    expect(url.searchParams.get('pool_timeout')).toBe('10');
    expect(url.searchParams.get('schema')).toBe('public'); // untouched
    expect(url.searchParams.get('sslmode')).toBe('require'); // untouched
  });

  it('applies only connection_limit when pool_timeout is absent', () => {
    process.env.DATABASE_URL = 'postgresql://u:p@h:5432/db';
    process.env.DATABASE_CONNECTION_LIMIT = '8';
    const url = new URL(poolDatasourceOptions()!.datasources.db.url);
    expect(url.searchParams.get('connection_limit')).toBe('8');
    expect(url.searchParams.get('pool_timeout')).toBeNull();
  });

  it('returns undefined when DATABASE_URL is absent', () => {
    delete process.env.DATABASE_URL;
    process.env.DATABASE_CONNECTION_LIMIT = '5';
    expect(poolDatasourceOptions()).toBeUndefined();
  });
});
