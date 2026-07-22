import { validateCallbackMessage, expectedCallbackOrigin } from './callback-message';

/** CP-4 — web side of the payment-callback boundary (R-004b receiver validation). */
describe('validateCallbackMessage', () => {
  const win = {} as Window; // stand-in for the active iframe contentWindow
  const ctx = { expectedOrigin: 'https://api.example.com', expectedSource: win, batchId: 'b1' };
  const ev = (over: Partial<{ origin: string; source: unknown; data: unknown }>) =>
    ({
      origin: 'https://api.example.com',
      source: win,
      data: { status: 'payment_processing', orderId: 'b1' },
      ...over,
    }) as unknown as MessageEvent;

  it('accepts a correct-origin, correct-source, valid message for this batch', () => {
    expect(validateCallbackMessage(ev({}), ctx)).toEqual({ status: 'payment_processing', message: undefined });
  });
  it('accepts a declined message with a message string', () => {
    expect(validateCallbackMessage(ev({ data: { status: 'declined', orderId: 'b1', message: 'no' } }), ctx)).toEqual({
      status: 'declined',
      message: 'no',
    });
  });
  it('ignores a wrong origin', () => {
    expect(validateCallbackMessage(ev({ origin: 'https://evil.example.com' }), ctx)).toBeNull();
  });
  it('ignores a wrong source window', () => {
    expect(validateCallbackMessage(ev({ source: {} as Window }), ctx)).toBeNull();
  });
  it('ignores a null / non-object payload', () => {
    expect(validateCallbackMessage(ev({ data: null }), ctx)).toBeNull();
    expect(validateCallbackMessage(ev({ data: 'str' }), ctx)).toBeNull();
  });
  it('ignores an unsupported status', () => {
    expect(validateCallbackMessage(ev({ data: { status: 'hacked', orderId: 'b1' } }), ctx)).toBeNull();
  });
  it('ignores a valid-looking message for ANOTHER batch (orderId mismatch)', () => {
    expect(validateCallbackMessage(ev({ data: { status: 'payment_processing', orderId: 'other' } }), ctx)).toBeNull();
  });
  it('ignores a missing orderId', () => {
    expect(validateCallbackMessage(ev({ data: { status: 'payment_processing' } }), ctx)).toBeNull();
  });
  it('fails safe when the active iframe window is not available', () => {
    expect(validateCallbackMessage(ev({}), { ...ctx, expectedSource: null })).toBeNull();
  });
});

describe('expectedCallbackOrigin', () => {
  const saved = process.env.NEXT_PUBLIC_API_ORIGIN;
  afterEach(() => {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_API_ORIGIN;
    else process.env.NEXT_PUBLIC_API_ORIGIN = saved;
  });

  it('uses NEXT_PUBLIC_API_ORIGIN when configured (cross-origin dev)', () => {
    process.env.NEXT_PUBLIC_API_ORIGIN = 'https://api.example.com';
    expect(expectedCallbackOrigin()).toBe('https://api.example.com');
  });
  it('falls back to same-origin when unset (production); empty under a non-browser runtime', () => {
    delete process.env.NEXT_PUBLIC_API_ORIGIN;
    const expected = typeof window !== 'undefined' ? window.location.origin : '';
    expect(expectedCallbackOrigin()).toBe(expected);
  });
});
