import 'server-only'

import { AI_ADAPTER_TYPES } from '@/constants/providers'

/**
 * Get the platform-level API key for a given adapter type.
 * These keys are used for free tier generations and model health checks.
 */
export function getSystemApiKey(adapterType: string): string | null {
  switch (adapterType) {
    case AI_ADAPTER_TYPES.HUGGINGFACE:
      return process.env.HF_API_TOKEN ?? null
    case AI_ADAPTER_TYPES.GEMINI:
      return process.env.GEMINI_API_KEY ?? null
    case AI_ADAPTER_TYPES.OPENAI:
      return process.env.OPENAI_API_KEY ?? null
    case AI_ADAPTER_TYPES.FAL:
      return process.env.FAL_API_KEY ?? null
    case AI_ADAPTER_TYPES.REPLICATE:
      return process.env.REPLICATE_API_TOKEN ?? null
    default:
      return null
  }
}
