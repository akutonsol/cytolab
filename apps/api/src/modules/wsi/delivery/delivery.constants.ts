import { DeliveryScope } from '@prisma/client';

/** P5-5B — the staff permission gating delivery-session ISSUANCE (catalogued in prisma/seed.ts SPECIAL_OBJECTS). */
export const WSI_VIEW_PERMISSION = 'wsi:view';

/**
 * P5-5B — the fixed capability set the normal viewer issuance endpoint grants. MANIFEST is deliberately
 * excluded (a diagnostic/technical capability); MANIFEST-scoped sessions are for explicit future tooling.
 * Callers do NOT choose scopes — this is server policy.
 */
export const VIEWER_SCOPES: DeliveryScope[] = [DeliveryScope.DESCRIPTOR, DeliveryScope.TILES, DeliveryScope.ASSOCIATED_IMAGES];
