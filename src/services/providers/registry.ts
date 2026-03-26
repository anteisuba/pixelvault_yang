import 'server-only'

import { AI_ADAPTER_TYPES } from '@/constants/providers'

import { falAdapter } from '@/services/providers/fal.adapter'
import { geminiAdapter } from '@/services/providers/gemini.adapter'
import { huggingFaceAdapter } from '@/services/providers/huggingface.adapter'
import { novelAiAdapter } from '@/services/providers/novelai.adapter'
import { openAiAdapter } from '@/services/providers/openai.adapter'
import { replicateAdapter } from '@/services/providers/replicate.adapter'
import type { ProviderAdapter } from '@/services/providers/types'

const PROVIDER_ADAPTERS: Record<AI_ADAPTER_TYPES, ProviderAdapter> = {
  [AI_ADAPTER_TYPES.HUGGINGFACE]: huggingFaceAdapter,
  [AI_ADAPTER_TYPES.GEMINI]: geminiAdapter,
  [AI_ADAPTER_TYPES.OPENAI]: openAiAdapter,
  [AI_ADAPTER_TYPES.FAL]: falAdapter,
  [AI_ADAPTER_TYPES.REPLICATE]: replicateAdapter,
  [AI_ADAPTER_TYPES.NOVELAI]: novelAiAdapter,
}

export function getProviderAdapter(
  adapterType: AI_ADAPTER_TYPES,
): ProviderAdapter {
  return PROVIDER_ADAPTERS[adapterType]
}
