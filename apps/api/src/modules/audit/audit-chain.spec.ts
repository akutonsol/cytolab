import {
  AUDIT_HASH_ALGORITHM,
  AuditChainScopeError,
  GENESIS_PREV_HASH,
  GENESIS_SEQUENCE,
  deriveChainId,
} from './audit-chain';

describe('audit chain constants (P2-4B)', () => {
  it('genesis sequence is 1', () => {
    expect(GENESIS_SEQUENCE).toBe(1n);
  });

  it('genesis prevHash is a 64-char lowercase-hex zero sentinel', () => {
    expect(GENESIS_PREV_HASH).toBe('0'.repeat(64));
    expect(GENESIS_PREV_HASH).toHaveLength(64);
    expect(GENESIS_PREV_HASH).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hash algorithm identifier is versioned', () => {
    expect(AUDIT_HASH_ALGORITHM).toBe('sha256/v1');
  });
});

describe('deriveChainId (pure derivation, no allocation)', () => {
  it('LAB scope → per-tenant chain', () => {
    expect(deriveChainId('LAB', 'lab-123')).toBe('lab:lab-123');
  });

  it('SYSTEM scope → system chain', () => {
    expect(deriveChainId('SYSTEM', null)).toBe('system');
  });

  it('CROSS_LAB scope → cross-lab chain', () => {
    expect(deriveChainId('CROSS_LAB', null)).toBe('cross-lab');
  });

  it('LAB scope without a scopeLabId fails closed', () => {
    expect(() => deriveChainId('LAB', null)).toThrow(AuditChainScopeError);
    expect(() => deriveChainId('LAB', undefined)).toThrow(AuditChainScopeError);
  });
});
