import { assertAdapterMatchesKind, ScannerAdapterError } from './scanner-adapter';

/** Program 5C · C4 — deterministic adapter↔transport compatibility. */
describe('P5C-C4 assertAdapterMatchesKind', () => {
  it('accepts FILESYSTEM_IMAGE/FILESYSTEM_DICOM on a FILESYSTEM source', () => {
    expect(() => assertAdapterMatchesKind('FILESYSTEM_IMAGE', 'FILESYSTEM')).not.toThrow();
    expect(() => assertAdapterMatchesKind('FILESYSTEM_DICOM', 'FILESYSTEM')).not.toThrow();
  });
  it('accepts DICOMWEB on a DICOMWEB source', () => {
    expect(() => assertAdapterMatchesKind('DICOMWEB', 'DICOMWEB')).not.toThrow();
  });
  it('rejects cross-transport combinations deterministically', () => {
    expect(() => assertAdapterMatchesKind('FILESYSTEM_DICOM', 'DICOMWEB')).toThrow(ScannerAdapterError);
    expect(() => assertAdapterMatchesKind('DICOMWEB', 'FILESYSTEM')).toThrow(ScannerAdapterError);
    try { assertAdapterMatchesKind('DICOMWEB', 'FILESYSTEM'); } catch (e) { expect((e as ScannerAdapterError).code).toBe('ADAPTER_TRANSPORT_MISMATCH'); }
  });
});
