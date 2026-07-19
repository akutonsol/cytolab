import { safeAuditBackHref } from './audit-back-nav';

describe('P2-8D — return-path hardening', () => {
  it('accepts exactly /audit with an optional query string', () => {
    expect(safeAuditBackHref('/audit')).toBe('/audit');
    expect(safeAuditBackHref('/audit?scope=system&category=SECURITY')).toBe('/audit?scope=system&category=SECURITY');
    expect(safeAuditBackHref('/audit?phi=1')).toBe('/audit?phi=1');
  });

  it('rejects look-alike, nested, protocol-relative, absolute, and cross-origin paths', () => {
    for (const bad of ['/audit-other', '/audit/123', '/other', '//evil.com', 'http://evil.com/audit', 'https://x/audit', 'javascript:alert(1)', '', null, undefined]) {
      expect(safeAuditBackHref(bad as string)).toBe('/audit');
    }
  });
});
