import 'server-only'

import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

import type {
  ProviderAdapter,
  HealthCheckInput,
} from '@/services/providers/types'

// ─── Adapter ─────────────────────────────────────────────────────

/**
 * VolcEngine (火山方舟) adapter — health check only. Seedream image
 * generation used to live here; it now runs exclusively through the
 * execution worker (workers/execution), which has its own VolcEngine
 * client.
 *
 * Auth: Bearer token (ARK_API_KEY), same pattern as OpenAI.
 */
export const volcengineAdapter: ProviderAdapter = {
  adapterType: AI_ADAPTER_TYPES.VOLCENGINE,

  async healthCheck({ apiKey, baseUrl, timeoutMs }: HealthCheckInput) {
    const start = Date.now()
    const url = `${(baseUrl || AI_PROVIDER_ENDPOINTS.VOLCENGINE).replace(/\/$/, '')}/models`

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(timeoutMs),
      })

      const latencyMs = Date.now() - start
      if (response.ok) {
        return { status: 'available' as const, latencyMs }
      }
      return {
        status: 'unavailable' as const,
        latencyMs,
        error: `HTTP ${response.status}`,
      }
    } catch (err) {
      return {
        status: 'unavailable' as const,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : 'Unknown error',
      }
    }
  },
}

export const byteplusAdapter: ProviderAdapter = {
  ...volcengineAdapter,
  adapterType: AI_ADAPTER_TYPES.BYTEPLUS,
}
