import { Injectable } from '@nestjs/common';
import { SAML, SamlStatusError, ValidateInResponseTo } from '@node-saml/node-saml';
import {
  SamlProviderConfig,
  SAML_CLOCK_SKEW_SECONDS,
  isAllowedNameIdFormat,
  looksLikeEncryptedAssertion,
} from './saml-config';

/**
 * Program 7 · Phase 7A.3 — the SAML assertion-validation seam (S2). ALL XML parsing, canonicalization, XML Digital
 * Signature validation, X.509 handling, signature-reference resolution, and signature-wrapping (XSW) defenses are
 * delegated to the vetted `@node-saml/node-saml` library (backed by `xml-crypto`); no bespoke XML security logic is
 * written here (S2). This seam:
 *   • builds the SP-initiated AuthnRequest (HTTP-Redirect), binding OUR persisted `requestId` as the request ID;
 *   • validates a POST-binding SAML Response and enforces the S8 semantic-binding contract on the LIBRARY-VERIFIED
 *     output — identity attributes are read ONLY from the signed, validated assertion the library returns;
 *   • rejects `EncryptedAssertion` outright (S7 baseline exclusion, coded fail-closed) before the library runs.
 * Its only outputs are validated, non-secret facts; no library type, XML, signature, or certificate leaks downstream.
 * Provider-isolation invariant (7A.1): downstream consumes a canonical principal, never a SAML detail.
 */

export type SamlFailureReason =
  | 'idp_error'
  | 'malformed_response'
  | 'invalid_signature'
  | 'certificate_mismatch'
  | 'issuer_mismatch'
  | 'audience_mismatch'
  | 'destination_recipient_mismatch'
  | 'in_response_to_mismatch'
  | 'assertion_time_invalid'
  | 'nameid_format_rejected'
  | 'encrypted_assertion_rejected';

/** A coded, non-sensitive validation failure. The message never carries XML/assertion/signature/cert/NameID/PHI. */
export class SamlValidationError extends Error {
  constructor(public readonly reason: SamlFailureReason, message?: string) {
    super(message ?? reason);
    this.name = 'SamlValidationError';
  }
}

/** The validated, non-secret facts extracted from a signed assertion. NameID is an opaque external subject (S8/3b). */
export interface ValidatedSamlAssertion {
  issuer: string;
  nameId: string;
  nameIdFormat: string;
  inResponseTo: string;
  assertionId: string;
  notOnOrAfter: Date | null;
  sessionIndex?: string;
}

@Injectable()
export class SamlAssertionValidator {
  /** Build the SP-initiated AuthnRequest URL (HTTP-Redirect). `requestId` (ours) becomes the AuthnRequest ID (S8). */
  async buildAuthnRedirect(config: SamlProviderConfig, requestId: string, relayState: string): Promise<string> {
    const saml = new SAML(this.samlOptions(config, () => requestId));
    return saml.getAuthorizeUrlAsync(relayState, undefined, {});
  }

