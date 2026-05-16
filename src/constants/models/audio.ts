import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import { AI_MODELS } from '@/constants/models/enum'
import type { ModelOption } from '@/constants/models/types'

/** TTS / audio synthesis models. */
export const AUDIO_MODEL_OPTIONS: ModelOption[] = [
  // ─── Audio Models ────────────────────────────────────────────────

  // #1 — Fish Audio S2 Pro, top-ranked TTS (81.88% win rate on EmergentTTS-Eval)
  {
    id: AI_MODELS.FISH_AUDIO_S2_PRO,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.FISH_AUDIO,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FISH_AUDIO),
    externalModelId: 's2-pro',
    outputType: 'AUDIO',
    available: true,
    officialUrl:
      'https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech',
    timeoutMs: 60_000,
    qualityTier: 'premium',
  },
  // #2 — FAL F5-TTS, open-source zero-shot voice cloning
  {
    id: AI_MODELS.FAL_F5_TTS,
    cost: 1,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/f5-tts',
    outputType: 'AUDIO',
    available: false,
    freeTier: true,
    officialUrl: 'https://fal.ai/models/fal-ai/f5-tts',
    timeoutMs: 120_000,
    qualityTier: 'standard',
  },
]
