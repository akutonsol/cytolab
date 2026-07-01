import { ConfigService } from '@nestjs/config';
import { AiService, DEFAULT_AI_MODEL } from './ai.service';

/**
 * GRACEFUL DEGRADATION: the AI wrapper must NEVER throw. On any failure — no key,
 * network/API error, timeout, empty response — it returns { available: false }.
 * That contract is exactly what guarantees the authorization workflow is never
 * blocked by AI. Anthropic is never contacted here (callModel is stubbed).
 */
describe('AiService graceful degradation', () => {
  const makeService = (apiKey?: string) =>
    new AiService({ get: (k: string) => (k === 'ANTHROPIC_API_KEY' ? apiKey : undefined) } as unknown as ConfigService);

  it('no API key → unavailable, does not throw', async () => {
    const svc = makeService(undefined);
    expect(svc.hasApiKey()).toBe(false);
    const res = await svc.generate({ system: 's', user: 'u' });
    expect(res.available).toBe(false);
    expect(res.output).toBeUndefined();
    expect(res.reason).toMatch(/not configured/i);
  });

  it('API error → unavailable, error is swallowed (never propagates)', async () => {
    const svc = makeService('sk-test');
    jest.spyOn(svc as any, 'callModel').mockRejectedValue(new Error('503 upstream'));
    let threw = false;
    const res = await svc.generate({ system: 's', user: 'u' }).catch(() => {
      threw = true;
      return null as any;
    });
    expect(threw).toBe(false); // the promise resolved — no exception escaped
    expect(res.available).toBe(false);
    expect(res.reason).toContain('503 upstream');
  });

  it('empty model response → unavailable', async () => {
    const svc = makeService('sk-test');
    jest.spyOn(svc as any, 'callModel').mockResolvedValue('   ');
    const res = await svc.generate({ system: 's', user: 'u' });
    expect(res.available).toBe(false);
  });

  it('success → available with output and the model used', async () => {
    const svc = makeService('sk-test');
    jest.spyOn(svc as any, 'callModel').mockResolvedValue('Draft narrative text.');
    const res = await svc.generate({ system: 's', user: 'u' });
    expect(res).toEqual({ available: true, output: 'Draft narrative text.', model: DEFAULT_AI_MODEL });
  });

  it('lab model override is honored', async () => {
    const svc = makeService('sk-test');
    const spy = jest.spyOn(svc as any, 'callModel').mockResolvedValue('ok');
    await svc.generate({ system: 's', user: 'u', model: 'claude-opus-4-8' });
    expect(spy).toHaveBeenCalledWith('claude-opus-4-8', 's', 'u');
  });

  /**
   * Contract that guarantees "authorization still works when AI is down": no
   * matter how callModel fails, generate() resolves (never rejects). The
   * authorizer path calls generate() and branches on `available`, so a degraded
   * AI can never block sign-off. (The full authorize-with-AI-down E2E is added
   * with the endpoints in step 3.)
   */
  it('never rejects, regardless of failure mode', async () => {
    const svc = makeService('sk-test');
    for (const fail of [new Error('timeout'), new Error('rate limit'), 'weird-non-error']) {
      jest.spyOn(svc as any, 'callModel').mockRejectedValue(fail);
      await expect(svc.generate({ system: 's', user: 'u' })).resolves.toHaveProperty('available', false);
    }
  });
});
