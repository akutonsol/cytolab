/**
 * Program 2 · P2-8D — fail-closed decision for PHI reads. A PHI request failure must drop the client
 * back to the base projection. But 403 (no permission) and 404 (concealment) are NOT PHI failures —
 * they are their own terminal states and must keep their experiences. Only a genuine operational
 * failure (5xx / network / malformed) of a PHI request triggers the automatic revert-to-base.
 */
export function shouldPhiFailClosedRevert(phi: boolean, error: unknown): boolean {
  if (!phi || !error) return false;
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return status !== 403 && status !== 404;
}
