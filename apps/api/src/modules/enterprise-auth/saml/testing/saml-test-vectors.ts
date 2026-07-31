/* eslint-disable */
import { SignedXml } from 'xml-crypto';

/**
 * Program 7 · Phase 7A.3 — TEST-ONLY SAML response builder. Produces valid + adversarial signed SAML Responses for the
 * security negative matrix using the SAME `xml-crypto` the production validator relies on. NOT imported by production
 * code. The embedded key/cert pair is a throwaway self-signed test IdP (no production trust). A second pair supports the
 * certificate-rollover / wrong-cert cases.
 */

// Throwaway test IdP #1 (primary).
export const TEST_IDP_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDmtAduPhcxygBy
wjjDjRpAZa+rptYFpRPo80Hn73DZrUw6per/1UnfbdHXUv2trCY0MEiQzOYyZTn6
LlZ4jJ/ZwIvBQk6Fa3ZGtr++ej7DRJPXNN+TVtOQNg30cOs7yeRGQTSaQwdETN0h
6pvELpj82PoCEDF8VuI/pVdtKadLZxQecngkyXujpdQHeODm3tw16ckDe4sZVob1
1+Rjsau5ALjgduhbCfaMwdvT4q3OM2cGpCJlmn3TvzHbF6INq8tAwwWbcG7UoiQe
PAi4Ua6ZidUKwYOVepTcCRA8RO82kUYRloDvZgk+gCjjY3mnYkCPGs2SCGpjucC1
CE4T+/HrAgMBAAECggEAazAzEaAMo8fwfGFMAWOCUnBMdgrefqHrxbycHviLbL/N
XqRvMq11FLfQGuTG05Xb7DyQwqJIxBpvHRPBfmIL9R62cDTwCaJbwlAvd38RwSUQ
MZmx1SGuy16qDiwWx2EuzAuItrG04yF5TsRT2gsybqwbQLEoZNZzaVHXdHM5dNjO
VstpBPg63CYg+5QEWRWcuUN2iXbu2jqluQqBjfOeA4kHFhlabA6UmtyIrB4ZWcd9
tYenpcrO9xz/IRVPr3zZt6zA0WfELgPIv2ceASs0tptV3oKRH1bmK0jxWz7hGqw6
vuianp0WJis6VX+23/ClfxBWhl5mEuR0+WKTjLj2JQKBgQDzUPwWv5uzuE28cWSZ
p9HN5WWC44ReiNJfFe/kmX4wV2rLXGwbTdNONCDSpUql0fX6FoGVkT1xC7az68Gp
GfM04/ZGvPAyzvJKH7EHhqyr8EydUkPExN3Q9EhAAXumUYAKcfzNLBx3tGvZWX+H
Q1IaMpqhNae6IOHFb8RKPp/UHwKBgQDyurl6GwC14vQiyY2kttxHK5xq1yZMg+0c
Bu5pxxJ2W0RleJIjaa17UR2rqEAWE7tADzFiJ3qiHimoLVHSOJO5OkVf3mqHty3k
fDExnAm5ItWcFs0jofBPJGyJa9ZIpon4w0HdtJGM1mcEorIo1NoVJ2WfQQ8AyM1Y
6tTadmYItQKBgQDhAl19tAgLNT8+Kya7KgTNgXxUhI5e1eyl3iWQo5mcntq14Wxf
+6KTSYWpBw53Nilg8vs3E69cIVb+H+Fhvgu5N68CT6tZcSODBLeznAmGn5xaSD8/
ckcm+yDtf/GXJvtfrXX5Tvesg37Q6wESV2FPtMhmmLXZXJss+GTvu+YWRQKBgEKZ
lVa5ngJKGW6KGwE840fr4Wk3S1znPeHYzQXdB2XOOQAWixKIZn9VjGyTJ7JnC5PS
F1y1NGLTH97zQGYL/AxwvqRFZLmEO2Vb5iuUgt53fmDrqLHENymf9t/l5M/eUjEd
ci8g4mbgVTfiZDvr20K+opWFxlYSwrVJCco/flOZAoGBAKx50DDr8a/5r0GvQTYf
i9q4HGPMzISzJh3dzaGn6UXbCKHWFfNRl76dgoc0wzNYAFoBwNtceeiXhhhvtOeK
U49W6fIKt6lvHuVsojWDQcIVu3twass4mz7iH61Ol2fgAYH67lkZhAQ5hKusR29Q
wcuCa3vAiTEmEMQm8MhagUwJ
-----END PRIVATE KEY-----`;

export const TEST_IDP_CERT_PEM = `-----BEGIN CERTIFICATE-----
MIIDHzCCAgegAwIBAgIUcRPPWZGG9mTpiJv9x5XxP6teycMwDQYJKoZIhvcNAQEL
BQAwHzEdMBsGA1UEAwwUb3NpZXJpLXNhbWwtdGVzdC1pZHAwHhcNMjYwNzMxMTgz
MzA0WhcNMzYwNzI4MTgzMzA0WjAfMR0wGwYDVQQDDBRvc2llcmktc2FtbC10ZXN0
LWlkcDCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAOa0B24+FzHKAHLC
OMONGkBlr6um1gWlE+jzQefvcNmtTDql6v/VSd9t0ddS/a2sJjQwSJDM5jJlOfou
VniMn9nAi8FCToVrdka2v756PsNEk9c035NW05A2DfRw6zvJ5EZBNJpDB0RM3SHq
m8QumPzY+gIQMXxW4j+lV20pp0tnFB5yeCTJe6Ol1Ad44Obe3DXpyQN7ixlWhvXX
5GOxq7kAuOB26FsJ9ozB29Pirc4zZwakImWafdO/MdsXog2ry0DDBZtwbtSiJB48
CLhRrpmJ1QrBg5V6lNwJEDxE7zaRRhGWgO9mCT6AKONjeadiQI8azZIIamO5wLUI
ThP78esCAwEAAaNTMFEwHQYDVR0OBBYEFEfEG2ZMCOo55FWDAUjQTNvxnjUeMB8G
A1UdIwQYMBaAFEfEG2ZMCOo55FWDAUjQTNvxnjUeMA8GA1UdEwEB/wQFMAMBAf8w
DQYJKoZIhvcNAQELBQADggEBABminHdizUB2C72Q53huCeTc/s5TN7qdJyVfeB13
5DJvIzwuEuwfZgGaiPPjCYxJw93t3P/pKhmY1r8WaYq1JbTWfnxZxtU8ieI2dVyu
svlExZUOcGYrjLPBrxgUCjW9ORDGn9KBY/yWnfuySQIoNtOmq4Q0SnMrZpTLwI98
Xb37QNMqzjLuTMflsNPVMH5FNypvH/X7Rh9WyWJqLf4BKekeS4b8gBuNmdUe6t/1
HnFcfhl0Qeg6PKWaHKRu6775ispaoJFkbJgPfHKN/ok5eFs/hfcwirryuUedol4H
xsXND7ScbKyZSdk2kbl7RVlJBuFCPwhKW769Do/FmdsOcAg=
-----END CERTIFICATE-----`;

// Throwaway test IdP #2 (rollover / wrong-cert cases).
export const TEST_IDP_KEY2_PEM = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDWATzm0NORfCQp
TpumhD7A1B76jmIYhR4g/h+xsnS0YRT/SfC6XDlmldNmHvSztbHs9R/dfwwA5GSd
jEz70CtZmOKIUuao8fMM1ETqM99p/BegtBI9q9GCF7t79QumqaSfhTPPwN+Ah9vv
0RuuRnGtdvTmyBsXoyfvSuHA4A0P+qEv3dCw+VQPKsx04KxduiG2QvT//UlnJIu7
rqx5SBPbvPKGK5rX/GwOi7eIP7Ez/iaisESRnyx7KwbsLQrLHLM8twvE90dyo1D9
dI/3xVZJRmO4oigDgsbDJinZ3fvqjJxHUShngZ0x+uDTZgM+M7tV8V87CEDfCeiK
apEvAyStAgMBAAECggEAApnsB0/FSM1DcNFRvHjsfMs3RrzzUxP50bj1DOO77DNf
5T3WAoetOkYo8rf+m8sMw+PeNlgyt6dkYl2lRa/dspWbi8CM4fyAPGyhN9Ee0iV6
eLZSSxtHfvAnsGr7DMZJcpebvDpa5D3JoYw7paALeAazapi4pAcw11q5flJpGAOp
lYHrI6s4J/kQUOXiuRcGmbNxL9E9pvFPdugxIW7P/UkFypk4skwBB0TRfdCpoCyH
MJ+Tzf9HxgPx6qrzDrMAbSJGsYdqMUz7RJrlyQnIiBaXWBevMJRn5htcYOaQnDms
pJK0GEHIfFyBMOabwaoGILImbn8vzJG2JYlMJCTiawKBgQDr63B3kIaC3GGO2hrz
3cZhT9gWfLYNC+jULEHfSQYGMNixsLs/N1cPZNv5lcPS8DQNFU77uDuhyWZEL5p/
3AqFW2CWtPNAznHudJYoFaDu8Ang+5RpNGkvwa3L/jAwwkbhKA8lw8ZRkhBberTx
2cb3jK0l85lXZrJODt8LRlbgZwKBgQDoOEk4H5nrOG2z4LqGABhqM86m+gtmpU0e
Rb9O0VT3n3YpkUnOj9XD3/4EVgVJfcgOAYmjd4rtvURzxT0YaPkSnDc3OjjauWHs
kTTnsty3uu0sjfuj+s9hUQNOeUVv2dunFRzpGqOLNTEGZ0VcgNQqzRZMrJactRye
K4ay/VtVywKBgQCvQYaZ+65BFlAO2+17zftqHPNMuTZQeNFslLgWlFu6S50eW0iu
jIDLOcTEI0KGt9QjB/pVuqXp6QBklOx0IVVbfedB7YhrUzGFz+wgOPkFpyHflWTJ
xpqBVKK0UM8h2aDn8GdYSZhQzm4CVySGKZ7KFSIneFAogmzg2eFNseIl7wKBgDjn
8ilqtRFLVrbJz2ufAlykLXQFul2BDJDqjqMF8UhtL0uoaunPnZbOgTUWz1zfEfM8
tTn1xXnU871bDEm7D65b0bwa7GvNGg4a11ggIK51hEFy2cOpZsB2VdUZKsbqIEWl
itwkxwcKFeV30SuF9ng2ocxQTuhACa9JA01BgOxZAoGALNJC+Qy6eZMK4/heF82A
hKiM1G6ejxRt3Ptcroo9WN9wtY+Ad2kZQVfVHArxsMz5LA0N+H4+9RlKcs1fqXlt
YffD7u+AIJRsDnAKUz2Z5qgN9jZzAyAwjZ9V/ce/16u+igy59Ni9+AqfdWSYbuJN
1a0qE2jvaavyWAdHa9+urws=
-----END PRIVATE KEY-----`;

