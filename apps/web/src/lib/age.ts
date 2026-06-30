import dayjs from 'dayjs';

/**
 * Age in whole years from a date of birth. Age is never stored — it is always
 * derived from dateOfBirth (read-only) on the form and in lists. Returns null
 * when there is no/invalid DOB or a future date.
 */
export function deriveAge(dob?: string | Date | dayjs.Dayjs | null): number | null {
  if (!dob) return null;
  const d = dayjs(dob);
  if (!d.isValid()) return null;
  const age = dayjs().diff(d, 'year');
  return age < 0 ? null : age;
}
