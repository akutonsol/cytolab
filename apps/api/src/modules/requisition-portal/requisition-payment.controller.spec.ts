import { makeHtml, RequisitionPaymentController } from './requisition-payment.controller';
import { canonicalOriginFromEnv } from '../../common/config/canonical-origin';

/**
 * CP-4 — API side of the payment-callback browser boundary (R-004a sender + R-005 CSP).
 */
describe('payment callback — sender pinning + route-scoped CSP', () => {
  describe('makeHtml (R-004a sender)', () => {
    const html = makeHtml({ status: 'payment_processing', orderId: 'b1' }, 'NONCE123', 'https://portal.example.com');

    it('pins the EXACT target origin — never a wildcard', () => {
      expect(html).toContain('"https://portal.example.com"');
      expect(html).not.toMatch(/postMessage\([^)]*,\s*['"]\*['"]\)/);
      expect(html).not.toContain("'*'");
    });
    it('posts ONLY to window.parent (no top/opener broadcast)', () => {
      expect(html).toContain('window.parent.postMessage');
      expect(html).not.toContain('window.top');
      expect(html).not.toContain('window.opener');
    });
    it('carries the per-response nonce on the inline script', () => {
      expect(html).toContain('<script nonce="NONCE123">');
    });
    it('escapes payload so it cannot break out of the <script> context', () => {
      const evil = makeHtml(
        { status: 'declined', message: '</script><img src=x onerror=alert(1)>', orderId: 'b1' },
        'N',
        'https://p.example.com',
      );
      expect(evil).not.toContain('</script><img');
      expect(evil).toContain('\\u003c/script');
      expect(evil).not.toMatch(/<img src=x/);
    });
  });

  describe('canonicalOriginFromEnv (R-005 origin config)', () => {
    const KEY = 'CP4_TEST_ORIGIN';
    const savedNodeEnv = process.env.NODE_ENV;
    afterEach(() => {
      delete process.env[KEY];
      (process.env as any).NODE_ENV = savedNodeEnv;
    });

    it('normalizes a valid canonical origin', () => {
      process.env[KEY] = 'https://portal.example.com';
      expect(canonicalOriginFromEnv(KEY, 'http://localhost:3000')).toBe('https://portal.example.com');
    });
    it('rejects a path / query / fragment', () => {
      for (const bad of ['https://p.example.com/x', 'https://p.example.com?a=1', 'https://p.example.com#f']) {
        process.env[KEY] = bad;
        expect(() => canonicalOriginFromEnv(KEY, 'd')).toThrow();
      }
    });
    it('rejects wildcards and credentials', () => {
      process.env[KEY] = 'https://*.example.com';
      expect(() => canonicalOriginFromEnv(KEY, 'd')).toThrow();
      process.env[KEY] = 'https://user:pass@example.com';
      expect(() => canonicalOriginFromEnv(KEY, 'd')).toThrow();
    });
    it('fails closed in production when the origin is missing', () => {
      (process.env as any).NODE_ENV = 'production';
      expect(() => canonicalOriginFromEnv(KEY, 'http://localhost:3000')).toThrow(/required in production/);
    });
    it('uses the dev default outside production when unset', () => {
      (process.env as any).NODE_ENV = 'test';
      expect(canonicalOriginFromEnv(KEY, 'http://localhost:3000')).toBe('http://localhost:3000');
    });
  });

  describe('controller emits a route-scoped CSP and drops X-Frame-Options', () => {
    it('nonce script-src + pinned frame-ancestors; X-Frame-Options removed', async () => {
      const service = {
        handlePaymentCallback: jest.fn().mockResolvedValue({ status: 'payment_processing', orderId: 'b1' }),
      } as any;
      const ctrl = new RequisitionPaymentController(service);
      const headers: Record<string, string> = {};
      const res: any = {
        removeHeader: jest.fn(),
        setHeader: jest.fn((k: string, v: string) => { headers[k] = v; }),
        end: jest.fn(),
      };

      await ctrl.callbackPost('b1', {}, res);

      expect(res.removeHeader).toHaveBeenCalledWith('X-Frame-Options');
      const csp = headers['Content-Security-Policy'];
      expect(csp).toContain("script-src 'nonce-");
      expect(csp).toContain('frame-ancestors http://localhost:3000');
      expect(csp).not.toContain("'unsafe-inline'");
      expect(csp).not.toContain('*');
      expect(res.end).toHaveBeenCalledTimes(1);
    });
  });
});
