import { ForbiddenException } from '@nestjs/common';
import { AUDIT_READ, AUDIT_SYSTEM_READ, AUDIT_PHI_READ } from './audit-query.permissions';
import { resolveAuditQueryScope, resolveAuditPhiAccess, isSystemReader, MAX_CROSS_LAB_IDS } from './audit-query.policy';
import { AuditReaderPrincipal } from './audit-query.types';

const P = (over: Partial<AuditReaderPrincipal>): AuditReaderPrincipal => ({ permissions: [], ...over });

describe('P2-7A — audit-query scope policy', () => {
  describe('LAB reader (AUDIT_READ only)', () => {
    const lab = P({ labId: 'lab1', permissions: [AUDIT_READ] });

    it('is pinned to its own lab (default and explicit)', () => {
      expect(resolveAuditQueryScope(lab)).toEqual({ kind: 'LAB', labId: 'lab1' });
      expect(resolveAuditQueryScope(lab, { scope: 'LAB', labIds: ['lab1'] })).toEqual({ kind: 'LAB', labId: 'lab1' });
    });
    it('cannot select another lab', () => {
      expect(() => resolveAuditQueryScope(lab, { scope: 'LAB', labIds: ['lab2'] })).toThrow(ForbiddenException);
    });
    it('cannot activate SYSTEM or CROSS_LAB scope', () => {
      expect(() => resolveAuditQueryScope(lab, { scope: 'SYSTEM' })).toThrow(ForbiddenException);
      expect(() => resolveAuditQueryScope(lab, { scope: 'CROSS_LAB', labIds: ['lab1', 'lab2'] })).toThrow(ForbiddenException);
    });
    it('is not a system reader', () => {
      expect(isSystemReader(lab)).toBe(false);
    });
    it('a lab-less LAB reader is denied', () => {
      expect(() => resolveAuditQueryScope(P({ permissions: [AUDIT_READ] }))).toThrow(ForbiddenException);
    });
  });

  describe('SYSTEM reader (AUDIT_READ + AUDIT_SYSTEM_READ)', () => {
    const sys = P({ labId: 'lab1', permissions: [AUDIT_READ, AUDIT_SYSTEM_READ] });

    it('a lone audit:read_system (without audit:read) is denied — locked model', () => {
      expect(() => resolveAuditQueryScope(P({ labId: 'lab1', permissions: [AUDIT_SYSTEM_READ] }))).toThrow(ForbiddenException);
    });

    it('defaults to SYSTEM (no broad lab visibility from holding a labId)', () => {
      expect(resolveAuditQueryScope(sys)).toEqual({ kind: 'SYSTEM' });
    });
    it('may select SYSTEM, a single LAB, or a bounded CROSS_LAB set', () => {
      expect(resolveAuditQueryScope(sys, { scope: 'SYSTEM' })).toEqual({ kind: 'SYSTEM' });
      expect(resolveAuditQueryScope(sys, { scope: 'LAB', labIds: ['labX'] })).toEqual({ kind: 'LAB', labId: 'labX' });
      expect(resolveAuditQueryScope(sys, { scope: 'CROSS_LAB', labIds: ['a', 'b'] })).toEqual({ kind: 'CROSS_LAB', labIds: ['a', 'b'] });
    });
    it('rejects a CROSS_LAB set over the bound', () => {
      const many = Array.from({ length: MAX_CROSS_LAB_IDS + 1 }, (_, i) => `l${i}`);
      expect(() => resolveAuditQueryScope(sys, { scope: 'CROSS_LAB', labIds: many })).toThrow(ForbiddenException);
    });
    it('LAB scope requires exactly one labId', () => {
      expect(() => resolveAuditQueryScope(sys, { scope: 'LAB', labIds: ['a', 'b'] })).toThrow(ForbiddenException);
    });
  });

  describe('superuser', () => {
    const su = P({ isSuperRole: true });
    it('satisfies every gate', () => {
      expect(resolveAuditQueryScope(su, { scope: 'SYSTEM' })).toEqual({ kind: 'SYSTEM' });
      expect(resolveAuditPhiAccess(su, true)).toBe(true);
    });
  });

  describe('no audit permission', () => {
    it('is denied entirely', () => {
      expect(() => resolveAuditQueryScope(P({ labId: 'lab1', permissions: ['client:view'] }))).toThrow(ForbiddenException);
    });
    it('holding system:security does NOT grant audit read (no misleading reuse)', () => {
      expect(() => resolveAuditQueryScope(P({ labId: 'lab1', permissions: ['system:security'] }))).toThrow(ForbiddenException);
    });
  });

  describe('PHI is an independent dimension', () => {
    it('excluded by default (not requested)', () => {
      expect(resolveAuditPhiAccess(P({ permissions: [AUDIT_READ] }), false)).toBe(false);
    });
    it('SYSTEM access alone does not grant PHI', () => {
      expect(() => resolveAuditPhiAccess(P({ permissions: [AUDIT_SYSTEM_READ] }), true)).toThrow(ForbiddenException);
    });
    it('granted only with AUDIT_PHI_READ', () => {
      expect(resolveAuditPhiAccess(P({ permissions: [AUDIT_READ, AUDIT_PHI_READ] }), true)).toBe(true);
    });
  });
});
