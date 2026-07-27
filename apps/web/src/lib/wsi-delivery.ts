// P5-4 — browser delivery client for authenticated WSI tile viewing.
//
// The viewer NEVER loads slide pixels from an arbitrary `slideUrl`. It issues a short-lived, generation-
// bound delivery session (staff cookie auth, `wsi:view`), then reads the DZI descriptor and every tile
// through the authenticated `/wsi/delivery/*` endpoints with an `Authorization: Bearer` header.
//
// Token handling (hard rules): the raw capability token lives in memory only (a caller-held value / OSD
// ajaxHeaders). It is NEVER written to a URL, query string, cookie, localStorage/sessionStorage, or a log.

import { api } from './api';

/** Same-origin path (Next rewrites /api/v1/* → the API). Delivery endpoints are Bearer-authenticated. */
export const WSI_DELIVERY_BASE = '/api/v1/wsi/delivery';

/** A slide has no sealed+verified PUBLISHED generation to view (issuance 409) — a truthful empty state, not an error. */
export class SlideNotViewableError extends Error {
  constructor() {
    super('slide has no published generation');
    this.name = 'SlideNotViewableError';
  }
}
/** The slide is not accessible to the caller's lab or does not exist (issuance 404). */
export class SlideNotFoundError extends Error {
  constructor() {
    super('slide not found');
    this.name = 'SlideNotFoundError';
  }
}

export interface DeliverySession {
  /** Raw capability token — in memory only; never persist or log. */
  token: string;
  slideId: string;
  generationId: string;
  scopes: string[];
  expiresAt: string;
}

export interface DziDescriptor {
  width: number;
  height: number;
  tileSize: number;
  overlap: number;
  format: string;
}

/**
 * Issue a viewing capability for the slide's currently published generation. Uses the staff cookie session
 * (the axios `api` client); the server chooses scopes + the bound generation. Maps the two expected negatives
 * (404 not-accessible, 409 not-published) to typed results so the caller can render truthfully.
 */
export async function issueDeliverySession(slideId: string): Promise<DeliverySession> {
  try {
    const { data } = await api.post(`/wsi/slides/${slideId}/delivery-session`);
    return { token: data.token, slideId, generationId: data.generationId, scopes: data.scopes, expiresAt: data.expiresAt };
  } catch (e: unknown) {
    const status = (e as { response?: { status?: number } })?.response?.status;
    if (status === 409) throw new SlideNotViewableError();
    if (status === 404) throw new SlideNotFoundError();
    throw e;
  }
}

/** URL for a single tile. No extension — the delivery endpoint sets the content type from the manifest. */
export function tileUrl(level: number, x: number, y: number): string {
  return `${WSI_DELIVERY_BASE}/tiles/${level}/${x}/${y}`;
}

/**
 * Fetch + parse the DZI descriptor with the Bearer token. libvips `dzsave` (the production engine) emits a
 * full DZI (`<Image Format TileSize Overlap><Size Width Height/></Image>`), which is all OpenSeadragon needs
 * to build the pyramid — so the viewer never needs the (deliberately viewer-excluded) MANIFEST scope.
 */
export async function fetchDescriptor(token: string): Promise<DziDescriptor> {
  const res = await fetch(`${WSI_DELIVERY_BASE}/descriptor`, {
    headers: { Authorization: `Bearer ${token}` },
    // Bearer-only endpoint; no cookies needed. Keep the token out of the URL and out of any cache key.
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`descriptor fetch failed (${res.status})`);
  const xml = await res.text();
  return parseDzi(xml);
}

/** Parse the minimal DZI fields OpenSeadragon requires. Throws if the descriptor is not a full DZI. */
export function parseDzi(xml: string): DziDescriptor {
  const num = (re: RegExp): number | null => {
    const m = re.exec(xml);
    return m ? Number(m[1]) : null;
  };
  const width = num(/Width="(\d+)"/);
  const height = num(/Height="(\d+)"/);
  const tileSize = num(/TileSize="(\d+)"/);
  const overlap = num(/Overlap="(\d+)"/);
  const format = /Format="([^"]+)"/.exec(xml)?.[1] ?? 'jpeg';
  if (!width || !height || !tileSize) {
    throw new Error('DZI descriptor is missing Size/TileSize (not a full descriptor)');
  }
  return { width, height, tileSize, overlap: overlap ?? 0, format };
}
