import { ServiceUnavailableException } from '@nestjs/common';
import { AIScreeningService } from './ai-screening.service';
import { AiService } from '../ai/ai.service';

/**
 * Program 1 · P1-1 containment regression (narrow by design — NOT the P1-6 suite).
 *
 * AI Screening is a SIMULATED capability (Math.random over the human's Bethesda
 * entry; no image analysis). Every service entry point must refuse to generate or
 * serve output — regardless of the AI_SCREENING flag or how the caller reached it —
 * and the genuine assistive AI-reporting wrapper must be unaffected.
 */
describe('AIScreeningService — P1-1 containment boundary', () => {
  // Prisma/LabContext stubs are never reached: assertContained() throws first.
  const svc = new AIScreeningService({} as any, {} as any);
  const CONTAINED = /not available for clinical use/i;

  const entryPoints: Array<[string, () => Promise<unknown>]> = [
    ['triggerScreening (single + batch entrypoint)', () => svc.triggerScreening('rec-1')],
    ['getByRecord (direct read)', () => svc.getByRecord('rec-1')],
    ['queue', () => svc.queue()],
    ['analytics (agreement-rate / confidence-trend)', () => svc.analytics()],
    ['review (agreement capture)', () => svc.review('res-1', { agreedWithAI: true } as any, 'u-1')],
  ];

  it.each(entryPoints)('blocks %s', async (_label, call) => {
    await expect(call()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(call()).rejects.toThrow(CONTAINED);
  });

  it('the feature flag cannot bypass containment', async () => {
    // The service holds no feature-flag dependency; containment is unconditional. An
    // enabled flag — or a direct API caller that passed the route guard — still cannot
    // obtain simulated output.
    await expect(svc.queue()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(svc.triggerScreening('rec-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('states plainly that no image analysis is performed', async () => {
    await expect(svc.triggerScreening('rec-1')).rejects.toThrow(/no slide-image analysis/i);
  });
});

describe('Genuine AI Reporting wrapper — unaffected by P1-1', () => {
  it('AiService still degrades gracefully with no API key (reporting path intact)', async () => {
    const ai = new AiService({ get: () => undefined } as any);
    expect(ai.hasApiKey()).toBe(false);
    await expect(ai.generate({ system: 's', user: 'u' })).resolves.toEqual({
      available: false,
      reason: 'AI is not configured (no API key)',
    });
  });
});