  /**
   * Validate a POST-binding SAML Response and return the S8-checked facts, or throw a coded `SamlValidationError`.
   * Signature/XSW/timestamps/audience/recipient/issuer are enforced by the library; this method additionally requires a
   * PRESENT `InResponseTo` (SP-initiated only — S3), an allowed NameID format, and a stable NameID + assertion ID (all
   * read from the library-verified assertion — never from a re-parse of raw XML). The EXACT `InResponseTo` → persisted
   * SP-request match is enforced by `SamlAuthRequestService.verifyAndConsume` (the single source of truth — S8).
   */
  async validateResponse(config: SamlProviderConfig, samlResponseB64: string): Promise<ValidatedSamlAssertion> {
    // S7 — refuse encrypted assertions before the library runs (coded fail-closed; defense-in-depth, not security logic).
    const decoded = safeBase64ToUtf8(samlResponseB64);
    if (!decoded) throw new SamlValidationError('malformed_response', 'response is not valid base64');
    if (looksLikeEncryptedAssertion(decoded)) throw new SamlValidationError('encrypted_assertion_rejected', 'encrypted assertions are not supported in the baseline');

    const saml = new SAML(this.samlOptions(config));
    let profile: Record<string, unknown> | null;
    try {
      const result = await saml.validatePostResponseAsync({ SAMLResponse: samlResponseB64 });
      profile = result.profile;
    } catch (e) {
      throw this.mapLibraryError(e);
    }
    if (!profile) throw new SamlValidationError('malformed_response', 'no profile');

    // Issuer must equal the configured IdP entityID (the library also enforces idpIssuer; this is a defence-in-depth check).
    const issuer = typeof profile.issuer === 'string' ? profile.issuer : '';
    if (issuer !== config.idpEntityId) throw new SamlValidationError('issuer_mismatch', 'assertion issuer is not the configured IdP');

    // InResponseTo MUST be present (SP-initiated only — S3); the EXACT match to the persisted SP request is enforced at
    // consume-time. An unsolicited/IdP-initiated response (no InResponseTo) fails closed here.
    const inResponseTo = typeof profile.inResponseTo === 'string' ? profile.inResponseTo : '';
    if (!inResponseTo) throw new SamlValidationError('in_response_to_mismatch', 'response has no InResponseTo (SP-initiated only)');

    // Stable NameID + allowed format policy (S8/3b). NameID is opaque; never matched on email/mutable claims.
    const nameId = typeof profile.nameID === 'string' ? profile.nameID : '';
    const nameIdFormat = typeof profile.nameIDFormat === 'string' ? profile.nameIDFormat : '';
    if (!nameId) throw new SamlValidationError('malformed_response', 'assertion has no NameID');
    if (!isAllowedNameIdFormat(nameIdFormat, config)) throw new SamlValidationError('nameid_format_rejected', 'NameID format is not allowed by policy');

    // Destination/Recipient binding (S8). Read the SubjectConfirmationData.Recipient from the SIGNATURE-VERIFIED
    // assertion subtree (integrity-protected) and require it equals OUR ACS. node-saml uses callbackUrl only to BUILD
    // requests, so this semantic policy on the verified value — not any XML/signature logic — is the validator's job.
    const assertion = typeof profile.getAssertion === 'function' ? (profile.getAssertion as () => Record<string, unknown>)() : null;
    const recipient = readSubjectRecipient(assertion);
    if (!recipient || recipient !== config.acsUrl) throw new SamlValidationError('destination_recipient_mismatch', 'SubjectConfirmationData Recipient is not our ACS');

    // Assertion ID + validity bound, read from the library-verified assertion (for the replay store). Fail closed if absent.
    const assertionId = readAssertionId(assertion);
    if (!assertionId) throw new SamlValidationError('malformed_response', 'assertion has no ID');
    const notOnOrAfter = readAssertionNotOnOrAfter(assertion);

    const sessionIndex = typeof profile.sessionIndex === 'string' ? profile.sessionIndex : undefined;
    return { issuer, nameId, nameIdFormat, inResponseTo, assertionId, notOnOrAfter, sessionIndex };
  }

  /** node-saml options. `generateId` (when supplied) pins our persisted requestId as the AuthnRequest ID. */
  private samlOptions(config: SamlProviderConfig, generateId?: () => string) {
    return {
      // trust anchor (S4): the CONFIGURED certs; the library never trusts message/metadata certs.
      idpCert: config.signingCerts.map((c) => c.pem),
      issuer: config.spEntityId, // SP entityID (our issuer in the AuthnRequest)
      idpIssuer: config.idpEntityId, // enforce the assertion Issuer equals the configured IdP entityID
      callbackUrl: config.acsUrl, // ACS — Destination / SubjectConfirmationData.Recipient (S8)
      entryPoint: config.idpSsoUrl, // IdP SSO endpoint (HTTP-Redirect)
      audience: config.spEntityId, // required AudienceRestriction (S8)
      wantAssertionsSigned: config.wantAssertionsSigned, // baseline requires a signed assertion (S7)
      wantAuthnResponseSigned: false, // baseline binds on the signed ASSERTION (many IdPs sign only the assertion)
      acceptedClockSkewMs: SAML_CLOCK_SKEW_SECONDS * 1000, // bounded skew (S8), mirrors OIDC
      maxAssertionAgeMs: 0, // rely on the assertion's own NotOnOrAfter
      identifierFormat: config.nameIdFormat ?? null, // requested NameID format (policy enforced on the response too)
      validateInResponseTo: ValidateInResponseTo.never, // WE enforce InResponseTo against the persisted request (single source of truth)
      disableRequestedAuthnContext: true,
      forceAuthn: false,
      ...(generateId ? { generateUniqueId: generateId } : {}),
    } as ConstructorParameters<typeof SAML>[0];
  }

