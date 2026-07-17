import * as fs from 'fs';
import * as path from 'path';
import { isTenantModel } from '../../common/tenancy/tenancy.extension';
import { AuditPersistenceService } from './audit-persistence.service';

/**
 * Program 2 · P2-1 — architecture boundary & immutability enforcement.
 * These tests assert the guarantees P2-1 can truthfully make now. DB-role UPDATE/DELETE
 * revocation is a P2-10 certification obligation and is NOT asserted here.
 */

const SRC_ROOT = path.resolve(__dirname, '..', '..');
const AUDIT_DIR = path.resolve(__dirname);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (name === 'node_modules') continue;
      out.push(...walk(full));
    } else if (/\.ts$/.test(name) && !/\.spec\.ts$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe('tenancy: AuditEvent opts out of automatic lab-scoping', () => {
  it('AuditEvent is NOT a tenant model (scopeLabId, not labId)', () => {
    // A real `labId` column would auto-stamp/filter and break SYSTEM/CROSS_LAB events.
    expect(isTenantModel('AuditEvent')).toBe(false);
  });
});

describe('owner boundary: only the Audit owner touches the AuditEvent model', () => {
  it('no .auditEvent Prisma accessor exists outside src/modules/audit', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC_ROOT)) {
      if (file.startsWith(AUDIT_DIR)) continue;
      const text = fs.readFileSync(file, 'utf8');
      if (/\.auditEvent\b/.test(text)) offenders.push(path.relative(SRC_ROOT, file));
    }
    expect(offenders).toEqual([]);
  });
});

describe('immutability: the persistence surface is append-only', () => {
  it('exposes no update/delete/upsert method', () => {
    const proto = AuditPersistenceService.prototype as any;
    const methods = Object.getOwnPropertyNames(proto);
    for (const banned of ['update', 'delete', 'remove', 'upsert', 'destroy']) {
      expect(methods).not.toContain(banned);
    }
  });

  it('the persistence source never mutates or deletes an audit row', () => {
    const text = fs.readFileSync(
      path.join(AUDIT_DIR, 'audit-persistence.service.ts'),
      'utf8',
    );
    // The only permitted write is auditEvent.create(...).
    expect(text).toMatch(/auditEvent\.create\(/);
    expect(text).not.toMatch(/auditEvent\.(update|updateMany|delete|deleteMany|upsert)\(/);
  });
});
