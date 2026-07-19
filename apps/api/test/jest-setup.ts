/**
 * Program 2 · P2-R016A — per-worker jest setup. Loads apps/api/.env so that resolveTestDatabaseUrl()
 * can derive the isolated `_test` URL from DATABASE_URL. It does NOT itself connect or mutate anything;
 * the fail-closed isolation guard lives in createTestPrisma(). Runs before each worker's test modules.
 */
import { join } from 'path';

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('dotenv').config({ path: join(__dirname, '..', '.env') });
} catch {
  /* dotenv absent → rely on an externally-provided environment (CI) */
}
