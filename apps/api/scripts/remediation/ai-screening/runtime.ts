/**
 * Program 1 · P1-3B — impure runtime helpers (DB / env / fs / git).
 *
 * Kept separate from shared.ts so the core logic stays pure and unit-testable. Nothing
 * here runs on import. A PLAIN PrismaClient is used deliberately (not the tenancy-extended
 * Nest client) so remediation sees every lab's rows; it is never wired into the app.
 */
import { execSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync, unlinkSync } from 'fs';
import { resolve, isAbsolute } from 'path';
import { PrismaClient } from '@prisma/client';
import { deriveKeys, type DerivedKeys, type EncryptedPackage, type PrismaLike, type RuntimeBinding } from './shared';

const RESULT_SELECT = {
  id: true, labId: true, recordId: true, status: true, confidence: true, confidenceLevel: true,
  findings: true, primaryFinding: true, flaggedAreas: true, agreedWithAI: true, pathologistNote: true,
  processedAt: true, reviewedAt: true, reviewedById: true, createdAt: true, updatedAt: true,
} as const;

export function getPrisma(): PrismaClient & PrismaLike {
  return new PrismaClient() as unknown as PrismaClient & PrismaLike;
}
export const RESULT_SELECT_ALL = RESULT_SELECT;

export function gitCommit(): string {
  try { return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(); } catch { return process.env.GIT_COMMIT ?? 'unknown'; }
}

/** Latest applied migration directory name — an opaque schema-state identifier. */
export function schemaStateId(): string {
  try {
    const dir = resolve(__dirname, '../../../prisma/migrations');
    const dirs = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
    return dirs.length ? dirs[dirs.length - 1] : 'unknown';
  } catch { return 'unknown'; }
}

/** Non-credential DB identifier derived from DATABASE_URL (host/db only; no user/pass/secret params). */
export function databaseId(): string {
  const url = process.env.DATABASE_URL ?? '';
  try { const u = new URL(url); return `${u.hostname.toLowerCase()}:${u.port || '5432'}${u.pathname}`; } catch { return 'unknown'; }
}

/** Stable non-secret DB fingerprint (sha256 over normalized host:port/db — never credentials). */
export function databaseFingerprint(): string {
  return createHash('sha256').update(databaseId()).digest('hex');
}

/** Current runtime environment signal used for binding (not informational). */
export function currentEnvironment(): string {
  return process.env.REMEDIATION_ENVIRONMENT ?? process.env.APP_ENV ?? process.env.NODE_ENV ?? 'unknown';
}

/** The four binding controls the destructive path must match against the manifest. */
export function runtimeBinding(): RuntimeBinding {
  return { environment: currentEnvironment(), databaseFingerprint: databaseFingerprint(), schemaStateId: schemaStateId(), commitHash: gitCommit() };
}

/** Derive independent evidence + manifest subkeys from the master key (approved secret channel). */
export function deriveEnvKeys(): DerivedKeys {
  return deriveKeys(readEncryptionKey());
}

/** Runtime containment: AI_SCREENING must be enabled for 0 labs. */
export async function containmentActive(prisma: PrismaLike): Promise<boolean> {
  const enabled = await prisma.labFeature.count({ where: { featureKey: 'AI_SCREENING', isEnabled: true } });
  return enabled === 0;
}

/** Read the AES-256-GCM key ONLY from an approved secret env var. Never from code/args. */
export function readEncryptionKey(): string {
  const k = process.env.AISCREENING_REMEDIATION_KEY;
  if (!k) throw new Error('AISCREENING_REMEDIATION_KEY not set — supply the 32-byte hex key via the approved secret channel');
  return k.trim();
}

/** Refuse to write evidence/manifest inside the tracked repository. */
export function assertOutsideRepo(p: string): void {
  const abs = isAbsolute(p) ? p : resolve(process.cwd(), p);
  const repoRoot = resolve(__dirname, '../../../../..'); // apps/api/scripts/remediation/ai-screening -> repo root
  if (abs === repoRoot || abs.startsWith(repoRoot + '/')) {
    throw new Error(`ABORT: refusing to write remediation evidence inside the repository (${abs}). Use an external protected destination.`);
  }
}

/** Atomic encrypted write: temp -> verify decrypt+parse -> rename to final. */
export function atomicWriteJsonEncrypted(finalPath: string, pkg: EncryptedPackage, verify: (raw: string) => void): void {
  assertOutsideRepo(finalPath);
  const tmp = `${finalPath}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(pkg), { mode: 0o600 });
  try {
    verify(readFileSync(tmp, 'utf8')); // decrypt + checksum happens in caller-provided verify
    renameSync(tmp, finalPath);
  } catch (e) {
    try { unlinkSync(tmp); } catch { /* ignore */ }
    throw e;
  }
}

export function writeReceipt(path: string, receipt: Record<string, unknown>): void {
  assertOutsideRepo(path);
  writeFileSync(path, JSON.stringify(receipt, null, 2), { mode: 0o600 });
}

/** Validate (repo-guard) an optional external receipt destination; undefined = print to stdout. */
export function computeReceiptDest(path?: string): string | undefined {
  if (!path) return undefined;
  assertOutsideRepo(path);
  return path;
}

export function fileSha256(path: string): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createHash } = require('crypto');
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export { existsSync, readFileSync };