  /** Map a library error to a coded, non-sensitive reason. Message text is a fixed classifier, never message content. */
  private mapLibraryError(e: unknown): SamlValidationError {
    if (e instanceof SamlStatusError) return new SamlValidationError('idp_error', 'the identity provider returned a non-success status');
    const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
    if (/not yet valid|expired|clock|notbefore|notonorafter/.test(msg)) return new SamlValidationError('assertion_time_invalid', 'assertion time constraints failed');
    if (/audience/.test(msg)) return new SamlValidationError('audience_mismatch', 'audience restriction failed');
    if (/recipient|destination/.test(msg)) return new SamlValidationError('destination_recipient_mismatch', 'destination/recipient failed');
    if (/inresponseto/.test(msg)) return new SamlValidationError('in_response_to_mismatch', 'InResponseTo failed');
    if (/issuer/.test(msg)) return new SamlValidationError('issuer_mismatch', 'issuer failed');
    if (/cert|certificate|no matching key/.test(msg)) return new SamlValidationError('certificate_mismatch', 'no configured certificate validated the signature');
    if (/signature|signed|invalid document signature|digest/.test(msg)) return new SamlValidationError('invalid_signature', 'signature validation failed');
    return new SamlValidationError('malformed_response', 'response could not be validated');
  }
}

function safeBase64ToUtf8(b64: string): string | null {
  try {
    if (!b64 || typeof b64 !== 'string') return null;
    return Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

/** node-saml's `getAssertion()` returns `{ Assertion: <node> }` (xml2js-style, `$` = attributes). Resolve the node. */
function assertionNode(assertion: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!assertion) return null;
  const wrapped = (assertion as { Assertion?: unknown }).Assertion ?? assertion;
  return (Array.isArray(wrapped) ? wrapped[0] : wrapped) as Record<string, unknown> | null;
}

/** Read the assertion ID from the library-verified assertion object (`$.ID`). Never re-parses XML. */
function readAssertionId(assertion: Record<string, unknown> | null): string | null {
  const node = assertionNode(assertion);
  const attrs = node && (node as { $?: Record<string, unknown> }).$;
  const id = attrs && typeof attrs.ID === 'string' ? attrs.ID : null;
  return id && id.length ? id : null;
}

const first = (v: unknown): Record<string, unknown> | null => (Array.isArray(v) ? (v[0] as Record<string, unknown>) : (v as Record<string, unknown> | null)) ?? null;

/** Read SubjectConfirmationData.Recipient from the library-verified assertion (`Subject > SubjectConfirmation > …`). */
function readSubjectRecipient(assertion: Record<string, unknown> | null): string | null {
  const node = assertionNode(assertion);
  const subject = first(node && (node as { Subject?: unknown }).Subject);
  const sc = first(subject && (subject as { SubjectConfirmation?: unknown }).SubjectConfirmation);
  const scd = first(sc && (sc as { SubjectConfirmationData?: unknown }).SubjectConfirmationData);
  const attrs = scd && (scd as { $?: Record<string, unknown> }).$;
  const recipient = attrs && typeof attrs.Recipient === 'string' ? attrs.Recipient : null;
  return recipient && recipient.length ? recipient : null;
}

function readAssertionNotOnOrAfter(assertion: Record<string, unknown> | null): Date | null {
  const node = assertionNode(assertion);
  const conditionsRaw = node && (node as { Conditions?: unknown }).Conditions;
  const conditions = (Array.isArray(conditionsRaw) ? conditionsRaw[0] : conditionsRaw) as { $?: Record<string, unknown> } | null;
  const raw = conditions && conditions.$ && conditions.$.NotOnOrAfter;
  if (typeof raw !== 'string') return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}
