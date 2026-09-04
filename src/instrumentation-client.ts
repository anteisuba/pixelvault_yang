import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance: sample 10% of transactions in production
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // ⛔ No `replays*SampleRate` here. Session Replay is consent-gated and gets
  // added at runtime by `enableSessionReplay()` in
  // `src/lib/sentry-session-replay.ts`; error reporting below needs no consent.

  // Only send errors in production
  enabled: process.env.NODE_ENV === 'production',

  // Filter out noise
  ignoreErrors: [
    'ResizeObserver loop',
    'Failed to fetch',
    'Load failed',
    'NetworkError',
    'AbortError',
  ],
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
