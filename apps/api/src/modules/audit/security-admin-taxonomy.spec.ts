import { validateMetadata, InvalidAuditMetadataError, SESSION_TERMINATION_SCOPES } from './audit-metadata';
import { resolveCurrent } from './audit.registry';

/**
 * Program 2 · P2-6E — conformance for the security-administration taxonomy (registry + metadata),
 * proving the frozen P2-6B classification is registered exactly and the two contracts admit only
 * bounded, secret-free fields.
 */
describe('P2-6E — registry classification matches frozen P2-6B taxonomy', () => {
  const expected: Record<string, { defaultSeverity: string; dataClass: string; metadataContractId: string | null }> = {
    ACCOUNT_UNLOCKED: { defaultSeverity: 'NOTICE', dataClass: 'CONFIDENTIAL', metadataContractId: null },
    PASSWORD_RESET_FORCED: { defaultSeverity: 'WARNING', dataClass: 'CONFIDENTIAL', metadataContractId: null },
    USER_MFA_RESET: { defaultSeverity: 'WARNING', dataClass: 'CONFIDENTIAL', metadataContractId: null },
    SESSION_TERMINATED: { defaultSeverity: 'NOTICE', dataClass: 'CONFIDENTIAL', metadataContractId: 'security.session_termination.v1' },
    IP_BLOCK_ADDED: { defaultSeverity: 'WARNING', dataClass: 'INTERNAL', metadataContractId: 'security.ip_block.v1' },
    IP_BLOCK_REMOVED: { defaultSeverity: 'NOTICE', dataClass: 'INTERNAL', metadataContractId: null },
    TRUSTED_DEVICE_REVOKED: { defaultSeverity: 'NOTICE', dataClass: 'CONFIDENTIAL', metadataContractId: null },
    SECURITY_ALERT_RESOLVED: { defaultSeverity: 'INFO', dataClass: 'INTERNAL', metadataContractId: null },
  };

  for (const [actionCode, exp] of Object.entries(expected)) {
    it(`SECURITY:${actionCode} is v1, OPERATIONAL, non-PHI, HTTP_REQUEST, EXTENDED`, () => {
      const entry = resolveCurrent('SECURITY', actionCode);
      expect(entry.eventVersion).toBe(1);
      expect(entry.durabilityClass).toBe('OPERATIONAL');
      expect(entry.phiIndicator).toBe(false);
      expect(entry.attributionPolicy).toBe('HTTP_REQUEST');
      expect(entry.retentionClass).toBe('EXTENDED');
      expect(entry.defaultSeverity).toBe(exp.defaultSeverity);
      expect(entry.dataClass).toBe(exp.dataClass);
      expect(entry.metadataContractId).toBe(exp.metadataContractId);
    });
  }
});

describe('P2-6E — security.session_termination.v1 metadata contract', () => {
  it('accepts only bounded scope + non-negative count', () => {
    expect(validateMetadata('security.session_termination.v1', { terminationScope: 'single', terminatedCount: 1 })).toEqual({ terminationScope: 'single', terminatedCount: 1 });
    expect(validateMetadata('security.session_termination.v1', { terminationScope: 'all', terminatedCount: 0 })).toBeTruthy();
    for (const s of SESSION_TERMINATION_SCOPES) {
      expect(validateMetadata('security.session_termination.v1', { terminationScope: s, terminatedCount: 3 })).toBeTruthy();
    }
  });

  it('requires both fields; rejects unapproved scope, negatives, non-integers', () => {
    expect(() => validateMetadata('security.session_termination.v1', { terminationScope: 'single' } as any)).toThrow(InvalidAuditMetadataError);
    expect(() => validateMetadata('security.session_termination.v1', { terminatedCount: 1 } as any)).toThrow(InvalidAuditMetadataError);
    expect(() => validateMetadata('security.session_termination.v1', { terminationScope: 'partial', terminatedCount: 1 } as any)).toThrow(InvalidAuditMetadataError);
    expect(() => validateMetadata('security.session_termination.v1', { terminationScope: 'all', terminatedCount: -1 })).toThrow(InvalidAuditMetadataError);
    expect(() => validateMetadata('security.session_termination.v1', { terminationScope: 'all', terminatedCount: 1.5 })).toThrow(InvalidAuditMetadataError);
  });

  it('rejects any undeclared / secret-bearing key (sessionIds, token, ip, notes)', () => {
    for (const bad of [{ sessionIds: 's1,s2' }, { token: 't' }, { ip: '1.2.3.4' }, { notes: 'x' }, { email: 'a@b.co' }]) {
      expect(() => validateMetadata('security.session_termination.v1', { terminationScope: 'all', terminatedCount: 1, ...bad } as any)).toThrow(InvalidAuditMetadataError);
    }
  });
});

describe('P2-6E — security.ip_block.v1 metadata contract', () => {
  it('accepts only { permanent: boolean }', () => {
    expect(validateMetadata('security.ip_block.v1', { permanent: true })).toEqual({ permanent: true });
    expect(validateMetadata('security.ip_block.v1', { permanent: false })).toBeTruthy();
  });

  it('requires permanent and rejects raw IP / reason / notes / any drift', () => {
    expect(() => validateMetadata('security.ip_block.v1', {} as any)).toThrow(InvalidAuditMetadataError);
    for (const bad of [{ rawIp: '1.2.3.4' }, { ip: '1.2.3.4' }, { reason: 'abuse' }, { notes: 'x' }, { deviceFingerprint: 'fp' }, { alertText: 'a' }]) {
      expect(() => validateMetadata('security.ip_block.v1', { permanent: true, ...bad } as any)).toThrow(InvalidAuditMetadataError);
    }
  });
});
