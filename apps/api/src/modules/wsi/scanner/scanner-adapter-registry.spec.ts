import { ScannerAdapterRegistry } from './scanner-adapter-registry';
import { ScannerAdapterError, type ScannerAdapter } from './scanner-adapter';

const mk = (id: string, adapterType: any): ScannerAdapter => ({ id, adapterType, discoverCompletedScans: jest.fn(async () => []), validateCompleteness: jest.fn(async () => ({ complete: true })) });

/** Program 5C · C4 — the STATIC registry indexes adapters by type; an unregistered type is a truthful error. */
describe('P5C-C4 ScannerAdapterRegistry', () => {
  const reg = new ScannerAdapterRegistry([mk('filesystem-dicom', 'FILESYSTEM_DICOM'), mk('dicomweb', 'DICOMWEB')]);

  it('resolves a registered adapter by IngestionAdapterType', () => {
    expect(reg.require('FILESYSTEM_DICOM').id).toBe('filesystem-dicom');
    expect(reg.require('DICOMWEB').id).toBe('dicomweb');
  });
  it('does NOT register FILESYSTEM_IMAGE (legacy watch-folder path owns it)', () => {
    expect(reg.has('FILESYSTEM_IMAGE')).toBe(false);
    expect(() => reg.require('FILESYSTEM_IMAGE')).toThrow(ScannerAdapterError);
  });
  it('throws UNSUPPORTED_ADAPTER for a null/unknown adapterType', () => {
    expect(() => reg.require(null)).toThrow(ScannerAdapterError);
  });
});