export const TEST_IDP_CERT2_PEM = `-----BEGIN CERTIFICATE-----
MIIDIzCCAgugAwIBAgIUZgdljB/zWs3EVh66oI0KTZaLF8QwDQYJKoZIhvcNAQEL
BQAwITEfMB0GA1UEAwwWb3NpZXJpLXNhbWwtdGVzdC1pZHAtMjAeFw0yNjA3MzEx
ODMzMDRaFw0zNjA3MjgxODMzMDRaMCExHzAdBgNVBAMMFm9zaWVyaS1zYW1sLXRl
c3QtaWRwLTIwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDWATzm0NOR
fCQpTpumhD7A1B76jmIYhR4g/h+xsnS0YRT/SfC6XDlmldNmHvSztbHs9R/dfwwA
5GSdjEz70CtZmOKIUuao8fMM1ETqM99p/BegtBI9q9GCF7t79QumqaSfhTPPwN+A
h9vv0RuuRnGtdvTmyBsXoyfvSuHA4A0P+qEv3dCw+VQPKsx04KxduiG2QvT//Uln
JIu7rqx5SBPbvPKGK5rX/GwOi7eIP7Ez/iaisESRnyx7KwbsLQrLHLM8twvE90dy
o1D9dI/3xVZJRmO4oigDgsbDJinZ3fvqjJxHUShngZ0x+uDTZgM+M7tV8V87CEDf
CeiKapEvAyStAgMBAAGjUzBRMB0GA1UdDgQWBBTD42KmcDRmGM73vSPiAwkyRcQp
kTAfBgNVHSMEGDAWgBTD42KmcDRmGM73vSPiAwkyRcQpkTAPBgNVHRMBAf8EBTAD
AQH/MA0GCSqGSIb3DQEBCwUAA4IBAQAY9jKRjiGdN90adWjk7D5siPBC65QO4V3M
aomYokryRELbZCKTtfdhakCVM0+CTt2YJosGNP97hFDvX0KrU8Z23V1IB5Su2No6
mRdY6SFYqU+g15RYouAzSkaMBB6eAo9zNsq//Dxoz3ggC+2+q3rjn5cQWW2zRR1c
3N4M0WpHIjMsM1DM5opN2pvOgKP12QRFqZzAjC9oa4lWAFCbFl+Mx09snCcoEoPd
EK9MbbzKfCy6vx7yaAm0L5HGgYCDLH6aGiMSCmPNSJfFgZMos4W+n8qA8s9wvXUt
Y9Ch4N8h1ay97Lrxn+X6Ohbp0ziL6dk6bjVsN52RfIE2rH1PHwVq
-----END CERTIFICATE-----`;

