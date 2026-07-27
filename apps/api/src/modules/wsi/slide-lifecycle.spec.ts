import { deriveSlideLifecycle } from './slide-lifecycle';

const gen = (status: string, sealed = true, verified = true) => ({ status, sealed, verified });

describe('deriveSlideLifecycle (P5-5 truthful lifecycle)', () => {
  it('PUBLISHED + viewable ONLY when a published generation exists', () => {
    const l = deriveSlideLifecycle({ publishedGenerationId: 'gen-1', generations: [gen('PUBLISHED')] });
    expect(l).toEqual({ state: 'PUBLISHED', viewable: true });
  });

  it('a published pointer dominates even if other generations exist', () => {
    const l = deriveSlideLifecycle({ publishedGenerationId: 'gen-1', generations: [gen('SUPERSEDED'), gen('READY')] });
    expect(l).toEqual({ state: 'PUBLISHED', viewable: true });
  });

  it('no generations → DRAFT, not viewable', () => {
    expect(deriveSlideLifecycle({ publishedGenerationId: null, generations: [] })).toEqual({ state: 'DRAFT', viewable: false });
  });

  it('PROCESSING (PROCESSING or QC_PENDING) → not viewable', () => {
    expect(deriveSlideLifecycle({ publishedGenerationId: null, generations: [gen('PROCESSING', false, false)] }).state).toBe('PROCESSING');
    expect(deriveSlideLifecycle({ publishedGenerationId: null, generations: [gen('QC_PENDING', true, false)] }).state).toBe('PROCESSING');
  });

  it('READY (sealed+verified, unpublished) → READY and NOT viewable', () => {
    const l = deriveSlideLifecycle({ publishedGenerationId: null, generations: [gen('READY')] });
    expect(l).toEqual({ state: 'READY', viewable: false });
  });

  it('PROCESSING takes precedence over a co-existing READY', () => {
    const l = deriveSlideLifecycle({ publishedGenerationId: null, generations: [gen('READY'), gen('PROCESSING', false, false)] });
    expect(l.state).toBe('PROCESSING');
    expect(l.viewable).toBe(false);
  });

  it('all generations QC_FAILED → QC_FAILED, not viewable', () => {
    expect(deriveSlideLifecycle({ publishedGenerationId: null, generations: [gen('QC_FAILED', true, false)] })).toEqual({ state: 'QC_FAILED', viewable: false });
  });

  it('a READY that is not sealed+verified is NOT treated as READY (falls through)', () => {
    const l = deriveSlideLifecycle({ publishedGenerationId: null, generations: [gen('READY', false, false)] });
    expect(l.viewable).toBe(false);
    expect(l.state).not.toBe('READY');
  });

  it('INVARIANT: viewable is true ONLY in the PUBLISHED state', () => {
    for (const g of [[], [gen('DRAFT')], [gen('PROCESSING', false, false)], [gen('READY')], [gen('QC_FAILED', true, false)]]) {
      expect(deriveSlideLifecycle({ publishedGenerationId: null, generations: g as any }).viewable).toBe(false);
    }
    expect(deriveSlideLifecycle({ publishedGenerationId: 'g', generations: [] }).viewable).toBe(true);
  });
});
