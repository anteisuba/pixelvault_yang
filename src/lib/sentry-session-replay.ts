import type { BrowserClient } from '@sentry/nextjs'

import {
  SENTRY_REPLAY_INTEGRATION_NAME,
  SENTRY_REPLAY_ON_ERROR_SAMPLE_RATE,
  SENTRY_REPLAY_SESSION_SAMPLE_RATE,
} from '@/constants/privacy-consent'

/**
 * Turn on Sentry Session Replay — **only** after the visitor accepted the
 * privacy notice.
 *
 * Why this is not part of `Sentry.init` (`src/instrumentation-client.ts`):
 * error reporting runs on legitimate interest and needs no consent, but
 * recording a session does. Replay is *not* in `@sentry/browser`'s
 * `getDefaultIntegrations()` (v10.46: inboundFilters, functionToString,
 * conversationId, browserApiErrors, breadcrumbs, globalHandlers,
 * linkedErrors, dedupe, httpContext, cultureContext, browserSession), so
 * leaving it out of `init` means the recorder is genuinely absent, not merely
 * sampled at 0.
 *
 * Sample rates are read off the client options by `replayIntegration`'s
 * `afterAllSetup` hook, which `client.addIntegration()` runs synchronously at
 * add time — so writing them just before the add is enough, and no reload is
 * needed for consent to take effect.
 *
 * The `import()` keeps the recorder out of the main chunk: a visitor who never
 * accepts never downloads it.
 */
let enabling: Promise<void> | null = null

export function enableSessionReplay(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve()
  }
  enabling ??= addReplayIntegration()
  return enabling
}

async function addReplayIntegration(): Promise<void> {
  const Sentry = await import('@sentry/nextjs')
  const client = Sentry.getClient<BrowserClient>()
  if (!client || client.getIntegrationByName(SENTRY_REPLAY_INTEGRATION_NAME)) {
    return
  }

  const options = client.getOptions()
  options.replaysSessionSampleRate = SENTRY_REPLAY_SESSION_SAMPLE_RATE
  options.replaysOnErrorSampleRate = SENTRY_REPLAY_ON_ERROR_SAMPLE_RATE

  Sentry.addIntegration(
    Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
  )
}
