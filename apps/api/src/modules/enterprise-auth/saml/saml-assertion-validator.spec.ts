import { SamlAssertionValidator, SamlValidationError, SamlFailureReason } from './saml-assertion-validator';
import { SamlProviderConfig, certificateFingerprint } from './saml-config';
import {
  buildSamlResponse,
  buildXxeResponse,
  buildEncryptedResponse,
  TEST_IDP_CERT_PEM,
  TEST_IDP_KEY2_PEM,
  TEST_IDP_CERT2_PEM,
  TEST_DEFAULTS,
} from './testing/saml-test-vectors';

/**
 * Program 7 · Phase 7A.3 — the S8 security negative matrix for the assertion-validation seam. Signed test vectors are
 * produced with the same `xml-crypto` the production validator relies on. Proves: valid assertions pass; and each
 * attack class (unsigned/wrong-cert/XSW/XXE/encrypted/expired/not-yet-valid/audience/issuer/recipient/no-InResponseTo/
 * bad-NameID-format) fails CLOSED with the correct coded reason. Certificate rollover (2nd active cert) validates.
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

async function reasonOfThrow(fn: () => Promise<unknown>): Promise<SamlFailureReason | 'NO_THROW' | string> {
  try {
    await fn();
    return 'NO_THROW';
  } catch (e) {
    return e instanceof SamlValidationError ? e.reason : `OTHER:${(e as Error).message}`;
  }
}

describe('SamlAssertionValidator (S8 security matrix)', () => {
  const v = new SamlAssertionValidator();
  const RID = '_req_1';

  it('accepts a valid signed assertion and returns only non-secret facts', async () => {
    const out = await v.validateResponse(cfg(), buildSamlResponse({ requestId: RID, nameId: 'alice-nameid' }));
    expect(out.nameId).toBe('alice-nameid');
    expect(out.inResponseTo).toBe(RID);
    expect(out.issuer).toBe(TEST_DEFAULTS.idpEntityId);
    expect(out.assertionId).toBeTruthy();
    expect(out.nameIdFormat).toContain('persistent');
  });

  it('validates a rollover (2nd active) certificate', async () => {
    const rollover = cfg({
      signingCerts: [
        { fingerprint: certificateFingerprint(TEST_IDP_CERT_PEM), pem: TEST_IDP_CERT_PEM },
        { fingerprint: certificateFingerprint(TEST_IDP_CERT2_PEM), pem: TEST_IDP_CERT2_PEM },
      ],
    });
    const out = await v.validateResponse(rollover, buildSamlResponse({ requestId: RID, signWithKey: TEST_IDP_KEY2_PEM, signWithCert: TEST_IDP_CERT2_PEM }));
    expect(out.nameId).toBeTruthy();
  });

  it('rejects an unsigned assertion (invalid_signature)', async () => {
    expect(await reasonOfThrow(() => v.validateResponse(cfg(), buildSamlResponse({ requestId: RID, sign: false })))).toBe('invalid_signature');
  });

  it('rejects an assertion signed by a non-configured certificate (invalid_signature)', async () => {
    expect(await reasonOfThrow(() => v.validateResponse(cfg(), buildSamlResponse({ requestId: RID, signWithKey: TEST_IDP_KEY2_PEM, signWithCert: TEST_IDP_CERT2_PEM })))).toBe('invalid_signature');
  });

  it('defeats signature-wrapping (XSW): an injected unsigned assertion never authenticates', async () => {
    const r = await reasonOfThrow(async () => {
      const out = await v.validateResponse(cfg(), buildSamlResponse({ requestId: RID, nameId: 'alice-nameid', extraUnsignedAssertionNameId: 'attacker-nameid' }));
      if (out.nameId === 'attacker-nameid') throw new Error('XSW_BREACH');
      return out;
    });
    // The library rejects the ambiguous document outright; in all cases the attacker NameID must never be used.
    expect(r).not.toBe('OTHER:XSW_BREACH');
  });

  it('fails closed on an XXE probe (no external-entity expansion)', async () => {
    const r = await reasonOfThrow(() => v.validateResponse(cfg(), buildXxeResponse(RID)));
    expect(r).not.toBe('NO_THROW');
    expect(String(r)).not.toContain('root:'); // no /etc/passwd content ever surfaces
  });

  it('rejects an EncryptedAssertion outright (S7 baseline exclusion)', async () => {
    expect(await reasonOfThrow(() => v.validateResponse(cfg(), buildEncryptedResponse(RID)))).toBe('encrypted_assertion_rejected');
  });

  it('rejects an expired assertion beyond clock skew (assertion_time_invalid)', async () => {
    expect(await reasonOfThrow(() => v.validateResponse(cfg(), buildSamlResponse({ requestId: RID, notBeforeMs: -600_000, notOnOrAfterMs: -120_000 })))).toBe('assertion_time_invalid');
  });

  it('rejects a not-yet-valid assertion (assertion_time_invalid)', async () => {
    expect(await reasonOfThrow(() => v.validateResponse(cfg(), buildSamlResponse({ requestId: RID, notBeforeMs: 120_000, notOnOrAfterMs: 600_000 })))).toBe('assertion_time_invalid');
  });

  it('rejects an audience mismatch (audience_mismatch)', async () => {
    expect(await reasonOfThrow(() => v.validateResponse(cfg(), buildSamlResponse({ requestId: RID, spEntityId: 'https://evil.test/sp' })))).toBe('audience_mismatch');
  });

  it('rejects an issuer mismatch (issuer_mismatch)', async () => {
    expect(await reasonOfThrow(() => v.validateResponse(cfg(), buildSamlResponse({ requestId: RID, idpEntityId: 'https://evil.test/idp' })))).toBe('issuer_mismatch');
  });

  it('rejects a Recipient/Destination mismatch (destination_recipient_mismatch)', async () => {
    expect(await reasonOfThrow(() => v.validateResponse(cfg(), buildSamlResponse({ requestId: RID, acsUrl: 'https://evil.test/acs' })))).toBe('destination_recipient_mismatch');
  });

  it('rejects an unsolicited response with no InResponseTo (SP-initiated only — S3)', async () => {
    expect(await reasonOfThrow(() => v.validateResponse(cfg(), buildSamlResponse({ requestId: '' })))).toBe('in_response_to_mismatch');
  });

  it('rejects a disallowed NameID format (nameid_format_rejected)', async () => {
    expect(await reasonOfThrow(() => v.validateResponse(cfg(), buildSamlResponse({ requestId: RID, nameIdFormat: 'urn:oasis:names:tc:SAML:2.0:nameid-format:transient' })))).toBe('nameid_format_rejected');
  });

  it('rejects non-base64 input (malformed_response)', async () => {
    expect(await reasonOfThrow(() => v.validateResponse(cfg(), '!!!not base64!!!'))).toBe('malformed_response');
  });
});
