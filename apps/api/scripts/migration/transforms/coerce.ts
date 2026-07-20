/**
 * Value coercions for the ETL. Legacy stored many fields as free text
 * (varchar) even when semantically a bool/int/date — the EAV pivot and a few
 * typed columns need robust coercion. All functions are total and null-safe:
 * unparseable input yields null (never throws), so one messy legacy cell never
 * aborts a whole record.
 */

/** Trim; treat empty / whitespace / common null-sentinels as null. */
export function cleanString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === '') return null;
  const low = s.toLowerCase();
  if (low === 'null' || low === 'n/a' || low === 'na' || low === '-' || low === 'undefined') {
    return null;
  }
  return s;
}

const TRUE_TOKENS = new Set(['true', 't', 'yes', 'y', '1', 'on']);
const FALSE_TOKENS = new Set(['false', 'f', 'no', 'n', '0', 'off']);

/**
 * Coerce a legacy bool/text value to a boolean. Returns the given fallback
 * (default false) when the value is absent or unrecognized — clinical bool
 * fields are non-nullable in Osieri with a default of false.
 */
export function parseBool(v: unknown, fallback = false): boolean {
  if (typeof v === 'boolean') return v;
  const s = cleanString(v);
  if (s === null) return fallback;
  const low = s.toLowerCase();
  if (TRUE_TOKENS.has(low)) return true;
  if (FALSE_TOKENS.has(low)) return false;
  return fallback;
}

/** Coerce to a non-negative integer; null when not a number. Pulls the first integer out of noisy text ("G3" -> 3). */
export function parseIntOrNull(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.trunc(v) : null;
  const s = cleanString(v);
  if (s === null) return null;
  const m = s.match(/-?\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return Number.isNaN(n) ? null : n;
}

/**
 * Coerce a legacy date/text value to a Date; null when unparseable. Accepts ISO
 * strings, JS Dates, and common dd/mm/yyyy or mm/dd/yyyy forms. Ambiguous
 * numeric-only or garbage text yields null rather than a wrong date.
 */
export function parseDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const s = cleanString(v);
  if (s === null) return null;

  // Native parse ONLY for ISO-8601-ish strings (yyyy-mm-dd / with a time part).
  // Slash/dash dd-mm forms are handled below — never let native interpret those
  // as US mm/dd.
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s) || /[T]/.test(s)) {
    const native = new Date(s);
    if (!Number.isNaN(native.getTime())) return native;
  }

  // dd/mm/yyyy or dd-mm-yyyy (legacy locale = Jamaica, day-first).
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    let year = parseInt(y, 10);
    if (year < 100) year += year < 50 ? 2000 : 1900;
    const day = parseInt(d, 10);
    const month = parseInt(mo, 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const dt = new Date(Date.UTC(year, month - 1, day));
      if (!Number.isNaN(dt.getTime())) return dt;
    }
  }
  return null;
}
