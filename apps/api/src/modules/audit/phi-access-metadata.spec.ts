import {
  InvalidAuditMetadataError,
  PHI_ACCESS_MODES,
  PHI_ACCESS_SURFACES,
  validateMetadata,
} from './audit-metadata';

const ok = (over: Record<string, any> = {}) => ({
  accessSurface: 'record_detail',
  accessMode: 'view',
  producerModule: 'records',
  ...over,
});

describe('phi.access.v2 metadata contract (P2-5B)', () => {
  it('accepts every allowed accessSurface', () => {
    for (const surface of PHI_ACCESS_SURFACES) {
      expect(() => validateMetadata('phi.access.v2', ok({ accessSurface: surface }))).not.toThrow();
    }
  });

  it('accepts every allowed accessMode', () => {
    for (const mode of PHI_ACCESS_MODES) {
      expect(() => validateMetadata('phi.access.v2', ok({ accessMode: mode }))).not.toThrow();
    }
  });

  it('accepts a valid non-negative integer resultCount and bounded pageSize', () => {
    expect(() => validateMetadata('phi.access.v2', ok({ resultCount: 0, pageSize: 25 }))).not.toThrow();
    expect(() => validateMetadata('phi.access.v2', ok({ resultCount: 100 }))).not.toThrow();
  });

  it('rejects a negative resultCount', () => {
    expect(() => validateMetadata('phi.access.v2', ok({ resultCount: -1 }))).toThrow(InvalidAuditMetadataError);
  });

  it('rejects a non-integer resultCount', () => {
    expect(() => validateMetadata('phi.access.v2', ok({ resultCount: 1.5 }))).toThrow(InvalidAuditMetadataError);
  });

  it('rejects pageSize out of bounds', () => {
    expect(() => validateMetadata('phi.access.v2', ok({ pageSize: 0 }))).toThrow(InvalidAuditMetadataError);
    expect(() => validateMetadata('phi.access.v2', ok({ pageSize: 5000 }))).toThrow(InvalidAuditMetadataError);
  });

  it('rejects a raw search term / free text (not an allowed enum value)', () => {
    expect(() => validateMetadata('phi.access.v2', ok({ accessSurface: 'Jane Doe DOB 1990' }))).toThrow(
      InvalidAuditMetadataError,
    );
    expect(() => validateMetadata('phi.access.v2', ok({ filterClass: 'lastname:Doe' }))).toThrow(
      InvalidAuditMetadataError,
    );
  });

  it('rejects name/DOB/MRN-like fields as undeclared keys', () => {
    for (const key of ['name', 'dob', 'dateOfBirth', 'mrn', 'registrationNo', 'searchTerm', 'diagnosis']) {
      expect(() => validateMetadata('phi.access.v2', ok({ [key]: 'x' }))).toThrow(InvalidAuditMetadataError);
    }
  });

  it('rejects any unknown key', () => {
    expect(() => validateMetadata('phi.access.v2', ok({ whatever: 'y' }))).toThrow(InvalidAuditMetadataError);
  });

  it('enforces required fields (accessSurface, accessMode, producerModule)', () => {
    expect(() => validateMetadata('phi.access.v2', { accessMode: 'view', producerModule: 'records' })).toThrow(
      InvalidAuditMetadataError,
    );
    expect(() => validateMetadata('phi.access.v2', { accessSurface: 'record_detail', producerModule: 'records' })).toThrow(
      InvalidAuditMetadataError,
    );
    expect(() => validateMetadata('phi.access.v2', { accessSurface: 'record_detail', accessMode: 'view' })).toThrow(
      InvalidAuditMetadataError,
    );
  });

  it('handles optional bounded fields correctly', () => {
    expect(() =>
      validateMetadata('phi.access.v2', ok({ documentType: 'report', filterClass: 'status', redactionState: 'partial', reasonCode: 'clinical_review' })),
    ).not.toThrow();
    // an out-of-enum optional value is rejected
    expect(() => validateMetadata('phi.access.v2', ok({ reasonCode: 'because' }))).toThrow(InvalidAuditMetadataError);
  });

  it('there is no required free-text accessReason (retired in v2)', () => {
    // v2 validates with only the three required enums — no accessReason needed.
    expect(() => validateMetadata('phi.access.v2', ok())).not.toThrow();
    // accessReason is now an undeclared key
    expect(() => validateMetadata('phi.access.v2', ok({ accessReason: 'clinical_review' }))).toThrow(
      InvalidAuditMetadataError,
    );
  });
});
