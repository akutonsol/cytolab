import { generateInvitationToken, generatePlaceholderSecret, hashInvitationToken, STAFF_INVITATION_TTL_MS } from './staff-invitation-token';

/**
 * Program 7 · Phase 7B.2 — token unit tests (no I/O). Opaque high-entropy tokens; deterministic hash-only storage.
 */
describe('staff-invitation-token', () => {
  it('generates high-entropy, URL-safe, unique tokens', () => {
    const a = generateInvitationToken();
    const b = generateInvitationToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{40,}$/); // 256-bit base64url
  });

  it('hashes deterministically (sha256) and never returns the plaintext', () => {
    const raw = generateInvitationToken();
    expect(hashInvitationToken(raw)).toBe(hashInvitationToken(raw));
    expect(hashInvitationToken(raw)).not.toContain(raw);
    expect(hashInvitationToken(raw)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('placeholder secrets are random (Model C — unusable)', () => {
    expect(generatePlaceholderSecret()).not.toBe(generatePlaceholderSecret());
  });

  it('TTL is 72h', () => {
    expect(STAFF_INVITATION_TTL_MS).toBe(72 * 60 * 60 * 1000);
  });
});
