import { createHash, X509Certificate } from 'node:crypto';

/**
 * Program 7 · Phase 7A.3 — SAML value types, central policy constants, the configuration fingerprint, deterministic
 * certificate fingerprints, the NameID-format policy, and a structural EncryptedAssertion refusal gate. The fingerprint
 * is a digest over the trusted provider configuration in effect at request INITIATION; the ACS re-checks it and fails
 * closed on any change (config-immutability invariant — S4/S5). NO XML parsing or signature logic lives here; all of
 * that is delegated to the vetted library behind `SamlAssertionValidator` (S2).
 */

/** A configured IdP signing certificate (the trust anchor — S4). `fingerprint` is a deterministic sha256(DER) id. */
export interface SamlSigningCert {
  fingerprint: string;
  pem: string;
}

/** The trusted, resolved SAML provider configuration (SP-initiated Web-SSO; S3). */
export interface SamlProviderConfig {
  providerId: string;
  providerKey: string;
  idpEntityId: string; // expected IdP entityID (Issuer) — trust-anchor identity (S8)
  spEntityId: string; // OUR entityID — required assertion Audience (S8)
  acsUrl: string; // OUR ACS — required Destination / SubjectConfirmationData.Recipient (S8)
  idpSsoUrl: string; // IdP SSO endpoint (HTTP-Redirect binding)
  nameIdFormat: string | null; // allowed NameID-format policy (null ⇒ default policy)
  wantAssertionsSigned: boolean; // baseline requires signed assertions (S7 signed-only)
  signingCerts: SamlSigningCert[]; // one or more ACTIVE certs — bounded rollover (S4)
}

/** Central policy. SHA-1 and `none` are never acceptable; exclusive C14N only. Bounded clock skew mirrors OIDC. */
export const SAML_CLOCK_SKEW_SECONDS = 60;
export const SAML_REQUEST_TTL_MS = 10 * 60 * 1000;
export const SAML_ALLOWED_SIGNATURE_ALGORITHMS = [
  'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
  'http://www.w3.org/2001/04/xmldsig-more#rsa-sha512',
  'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256',
];
export const SAML_ALLOWED_DIGEST_ALGORITHMS = ['http://www.w3.org/2001/04/xmlenc#sha256', 'http://www.w3.org/2001/04/xmlenc#sha512'];
export const SAML_ALLOWED_CANONICALIZATION = ['http://www.w3.org/2001/10/xml-exc-c14n#', 'http://www.w3.org/2001/10/xml-exc-c14n#WithComments'];

/** Default NameID formats accepted when a provider sets no explicit policy. Transient is deliberately excluded. */
export const SAML_DEFAULT_NAMEID_FORMATS = [
  'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
  'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
  'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified',
];

/**
 * Deterministic identifier for a configured signing certificate: lowercase, colon-stripped sha256 of the DER. Also
 * validates the PEM is a real X.509 certificate (throws otherwise). Used as the stable cert id / rollover key (S4).
 */
export function certificateFingerprint(pem: string): string {
  const cert = new X509Certificate(pem); // throws on a malformed cert — fail closed at configuration time
  return cert.fingerprint256.replace(/:/g, '').toLowerCase();
}

/** The `notAfter` of a configured certificate (for expiry hints / RETIRED GC). */
export function certificateNotAfter(pem: string): Date | null {
  const validTo = new Date(new X509Certificate(pem).validTo);
  return Number.isNaN(validTo.getTime()) ? null : validTo;
}

/**
 * Digest binding provider id + IdP/SP entityIDs + ACS + SSO URL + NameID policy + signed-assertion flag + the SORTED
 * set of configured cert fingerprints. Same inputs ⇒ same fingerprint (P12). Any trust-basis change (incl. a cert
 * rollover) changes the fingerprint, so a config change between initiate and ACS fails closed (S4/S5).
 */
export function configFingerprint(c: SamlProviderConfig): string {
  const canonical = JSON.stringify({
    providerId: c.providerId,
    idpEntityId: c.idpEntityId,
    spEntityId: c.spEntityId,
    acsUrl: c.acsUrl,
    idpSsoUrl: c.idpSsoUrl,
    nameIdFormat: c.nameIdFormat ?? null,
    wantAssertionsSigned: c.wantAssertionsSigned,
    certFingerprints: [...c.signingCerts.map((s) => s.fingerprint)].sort(),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/** NameID-format policy (S8): the provider's configured format if set, else the default allowlist. Transient rejected. */
export function isAllowedNameIdFormat(format: string | undefined | null, config: SamlProviderConfig): boolean {
  if (!format) return false; // a NameID with no/blank format fails closed
  if (config.nameIdFormat) return format === config.nameIdFormat;
  return SAML_DEFAULT_NAMEID_FORMATS.includes(format);
}

/**
 * Structural EncryptedAssertion refusal gate (S7). This is a fail-closed REFUSAL check on the decoded response text —
 * NOT signature/security logic and NOT a substitute for the library's validation. The baseline supports signed,
 * UNENCRYPTED assertions only; an encrypted assertion is detected here and rejected with a coded error before the
 * library is invoked. (Defense in depth: without a decryption key the library would also fail closed.)
 */
export function looksLikeEncryptedAssertion(decodedResponseXml: string): boolean {
  return /(?:^|[<:])EncryptedAssertion[\s/>]/.test(decodedResponseXml) || /(?:^|[<:])EncryptedData[\s/>]/.test(decodedResponseXml);
}
