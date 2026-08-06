/**
 * Next boots this for both nodejs + edge on every `next dev`.
 * Loading `@sentry/nextjs` into the Edge graph is a known Turbopack cold-start
 * stall on Windows (minutes of "Compiling instrumentation Edge ...", sometimes
 * forever). Sentry is already `enabled: false` in dev configs, so skip the
 * import entirely outside production — no telemetry loss, much faster boot.
 */
const isProduction = process.env.NODE_ENV === 'production'

export async function register() {
  if (!isProduction) return

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config')
  }
}

export const onRequestError = async (...args: unknown[]) => {
  if (!isProduction) return

  const Sentry = await import('@sentry/nextjs')
  // @ts-expect-error — Sentry's captureRequestError accepts the spread args
  return Sentry.captureRequestError(...args)
}