export interface SamlVectorOptions {
  requestId: string; // InResponseTo
  nameId?: string;
  nameIdFormat?: string;
  idpEntityId?: string;
  spEntityId?: string; // audience
  acsUrl?: string; // recipient / destination
  assertionId?: string;
  responseId?: string;
  notBeforeMs?: number; // offset from now (ms)
  notOnOrAfterMs?: number; // offset from now (ms)
  signWithKey?: string; // private key PEM to sign with
  signWithCert?: string; // cert PEM to embed in KeyInfo
  sign?: boolean; // default true; false ⇒ unsigned (alg=none analogue)
  extraUnsignedAssertionNameId?: string; // XSW: inject a second, unsigned assertion with this NameID
}

const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const certBody = (pem: string) => pem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, '').replace(/\s+/g, '');

const DEFAULTS = {
  nameId: 'saml-subject-001',
  nameIdFormat: 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
  idpEntityId: 'https://idp.test/entity',
  spEntityId: 'https://osieri.test/sp',
  acsUrl: 'https://lab.osieri.test/api/v1/enterprise-auth/saml/idp/acs',
};

function assertionXml(o: Required<Pick<SamlVectorOptions, 'requestId'>> & SamlVectorOptions): string {
  const nameId = o.nameId ?? DEFAULTS.nameId;
  const nameIdFormat = o.nameIdFormat ?? DEFAULTS.nameIdFormat;
  const idp = o.idpEntityId ?? DEFAULTS.idpEntityId;
  const sp = o.spEntityId ?? DEFAULTS.spEntityId;
  const acs = o.acsUrl ?? DEFAULTS.acsUrl;
  const aId = o.assertionId ?? `_assert_${o.requestId}`;
  const notBefore = iso(o.notBeforeMs ?? -60_000);
  const notOnOrAfter = iso(o.notOnOrAfterMs ?? 5 * 60_000);
  return (
    `<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${aId}" Version="2.0" IssueInstant="${iso(0)}">` +
    `<saml:Issuer>${idp}</saml:Issuer>` +
    `<saml:Subject>` +
    `<saml:NameID Format="${nameIdFormat}">${nameId}</saml:NameID>` +
    `<saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">` +
    `<saml:SubjectConfirmationData NotOnOrAfter="${notOnOrAfter}" Recipient="${acs}" InResponseTo="${o.requestId}"/>` +
    `</saml:SubjectConfirmation>` +
    `</saml:Subject>` +
    `<saml:Conditions NotBefore="${notBefore}" NotOnOrAfter="${notOnOrAfter}">` +
    `<saml:AudienceRestriction><saml:Audience>${sp}</saml:Audience></saml:AudienceRestriction>` +
    `</saml:Conditions>` +
    `<saml:AuthnStatement AuthnInstant="${iso(0)}" SessionIndex="_sess_${o.requestId}">` +
    `<saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext>` +
    `</saml:AuthnStatement>` +
    `</saml:Assertion>`
  );
}

