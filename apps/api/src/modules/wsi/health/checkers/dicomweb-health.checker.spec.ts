import { DicomWebHealthChecker } from './dicomweb-health.checker';
import { DicomWebError } from '../../dicomweb/dicomweb-errors';

/** Program 5C · C5 — DICOMweb health: minimal QIDO via the accepted C3 client; maps DicomWebError → health. */
function mk(over: { qido?: any } = {}) {
  const client = { qidoSeries: over.qido ?? jest.fn(async () => []) };
  const encryption = { decrypt: jest.fn(() => 'tok') };
  return { checker: new DicomWebHealthChecker(client as any, encryption as any), client, encryption };
}
const src = (over: any) => ({ id: 's', kind: 'DICOMWEB', rootPath: null, endpointBaseUrl: 'https://pacs.example/dicomweb', authType: 'BEARER', credentialCipher: 'CIPHER', adapterType: null, enabled: true, ...over });

describe('P5C-C5 DicomWebHealthChecker', () => {
  it('a reachable, authenticated endpoint with a well-formed response → HEALTHY (minimal QIDO, no WADO)', async () => {
    const h = mk();
    const r = await h.checker.check(src({}));
    expect(r.state).toBe('HEALTHY');
    expect(h.client.qidoSeries).toHaveBeenCalledWith(expect.objectContaining({ authHeader: 'Bearer tok', allowedHosts: ['pacs.example'] }), { limit: 1 });
  });

  it('AUTH_REJECTED → AUTH_REJECTED / DICOMWEB_AUTH_REJECTED', async () => {
    const r = await mk({ qido: jest.fn(async () => { throw new DicomWebError('AUTH_REJECTED', 'x'); }) }).checker.check(src({}));
    expect(r.state).toBe('AUTH_REJECTED');
    expect(r.errorCode).toBe('DICOMWEB_AUTH_REJECTED');
  });

  it('HOST_NOT_ALLOWED (SSRF) → MISCONFIGURED / DICOMWEB_HOST_REJECTED (never fetched)', async () => {
    const r = await mk({ qido: jest.fn(async () => { throw new DicomWebError('HOST_NOT_ALLOWED', 'x'); }) }).checker.check(src({}));
    expect(r.state).toBe('MISCONFIGURED');
    expect(r.errorCode).toBe('DICOMWEB_HOST_REJECTED');
  });

  it('TIMEOUT → UNREACHABLE / HEALTH_CHECK_TIMEOUT', async () => {
    const r = await mk({ qido: jest.fn(async () => { throw new DicomWebError('TIMEOUT', 'x'); }) }).checker.check(src({}));
    expect(r.state).toBe('UNREACHABLE');
    expect(r.errorCode).toBe('HEALTH_CHECK_TIMEOUT');
  });

  it('endpoint unreachable → UNREACHABLE / DICOMWEB_UNREACHABLE', async () => {
    const r = await mk({ qido: jest.fn(async () => { throw new DicomWebError('ENDPOINT_UNREACHABLE', 'x'); }) }).checker.check(src({}));
    expect(r.state).toBe('UNREACHABLE');
    expect(r.errorCode).toBe('DICOMWEB_UNREACHABLE');
  });

  it('malformed QIDO JSON → MISCONFIGURED / DICOMWEB_INVALID_RESPONSE', async () => {
    const r = await mk({ qido: jest.fn(async () => { throw new DicomWebError('INVALID_QIDO_RESPONSE', 'x'); }) }).checker.check(src({}));
    expect(r.errorCode).toBe('DICOMWEB_INVALID_RESPONSE');
  });

  it('missing endpoint → MISCONFIGURED; never exposes the credential', async () => {
    const r = await mk().checker.check(src({ endpointBaseUrl: null }));
    expect(r.state).toBe('MISCONFIGURED');
    expect(JSON.stringify(r)).not.toContain('tok');
  });
});
