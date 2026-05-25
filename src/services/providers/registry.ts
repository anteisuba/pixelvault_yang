import 'server-only'

import { AI_ADAPTER_TYPES } from '@/constants/providers'

import { falAdapter } from '@/services/providers/fal.adapter'
import { fishAudioAdapter } from '@/services/providers/fish-audio.adapter'
import { hyper3dRodinAdapter } from '@/services/providers/hyper3d-rodin.adapter'
import { geminiAdapter } from '@/services/providers/gemini.adapter'
import { huggingFaceAdapter } from '@/services/providers/huggingface.adapter'
import { novelAiAdapter } from '@/services/providers/novelai.adapter'
import { openAiAdapter } from '@/services/providers/openai.adapter'
import { replicateAdapter } from '@/services/providers/replicate.adapter'
import { runwayAdapter } from '@/services/providers/runway.adapter'
import { volcengineAdapter } from '@/services/providers/volcengine.adapter'
import type { ProviderAdapter } from '@/services/providers/types'

const PROVIDER_ADAPTERS: Partial<Record<AI_ADAPTER_TYPES, ProviderAdapter>> = {
  [AI_ADAPTER_TYPES.HUGGINGFACE]: huggingFaceAdapter,
  [AI_ADAPTER_TYPES.GEMINI]: geminiAdapter,
  [AI_ADAPTER_TYPES.OPENAI]: openAiAdapter,
  [AI_ADAPTER_TYPES.FAL]: falAdapter,
  [AI_ADAPTER_TYPES.RUNWAY]: runwayAdapter,
  [AI_ADAPTER_TYPES.REPLICATE]: replicateAdapter,
  [AI_ADAPTER_TYPES.NOVELAI]: novelAiAdapter,
  [AI_ADAPTER_TYPES.VOLCENGINE]: volcengineAdapter,
  [AI_ADAPTER_TYPES.FISH_AUDIO]: fishAudioAdapter,
  [AI_ADAPTER_TYPES.HYPER3D_RODIN]: hyper3dRodinAdapter,
}

export function getProviderAdapter(
  adapterType: AI_ADAPTER_TYPES,
): ProviderAdapter {
  const adapter = PROVIDER_ADAPTERS[adapterType]
  if (!adapter) {
    throw new Error(`Provider adapter not available for ${adapterType}`)
  }

  return adapter
}
