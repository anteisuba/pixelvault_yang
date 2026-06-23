import { GENERATION_POLL } from '@/constants/config'
import type { AsyncJobStatus, GenerationRecord } from '@/types'

/**
 * Minimal structural shape every async generation status endpoint shares
 * (image / video / audio). Declared locally so the poller stays decoupled from
 * each modality's nominal response type — `ImageStatusResponse`,
 * `VideoStatusResponse`, and `AudioStatusResponse` are all assignable here.
 */
export interface GenerationStatusProbeResponse {
  success: boolean
  data?: {
    status: AsyncJobStatus
    generation?: GenerationRecord
    error?: string
    errorCode?: string
    i18nKey?: string
  }
  error?: string
}

export type GenerationStatusProbe = (
  jobId: string,
) => Promise<GenerationStatusProbeResponse>

export type GenerationPollOutcome =
  | { status: 'completed'; generation: GenerationRecord }
  | { status: 'failed'; error: string; errorCode?: string; i18nKey?: string }
  /**
   * Still in flight after the attempt budget (or after too many consecutive
   * transient status failures). The job keeps running server-side — the caller
   * must persist its jobId and reconcile later instead of resetting to idle.
   */
  | { status: 'pending' }

interface PollGenerationStatusConfig {
  maxAttempts: number
  intervalMs: number
  fallbackError: string
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function transientBackoffMs(consecutiveFailures: number): number {
  const exponential =
    GENERATION_POLL.BACKOFF_BASE_MS * 2 ** (consecutiveFailures - 1)
  return Math.min(exponential, GENERATION_POLL.BACKOFF_MAX_MS)
}

/**
 * Poll an async generation job to a terminal state, surviving transient
 * status-endpoint failures.
 *
 * A thrown probe or a non-success/empty envelope is treated as transient: the
 * poller backs off (exponential, capped) and retries rather than abandoning the
 * still-running job on the first network hiccup. Only a provider-side `FAILED`
 * status is a terminal failure. Running out of attempts — or exceeding the
 * consecutive transient tolerance — yields `pending` so the caller can persist
 * the jobId and reconcile later. It only ever reads status; it never
 * re-submits, so credits are never re-charged.
 */
export async function pollGenerationStatus(
  jobId: string,
  probe: GenerationStatusProbe,
  config: PollGenerationStatusConfig,
): Promise<GenerationPollOutcome> {
  let consecutiveTransient = 0

  for (let attempt = 0; attempt < config.maxAttempts; attempt += 1) {
    let response: GenerationStatusProbeResponse | null = null
    try {
      response = await probe(jobId)
    } catch {
      response = null
    }

    const data = response?.success ? response.data : undefined

    if (!data) {
      // Transient: a thrown fetch or a non-success/empty envelope. Back off and
      // retry instead of giving up the in-flight job on a single hiccup.
      consecutiveTransient += 1
      if (consecutiveTransient >= GENERATION_POLL.TRANSIENT_TOLERANCE) {
        return { status: 'pending' }
      }
      await delay(transientBackoffMs(consecutiveTransient))
      continue
    }

    consecutiveTransient = 0

    if (data.status === 'COMPLETED' && data.generation) {
      return { status: 'completed', generation: data.generation }
    }

    if (data.status === 'FAILED') {
      return {
        status: 'failed',
        error: data.error ?? config.fallbackError,
        errorCode: data.errorCode,
        i18nKey: data.i18nKey,
      }
    }

    // IN_QUEUE / IN_PROGRESS (or a COMPLETED envelope still missing its
    // generation record) — keep waiting on the normal cadence.
    await delay(config.intervalMs)
  }

  return { status: 'pending' }
}
