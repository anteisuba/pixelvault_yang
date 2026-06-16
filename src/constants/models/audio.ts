import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import { AI_MODELS } from '@/constants/models/enum'
import type { ModelOption } from '@/constants/models/types'

/** TTS / audio synthesis models. */
export const AUDIO_MODEL_OPTIONS: ModelOption[] = [
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
  {
    id: AI_MODELS.ELEVENLABS_V3,
    cost: 5,
    adapterType: AI_ADAPTER_TYPES.ELEVENLABS,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.ELEVENLABS),
    externalModelId: 'eleven_v3',
    outputType: 'AUDIO',
    available: true,
    officialUrl:
      'https://elevenlabs.io/docs/api-reference/text-to-speech/convert',
    timeoutMs: 60_000,
    qualityTier: 'premium',
  },
]
