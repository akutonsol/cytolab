import { AuditQueryReadCaptureGuard } from './audit-query-read-capture.guard';

/**
 * Program 2 · P2-7C — the recursion guard is async-context-local: it suppresses a NESTED capture in
 * the same execution, restores after success or throw, and never leaks across concurrent requests.
 */
describe('P2-7C — AuditQueryReadCaptureGuard', () => {
  it('is not capturing at rest', () => {
    expect(new AuditQueryReadCaptureGuard().isCapturing()).toBe(false);
  });

  it('marks capturing only inside runCapture, and a nested run sees the flag', async () => {
    const g = new AuditQueryReadCaptureGuard();
    let innerSeen = false;
    await g.runCapture(async () => {
      expect(g.isCapturing()).toBe(true);
      innerSeen = g.isCapturing();
    });
    expect(innerSeen).toBe(true);
    expect(g.isCapturing()).toBe(false); // restored after success
  });

  it('restores after the callback throws', async () => {
    const g = new AuditQueryReadCaptureGuard();
    await expect(g.runCapture(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(g.isCapturing()).toBe(false);
  });

  it('nested runCapture still executes but the outer scope owns the suppression decision', async () => {
    const g = new AuditQueryReadCaptureGuard();
    const observed: boolean[] = [];
    await g.runCapture(async () => {
      observed.push(g.isCapturing()); // true
      await g.runCapture(async () => observed.push(g.isCapturing())); // still true (nested)
      observed.push(g.isCapturing()); // true
    });
    expect(observed).toEqual([true, true, true]);
    expect(g.isCapturing()).toBe(false);
  });

  it('does not leak across concurrent async contexts', async () => {
    const g = new AuditQueryReadCaptureGuard();
    const results: Record<string, boolean> = {};
    await Promise.all([
      g.runCapture(async () => {
        await new Promise((r) => setTimeout(r, 5));
        results.inside = g.isCapturing();
      }),
      (async () => {
        await new Promise((r) => setTimeout(r, 2));
        results.outside = g.isCapturing(); // a concurrent context NOT inside runCapture
      })(),
    ]);
    expect(results.inside).toBe(true);
    expect(results.outside).toBe(false);
  });

  it('holds no process-global flag: a fresh guard instance is independent', async () => {
    const g1 = new AuditQueryReadCaptureGuard();
    const g2 = new AuditQueryReadCaptureGuard();
    await g1.runCapture(async () => {
      expect(g1.isCapturing()).toBe(true);
      expect(g2.isCapturing()).toBe(false);
    });
  });
});