/** Sign the Assertion in-place (enveloped, exclusive-C14N, RSA-SHA256) and return the signed assertion XML. */
function signAssertion(unsignedAssertion: string, keyPem: string, certPem: string): string {
  const sig = new SignedXml({
    privateKey: keyPem,
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#',
  });
  sig.addReference({
    xpath: "//*[local-name(.)='Assertion']",
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
    transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/2001/10/xml-exc-c14n#'],
  });
  sig.getKeyInfoContent = () => `<X509Data><X509Certificate>${certBody(certPem)}</X509Certificate></X509Data>`;
  sig.computeSignature(unsignedAssertion, {
    location: { reference: "//*[local-name(.)='Assertion']/*[local-name(.)='Issuer']", action: 'after' },
  });
  return sig.getSignedXml();
}

/** Build a base64 SAML Response (POST binding) per the options. Signed by default with the primary test cert. */
export function buildSamlResponse(opts: SamlVectorOptions): string {
  const idp = opts.idpEntityId ?? DEFAULTS.idpEntityId;
  const acs = opts.acsUrl ?? DEFAULTS.acsUrl;
  const respId = opts.responseId ?? `_resp_${opts.requestId}`;
  const key = opts.signWithKey ?? TEST_IDP_KEY_PEM;
  const cert = opts.signWithCert ?? TEST_IDP_CERT_PEM;
  const assertion = opts.sign === false ? assertionXml(opts) : signAssertion(assertionXml(opts), key, cert);
  const injected = opts.extraUnsignedAssertionNameId
    ? assertionXml({ ...opts, nameId: opts.extraUnsignedAssertionNameId, assertionId: `_evil_${opts.requestId}` })
    : '';
  const xml =
    `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ` +
    `ID="${respId}" Version="2.0" IssueInstant="${iso(0)}" Destination="${acs}" InResponseTo="${opts.requestId}">` +
    `<saml:Issuer>${idp}</saml:Issuer>` +
    `<samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>` +
    // XSW variant injects an extra UNSIGNED assertion alongside the signed one.
    `${injected}${assertion}` +
    `</samlp:Response>`;
  return Buffer.from(xml, 'utf8').toString('base64');
}

