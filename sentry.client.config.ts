import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance: sample 10% of transactions in production
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Session replay: capture 1% of sessions, 100% of errored sessions
  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 1.0,

  // Only send errors in production
  enabled: process.env.NODE_ENV === 'production',

  // Filter out noise
  ignoreErrors: [
    // Browser extensions
    'ResizeObserver loop',
    // Network errors that are expected
    'Failed to fetch',
    'Load failed',
    'NetworkError',
    // User aborts
    'AbortError',
  ],
})
