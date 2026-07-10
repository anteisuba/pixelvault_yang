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
    case AI_ADAPTER_TYPES.DEEPSEEK:
      return process.env.DEEPSEEK_API_KEY ?? null
    case AI_ADAPTER_TYPES.FAL:
      return process.env.FAL_API_KEY ?? null
    case AI_ADAPTER_TYPES.RUNWAY:
      return (
        process.env.RUNWAYML_API_SECRET ?? process.env.RUNWAY_API_KEY ?? null
      )
    case AI_ADAPTER_TYPES.REPLICATE:
      return process.env.REPLICATE_API_TOKEN ?? null
    case AI_ADAPTER_TYPES.NOVELAI:
      return process.env.NOVELAI_API_TOKEN ?? null
    case AI_ADAPTER_TYPES.VOLCENGINE:
      return process.env.VOLCENGINE_API_KEY ?? null
    case AI_ADAPTER_TYPES.RUNNER:
      // Comfy Runner has no BYOK path — RUNPOD_KEY is the only credential,
      // configured as a Cloudflare Worker secret (`wrangler secret put
      // RUNPOD_KEY`) and read here only for the Next.js side's own
      // system-key resolution flow (resolveExecutionApiKey → Worker).
      return process.env.RUNPOD_KEY ?? null
    default:
      return null
  }
}

export function getFishAudioVoiceLibraryApiKey(): string | null {
  return process.env.FISH_AUDIO_VOICE_LIBRARY_API_KEY ?? null
}

/**
 * Platform-level Civitai token used to authenticate LoRA downloads when
 * the user hasn't configured a personal one. Civitai's /api/download
 * now 401s anonymous requests, so without this fallback Replicate
 * (which fetches LoRA URLs server-side) can't load any Civitai LoRA.
 *
 * The token is only used by `resolveCivitaiToken` in
 * generate-image.service as a fallback after the per-user token check —
 * we still prefer the user's own token when present so per-account rate
 * limits and download history live with them, not the platform.
 */
export function getSystemCivitaiToken(): string | null {
  return process.env.CIVITAI_API_TOKEN ?? null
}
