import 'server-only'

import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { ProviderAdapter } from '@/services/providers/types'

export const ideogramAdapter = {
  adapterType: AI_ADAPTER_TYPES.IDEOGRAM,
  async healthCheck({ apiKey, timeoutMs }) {
    const start = Date.now()
    try {
      const response = await fetch(
        `${AI_PROVIDER_ENDPOINTS.IDEOGRAM}/v2/image/generate/ideogram-4-5?dry_run=true`,
        {
          method: 'POST',
          headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: 'A blue circle',
            quality: 'medium',
            size: '1024x1024',
            num_images: 1,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        },
      )
      return {
        status: response.ok ? 'available' : 'unavailable',
        latencyMs: Date.now() - start,
        ...(response.ok ? {} : { error: `HTTP ${response.status}` }),
      }
    } catch (error) {
      return {
        status: 'unavailable',
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'Connection failed',
      }
    }
  },
} satisfies ProviderAdapter
