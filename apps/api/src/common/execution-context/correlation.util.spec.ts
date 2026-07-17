import {
  MalformedCorrelationIdError,
  generateCorrelationId,
  generateExecutionId,
  generateRequestId,
  isValidCorrelationId,
  resolveInboundCorrelationId,
} from './correlation.util';

describe('correlation utilities', () => {
  it('generates valid UUID v4 ids', () => {
    for (const id of [generateCorrelationId(), generateRequestId(), generateExecutionId()]) {
      expect(isValidCorrelationId(id)).toBe(true);
    }
  });

  it('generates distinct ids', () => {
    expect(generateCorrelationId()).not.toBe(generateCorrelationId());
  });

  it('validates format strictly', () => {
    expect(isValidCorrelationId('not-a-uuid')).toBe(false);
    expect(isValidCorrelationId('')).toBe(false);
    expect(isValidCorrelationId(123 as unknown)).toBe(false);
    expect(isValidCorrelationId(generateCorrelationId())).toBe(true);
  });

  describe('resolveInboundCorrelationId', () => {
    it('generates one when the header is absent', () => {
      const id = resolveInboundCorrelationId(undefined);
      expect(isValidCorrelationId(id)).toBe(true);
    });

    it('reuses a well-formed inbound id', () => {
      const incoming = generateCorrelationId();
      expect(resolveInboundCorrelationId(incoming)).toBe(incoming);
    });

    it('rejects a malformed inbound id', () => {
      expect(() => resolveInboundCorrelationId('drop-table')).toThrow(
        MalformedCorrelationIdError,
      );
    });

    it('rejects a duplicated (array) header', () => {
      expect(() =>
        resolveInboundCorrelationId([generateCorrelationId(), generateCorrelationId()]),
      ).toThrow(MalformedCorrelationIdError);
    });
  });
});
