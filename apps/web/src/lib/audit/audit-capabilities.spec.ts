import { deriveAuditCapabilities, AUDIT_READ, AUDIT_SYSTEM_READ, AUDIT_PHI_READ } from './audit-capabilities';

describe('P2-8B — audit capability derivation', () => {
  it('maps each of the three independent permissions', () => {
    const perms = new Set([AUDIT_READ, AUDIT_PHI_READ]);
    const can = (c?: string) => (c ? perms.has(c) : true);
    expect(deriveAuditCapabilities(can)).toEqual({ canRead: true, canSystem: false, canPhi: true });
  });

  it('a lone read grants only base access', () => {
    const can = (c?: string) => c === AUDIT_READ;
    expect(deriveAuditCapabilities(can)).toEqual({ canRead: true, canSystem: false, canPhi: false });
  });

  it('a superuser-style can (allows everything) grants all', () => {
    const can = () => true;
    expect(deriveAuditCapabilities(can)).toEqual({ canRead: true, canSystem: true, canPhi: true });
  });

  it('no audit permissions → nothing', () => {
    const can = (c?: string) => (c ? false : true);
    expect(deriveAuditCapabilities(can)).toEqual({ canRead: false, canSystem: false, canPhi: false });
    expect(AUDIT_SYSTEM_READ).toBe('audit:read_system');
  });
});
