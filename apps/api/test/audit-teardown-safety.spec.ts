/**
 * Program 2 · P2-R016A — static guard against the teardown patterns that caused R-016. It scans the
 * audit test sources and fails if any reintroduces a dangerous shared-chain deletion, a bare
 * PrismaClient (bypassing the isolation guard), or a production import of the test-only DB override.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const API = join(__dirname, '..');
const AUDIT = join(API, 'src', 'modules', 'audit');
const TESTDIR = __dirname;

function walk(dir: string, filter: (f: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'node_modules' || name === 'dist') continue;
    if (statSync(p).isDirectory()) out.push(...walk(p, filter));
    else if (filter(p)) out.push(p);
  }
  return out;
}

const specFiles = [
  ...walk(AUDIT, (f) => f.endsWith('.spec.ts')),
  ...walk(TESTDIR, (f) => f.endsWith('.spec.ts')),
];
const rel = (f: string) => f.replace(API + '/', '');

describe('P2-R016A — dangerous audit-teardown static guard', () => {
  it('discovers the audit spec files it protects', () => {
    expect(specFiles.length).toBeGreaterThan(5);
  });

  it('no spec deletes a shared chain head by literal identity (system / cross-lab)', () => {
    const offenders: string[] = [];
    for (const f of specFiles) {
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          const isHeadDelete = /(DELETE\s+FROM\s+"?AuditChainHead"?|auditChainHead\.(deleteMany|delete)\b)/i.test(line);
          const namesSharedChain = /['"](system|cross-lab)['"]/.test(line);
          if (isHeadDelete && namesSharedChain) offenders.push(`${rel(f)}:${i + 1}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  it('no spec performs a wildcard / unfiltered chain-head deletion', () => {
    const offenders: string[] = [];
    for (const f of specFiles) {
      const src = readFileSync(f, 'utf8');
      if (/auditChainHead\.deleteMany\(\s*(\{\s*\})?\s*\)/.test(src)) offenders.push(`${rel(f)} (deleteMany all)`);
      // A raw head DELETE with no WHERE clause.
      src.split('\n').forEach((line, i) => {
        if (/DELETE\s+FROM\s+"?AuditChainHead"?/i.test(line) && !/WHERE/i.test(line)) {
          offenders.push(`${rel(f)}:${i + 1} (no WHERE)`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('every audit integration/service spec obtains its client through the isolation guard (no bare PrismaClient)', () => {
    const offenders: string[] = [];
    for (const f of specFiles) {
      if (/new PrismaClient\(/.test(readFileSync(f, 'utf8'))) offenders.push(rel(f));
    }
    expect(offenders).toEqual([]);
  });

  it('no PRODUCTION source imports the test-only database override', () => {
    const prod = walk(join(API, 'src'), (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'));
    const offenders = prod.filter((f) => /@test\/test-database|\.\.\/test\/test-database/.test(readFileSync(f, 'utf8')));
    expect(offenders.map(rel)).toEqual([]);
  });
});
