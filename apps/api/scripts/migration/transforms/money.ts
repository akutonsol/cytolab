/**
 * Money transform: legacy `double precision` dollars -> Osieri `Int` minor units
 * (cents). Osieri never stores money as a float. Rounds to the nearest cent.
 */

/** Convert a legacy dollar amount to integer cents. null/absent -> 0 (Osieri amount columns default 0). */
export function toCents(dollars: unknown): number {
  if (dollars === null || dollars === undefined || dollars === '') return 0;
  const n = typeof dollars === 'number' ? dollars : Number(dollars);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}
