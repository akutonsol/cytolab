import { lookup } from 'node:dns/promises';
import * as net from 'node:net';
import { DicomWebError } from './dicomweb-errors';

/**
 * Program 5C · C3 — the outbound SSRF boundary (none existed in the repo before C3). An arbitrary URL is NEVER
 * fetched merely because it is syntactically valid. Enforces: HTTPS-only; the host must be in the configured
 * endpoint allowlist; the resolved address(es) must not be private / loopback / link-local / ULA. Loopback is
 * permitted ONLY under an explicit test flag (for the in-process mock server) — production never sets it.
 *
 * NOTE (Program 9 hardening): this validates + rejects pre-fetch; full DNS-rebinding immunity (pinning the
 * validated IP into the socket) is deferred to production networking. The host allowlist is the primary control.
 */
export interface SsrfPolicy {
  /** Hostnames explicitly configured for this lab's DICOMweb endpoint(s). */
  allowedHosts: string[];
  /** TEST ONLY — permit http + loopback for the in-process mock server. Default false. */
  allowLoopback?: boolean;
}

function isBlockedIp(ip: string, allowLoopback: boolean): boolean {
  const v = net.isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 127) return !allowLoopback; // loopback
    if (a === 10) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 169 && b === 254) return true; // link-local
    if (a === 0) return true; // "this host"
    return false;
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    if (s === '::1') return !allowLoopback; // loopback
    if (s.startsWith('fe80')) return true; // link-local
    if (s.startsWith('fc') || s.startsWith('fd')) return true; // ULA
    if (s === '::' ) return true;
    // IPv4-mapped (::ffff:a.b.c.d)
    const m = s.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return isBlockedIp(m[1], allowLoopback);
    return false;
  }
  return true; // unknown → block
}

/**
 * Validate an outbound DICOMweb URL against the policy. Returns the parsed URL (safe to fetch) or throws a
 * DicomWebError('HOST_NOT_ALLOWED'). Resolves DNS and rejects if ANY resolved address is private/loopback/etc.
 */
export async function assertOutboundUrlAllowed(rawUrl: string, policy: SsrfPolicy): Promise<URL> {
  const allowLoopback = policy.allowLoopback === true;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new DicomWebError('HOST_NOT_ALLOWED', 'malformed URL');
  }
  const isHttps = url.protocol === 'https:';
  const isTestHttp = url.protocol === 'http:' && allowLoopback;
  if (!isHttps && !isTestHttp) throw new DicomWebError('HOST_NOT_ALLOWED', 'only https endpoints are permitted');

  const host = url.hostname;
  if (!policy.allowedHosts.includes(host)) {
    throw new DicomWebError('HOST_NOT_ALLOWED', `host is not in the configured endpoint allowlist`);
  }

  // If the host is a literal IP, validate it directly; otherwise resolve and validate every address.
  const ips = net.isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (ips.length === 0) throw new DicomWebError('ENDPOINT_UNREACHABLE', 'host did not resolve');
  for (const ip of ips) {
    if (isBlockedIp(ip, allowLoopback)) {
      throw new DicomWebError('HOST_NOT_ALLOWED', 'host resolves to a private/loopback/link-local address');
    }
  }
  return url;
}
