import { validateMetadata, InvalidAuditMetadataError } from './audit-metadata';
import { resolveCurrent } from './audit.registry';

/**
 * Program 2 · P2-6D — conformance for the authorization-governance taxonomy (registry + metadata),
 * proving the frozen P2-6B classification is registered exactly and authz.role_assignment.v1 admits
 * only bounded counts (never role ids/names/permission lists/user names).
 */
describe('P2-6D — authz.role_assignment.v1 metadata contract', () => {
  it('accepts counts only (added/removed required, resulting optional)', () => {
    expect(validateMetadata('authz.role_assignment.v1', { rolesAddedCount: 2, rolesRemovedCount: 1, resultingRoleCount: 3 })).toEqual({
      rolesAddedCount: 2,
      rolesRemovedCount: 1,
      resultingRoleCount: 3,
    });
    expect(validateMetadata('authz.role_assignment.v1', { rolesAddedCount: 0, rolesRemovedCount: 0 })).toBeTruthy();
  });

  it('requires rolesAddedCount and rolesRemovedCount', () => {
    expect(() => validateMetadata('authz.role_assignment.v1', { rolesAddedCount: 1 } as any)).toThrow(InvalidAuditMetadataError);
    expect(() => validateMetadata('authz.role_assignment.v1', { rolesRemovedCount: 1 } as any)).toThrow(InvalidAuditMetadataError);
  });

  it('rejects negatives and non-integers', () => {
    expect(() => validateMetadata('authz.role_assignment.v1', { rolesAddedCount: -1, rolesRemovedCount: 0 })).toThrow(InvalidAuditMetadataError);
    expect(() => validateMetadata('authz.role_assignment.v1', { rolesAddedCount: 1.5, rolesRemovedCount: 0 })).toThrow(InvalidAuditMetadataError);
  });

  it('rejects any role id / name / permission payload (undeclared keys)', () => {
    expect(() => validateMetadata('authz.role_assignment.v1', { rolesAddedCount: 1, rolesRemovedCount: 0, roleIds: 'r1,r2' } as any)).toThrow(InvalidAuditMetadataError);
    expect(() => validateMetadata('authz.role_assignment.v1', { rolesAddedCount: 1, rolesRemovedCount: 0, roleName: 'Admin' } as any)).toThrow(InvalidAuditMetadataError);
    expect(() => validateMetadata('authz.role_assignment.v1', { rolesAddedCount: 1, rolesRemovedCount: 0, permissions: 'x' } as any)).toThrow(InvalidAuditMetadataError);
  });
});

describe('P2-6D — registry classification matches frozen P2-6B taxonomy', () => {
  const expected = {
    ROLE_CREATED: { defaultSeverity: 'NOTICE', retentionClass: 'EXTENDED', metadataContractId: null },
    ROLE_UPDATED: { defaultSeverity: 'WARNING', retentionClass: 'EXTENDED', metadataContractId: null },
    ROLE_DELETED: { defaultSeverity: 'WARNING', retentionClass: 'PERMANENT', metadataContractId: null },
    ROLE_ASSIGNMENT_CHANGED: { defaultSeverity: 'WARNING', retentionClass: 'EXTENDED', metadataContractId: 'authz.role_assignment.v1' },
  } as const;

  for (const [actionCode, exp] of Object.entries(expected)) {
    it(`AUTHORIZATION:${actionCode} is OPERATIONAL, non-PHI, CONFIDENTIAL, HTTP_REQUEST, v1`, () => {
      const entry = resolveCurrent('AUTHORIZATION', actionCode);
      expect(entry.eventVersion).toBe(1);
      expect(entry.durabilityClass).toBe('OPERATIONAL');
      expect(entry.phiIndicator).toBe(false);
      expect(entry.dataClass).toBe('CONFIDENTIAL');
      expect(entry.attributionPolicy).toBe('HTTP_REQUEST');
      expect(entry.defaultSeverity).toBe(exp.defaultSeverity);
      expect(entry.retentionClass).toBe(exp.retentionClass);
      expect(entry.metadataContractId).toBe(exp.metadataContractId);
    });
  }
});