/** An XXE probe: an internal DTD with an external entity. A safe parser must not resolve it (fail closed). */
export function buildXxeResponse(requestId: string): string {
  const xml =
    `<?xml version="1.0"?>` +
    `<!DOCTYPE samlp:Response [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]>` +
    `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ` +
    `ID="_resp_xxe" Version="2.0" IssueInstant="${iso(0)}" InResponseTo="${requestId}">` +
    `<saml:Issuer>&xxe;</saml:Issuer>` +
    `<samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>` +
    `</samlp:Response>`;
  return Buffer.from(xml, 'utf8').toString('base64');
}

/** A response carrying an EncryptedAssertion (S7 rejection probe). */
export function buildEncryptedResponse(requestId: string): string {
  const xml =
    `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ` +
    `ID="_resp_enc" Version="2.0" IssueInstant="${iso(0)}" InResponseTo="${requestId}">` +
    `<saml:Issuer>${DEFAULTS.idpEntityId}</saml:Issuer>` +
    `<samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>` +
    `<saml:EncryptedAssertion><xenc:EncryptedData xmlns:xenc="http://www.w3.org/2001/04/xmlenc#"/></saml:EncryptedAssertion>` +
    `</samlp:Response>`;
  return Buffer.from(xml, 'utf8').toString('base64');
}

export const TEST_DEFAULTS = DEFAULTS;
