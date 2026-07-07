// Sentry initialization — MUST be imported before any other module in main.ts so
// the SDK can instrument them. Completely inert without SENTRY_DSN (no-op locally
// and in any environment that hasn't opted in).
import * as Sentry from '@sentry/node';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    // Conservative default trace sampling; override via env.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    // Never ship PHI/PII to Sentry by default.
    sendDefaultPii: false,
  });
}
