import {
  SamlProviderConfig,
  certificateFingerprint,
  certificateNotAfter,
  configFingerprint,
  isAllowedNameIdFormat,
  looksLikeEncryptedAssertion,
  SAML_DEFAULT_NAMEID_FORMATS,
} from './saml-config';
import { TEST_IDP_CERT_PEM, TEST_IDP_CERT2_PEM, TEST_DEFAULTS } from './testing/saml-test-vectors';

/**
 * Program 7 · Phase 7A.3 — SAML config policy unit tests (no XML, no DB). Cover the deterministic fingerprints (P12),
 * the certificate identifier, the NameID-format policy (S8/3b), and the EncryptedAssertion refusal gate (S7).
 */
function cfg(overrides: Partial<SamlProviderConfig> = {}): SamlProviderConfig {
  return {
    providerId: 'prov-1',
    providerKey: 'idp',
    idpEntityId: TEST_DEFAULTS.idpEntityId,
    spEntityId: TEST_DEFAULTS.spEntityId,
    acsUrl: TEST_DEFAULTS.acsUrl,
    idpSsoUrl: 'https://idp.test/sso',
    nameIdFormat: null,
    wantAssertionsSigned: true,
    signingCerts: [{ fingerprint: certificateFingerprint(TEST_IDP_CERT_PEM), pem: TEST_IDP_CERT_PEM }],
    ...overrides,
  };
}

describe('saml-config', () => {
  describe('certificateFingerprint', () => {
    it('is deterministic, lowercase-hex, colon-free', () => {
      const fp = certificateFingerprint(TEST_IDP_CERT_PEM);
      expect(fp).toBe(certificateFingerprint(TEST_IDP_CERT_PEM));
      expect(fp).toMatch(/^[0-9a-f]{64}$/);
    });
    it('differs per certificate', () => {
      expect(certificateFingerprint(TEST_IDP_CERT_PEM)).not.toBe(certificateFingerprint(TEST_IDP_CERT2_PEM));
    });
    it('throws on a malformed certificate (fail closed at config time)', () => {
      expect(() => certificateFingerprint('-----BEGIN CERTIFICATE-----\nnot-a-cert\n-----END CERTIFICATE-----')).toThrow();
    });
    it('exposes a notAfter for a valid cert', () => {
      expect(certificateNotAfter(TEST_IDP_CERT_PEM)).toBeInstanceOf(Date);
    });
  });

  describe('configFingerprint', () => {
    it('is stable for identical config (P12)', () => {
      expect(configFingerprint(cfg())).toBe(configFingerprint(cfg()));
    });
    it('is order-independent across the cert set', () => {
      const a = certificateFingerprint(TEST_IDP_CERT_PEM);
      const b = certificateFingerprint(TEST_IDP_CERT2_PEM);
      const one = cfg({ signingCerts: [{ fingerprint: a, pem: TEST_IDP_CERT_PEM }, { fingerprint: b, pem: TEST_IDP_CERT2_PEM }] });
      const two = cfg({ signingCerts: [{ fingerprint: b, pem: TEST_IDP_CERT2_PEM }, { fingerprint: a, pem: TEST_IDP_CERT_PEM }] });
      expect(configFingerprint(one)).toBe(configFingerprint(two));
    });
    it('changes when any trust-basis field changes (incl. cert rollover)', () => {
      const base = configFingerprint(cfg());
      expect(configFingerprint(cfg({ idpEntityId: 'https://other/idp' }))).not.toBe(base);
      expect(configFingerprint(cfg({ spEntityId: 'https://other/sp' }))).not.toBe(base);
      expect(configFingerprint(cfg({ acsUrl: 'https://other/acs' }))).not.toBe(base);
      expect(configFingerprint(cfg({ signingCerts: [{ fingerprint: certificateFingerprint(TEST_IDP_CERT2_PEM), pem: TEST_IDP_CERT2_PEM }] }))).not.toBe(base);
    });
  });

  describe('isAllowedNameIdFormat (S8/3b)', () => {
    it('accepts the default allowlist when no explicit policy', () => {
      for (const f of SAML_DEFAULT_NAMEID_FORMATS) expect(isAllowedNameIdFormat(f, cfg())).toBe(true);
    });
    it('rejects transient by default', () => {
      expect(isAllowedNameIdFormat('urn:oasis:names:tc:SAML:2.0:nameid-format:transient', cfg())).toBe(false);
    });
    it('rejects a missing/blank format (fail closed)', () => {
      expect(isAllowedNameIdFormat(undefined, cfg())).toBe(false);
      expect(isAllowedNameIdFormat('', cfg())).toBe(false);
    });
    it('enforces an explicit provider policy exactly', () => {
      const c = cfg({ nameIdFormat: 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent' });
      expect(isAllowedNameIdFormat('urn:oasis:names:tc:SAML:2.0:nameid-format:persistent', c)).toBe(true);
      expect(isAllowedNameIdFormat('urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress', c)).toBe(false);
    });
  });

  describe('looksLikeEncryptedAssertion (S7)', () => {
    it('detects an EncryptedAssertion element', () => {
      expect(looksLikeEncryptedAssertion('<samlp:Response><saml:EncryptedAssertion/></samlp:Response>')).toBe(true);
    });
    it('detects EncryptedData', () => {
      expect(looksLikeEncryptedAssertion('<xenc:EncryptedData xmlns:xenc="..."/>')).toBe(true);
    });
    it('passes a plain signed-assertion response through', () => {
      expect(looksLikeEncryptedAssertion('<samlp:Response><saml:Assertion ID="_a"/></samlp:Response>')).toBe(false);
    });
  });
});
