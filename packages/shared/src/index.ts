// Shared types & constants between API and Web.
// Keep this dependency-free (types, enums, constants only).

export const RECORD_STATUSES = [
  'DRAFT',
  'RECEIVED',
  'IN_PROGRESS',
  'PARTIAL',
  'COMPLETED',
  'BILLED',
  'PAID',
  'CANCELLED',
] as const;

export type RecordStatus = (typeof RECORD_STATUSES)[number];
