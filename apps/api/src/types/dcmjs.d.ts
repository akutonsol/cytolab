// Program 5C · C2 — minimal ambient types for the narrow dcmjs surface Osieri uses (dcmjs ships no types).
// Kept intentionally small: only metadata read/write + naturalize/denaturalize. NOT a full DICOM typing.
declare module 'dcmjs' {
  export namespace data {
    class DicomDict {
      constructor(meta: Record<string, unknown>);
      dict: Record<string, unknown>;
      meta: Record<string, unknown>;
      write(): ArrayBuffer;
    }
    const DicomMetaDictionary: {
      naturalizeDataset(dict: Record<string, unknown>): Record<string, unknown>;
      denaturalizeDataset(dataset: Record<string, unknown>): Record<string, unknown>;
    };
    const DicomMessage: {
      readFile(buffer: ArrayBuffer, options?: Record<string, unknown>): { dict: Record<string, unknown>; meta: Record<string, unknown> };
    };
  }
}
