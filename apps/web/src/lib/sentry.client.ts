'use client';

// Client-side Sentry init. Completely inert without NEXT_PUBLIC_SENTRY_DSN, so it
// is a no-op locally and in any environment that hasn't opted in.
//
// NOTE (tech debt): this is a minimal client-only setup — no server instrumentation
// and no source-map upload (which would require the withSentryConfig build wrapper
// and Next's instrumentation hook). Complete that during the Next 15 upgrade
// (Phase 5), where @sentry/nextjs's App-Router integration is first-class.
import * as Sentry from '@sentry/nextjs';

if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES ?? 0.1),
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}
