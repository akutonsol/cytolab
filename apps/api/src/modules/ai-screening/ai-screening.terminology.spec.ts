import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Program 1 · P1-2 terminology guardrails.
 *
 * The web app has no test runner, so these are stable SOURCE assertions (via the API
 * jest seam) guarding the contained AI-Screening surfaces against reintroduction of
 * simulated diagnostic-AI vocabulary, and confirming the honest "not currently
 * available" copy. Narrow by design — not a P1-6 certification suite.
 */
const web = (p: string): string => readFileSync(resolve(process.cwd(), '../web', p), 'utf8');
const page = (): string => web('src/app/(app)/ai-screening/page.tsx');
const card = (): string => web('src/components/AIScreeningCard.tsx');

describe('P1-2 contained-feature terminology', () => {
  it('the contained page states diagnostic image analysis is unavailable', () => {
    const s = page();
    expect(s).toMatch(/Diagnostic Image Analysis/i);
    expect(s).toMatch(/not currently available/i);
    expect(s).toMatch(/No slide-image analysis is performed/i);
  });

  it('no contained surface renders "Review AI Findings"', () => {
    expect(page()).not.toMatch(/Review AI Findings/);
    expect(card()).not.toMatch(/Review AI Findings/);
  });

  it('no contained surface renders confidence or flagged-area claims', () => {
    for (const s of [page(), card()]) {
      expect(s).not.toMatch(/flagged area/i);
      expect(s).not.toMatch(/AI Confidence/i);
      expect(s).not.toMatch(/ConfidenceRing/);
      expect(s).not.toMatch(/primaryFinding/);
    }
  });

  it('no retry / temporary-failure wording (backend is intentionally unavailable)', () => {
    for (const s of [page(), card()]) {
      expect(s).not.toMatch(/try again/i);
      expect(s).not.toMatch(/analysis failed/i);
      expect(s).not.toMatch(/screening failed/i);
    }
  });
});
