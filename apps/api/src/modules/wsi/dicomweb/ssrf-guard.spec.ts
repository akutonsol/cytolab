import { assertOutboundUrlAllowed } from './ssrf-guard';
import { DicomWebError } from './dicomweb-errors';

/**
 * Program 5C · C3 — the outbound SSRF boundary. Uses literal IPs (no DNS) for deterministic private-address
 * rejection, plus allowlist + protocol + loopback-flag checks.
 */
const rej = (p: Promise<unknown>) => expect(p).rejects.toBeInstanceOf(DicomWebError);

describe('P5C-C3 assertOutboundUrlAllowed', () => {
  it('allows an https, allowlisted, public host', async () => {
    await expect(assertOutboundUrlAllowed('https://8.8.8.8/dicomweb/series', { allowedHosts: ['8.8.8.8'] })).resolves.toBeInstanceOf(URL);
  });
  it('rejects non-https', async () => {
    await rej(assertOutboundUrlAllowed('http://8.8.8.8/', { allowedHosts: ['8.8.8.8'] }));
  });
  it('rejects a host not in the allowlist (no arbitrary URL)', async () => {
    await rej(assertOutboundUrlAllowed('https://evil.example/', { allowedHosts: ['good.example'] }));
  });
  it('rejects a private address (10.x)', async () => {
    await rej(assertOutboundUrlAllowed('https://10.0.0.5/', { allowedHosts: ['10.0.0.5'] }));
  });
  it('rejects link-local (169.254.x) and loopback (127.x) by default', async () => {
    await rej(assertOutboundUrlAllowed('https://169.254.169.254/', { allowedHosts: ['169.254.169.254'] }));
    await rej(assertOutboundUrlAllowed('https://127.0.0.1/', { allowedHosts: ['127.0.0.1'] }));
  });
  it('permits loopback ONLY under the explicit test flag (for the mock server)', async () => {
    await expect(assertOutboundUrlAllowed('http://127.0.0.1:9/', { allowedHosts: ['127.0.0.1'], allowLoopback: true })).resolves.toBeInstanceOf(URL);
    // even with the flag, a private (non-loopback) address stays blocked
    await rej(assertOutboundUrlAllowed('http://10.0.0.5/', { allowedHosts: ['10.0.0.5'], allowLoopback: true }));
  });
});
