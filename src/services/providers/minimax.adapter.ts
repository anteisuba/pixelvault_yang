import 'server-only'

import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

import type {
  ProviderAdapter,
  HealthCheckInput,
} from '@/services/providers/types'

/**
 * MiniMax (Hailuo) video adapter — MiniMax-H3.
 *
 *   POST {base}/video_generation                → { task_id }
 *   GET  {base}/query/video_generation/{taskId} → { task: { status, content:{ url } } }
 *
 * Auth: `Authorization: Bearer <key>` (same shape as VolcEngine/OpenAI).
 *
 * One adapter object serves **both stations** — global (api.minimax.io) and CN
 * (api.minimaxi.com) — because the wire format is identical; only the base URL
 * and the key differ, and both arrive via `providerConfig` / `apiKey`. The two
 * stations still need two adapter *types* so their keys stay in separate slots
 * (keys are not interchangeable); `minimaxAdapter` and `minimaxCnAdapter` below
 * are the same implementation wearing two `adapterType` labels.
 */

const minimaxVideoImplementation = {
  async healthCheck({ apiKey, baseUrl, timeoutMs }: HealthCheckInput) {
    const start = Date.now()
    // MiniMax exposes no cheap "list models" route, so the probe is a query for
    // a task id that cannot exist: 401/403 means the key is bad, while a 4xx
    // "not found" style answer proves the key authenticated fine.
    const root = (baseUrl || AI_PROVIDER_ENDPOINTS.MINIMAX).replace(/\/$/, '')
    const url = `${root}/query/video_generation/healthcheck-probe`

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(timeoutMs),
      })

      const latencyMs = Date.now() - start
      if (response.status === 401 || response.status === 403) {
        return {
          status: 'unavailable' as const,
          latencyMs,
          error: `HTTP ${response.status}`,
        }
      }
      return { status: 'available' as const, latencyMs }
    } catch (err) {
      return {
        status: 'unavailable' as const,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : 'Unknown error',
      }
    }
  },
} satisfies Omit<ProviderAdapter, 'adapterType'>

/** Global station — api.minimax.io. */
export const minimaxAdapter: ProviderAdapter = {
  adapterType: AI_ADAPTER_TYPES.MINIMAX,
  ...minimaxVideoImplementation,
}

/** 国内站 — api.minimaxi.com. Same wire format, separate key slot. */
export const minimaxCnAdapter: ProviderAdapter = {
  adapterType: AI_ADAPTER_TYPES.MINIMAX_CN,
  ...minimaxVideoImplementation,
}
