/**
 * Age in whole years derived from a date of birth. Age is never stored — it is
 * always computed from dateOfBirth (see DATA_MIGRATION_PLAN.md). Returns null
 * when there is no DOB.
 */
export function deriveAge(dob: Date | null | undefined, now: Date = new Date()): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  let age = now.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age < 0 ? null : age;
}
