import 'server-only'

import { AI_ADAPTER_TYPES } from '@/constants/providers'

import { geminiAdapter } from '@/services/providers/gemini.adapter'
import { huggingFaceAdapter } from '@/services/providers/huggingface.adapter'
import { openAiAdapter } from '@/services/providers/openai.adapter'
import type { ProviderAdapter } from '@/services/providers/types'

const PROVIDER_ADAPTERS: Record<AI_ADAPTER_TYPES, ProviderAdapter> = {
  [AI_ADAPTER_TYPES.HUGGINGFACE]: huggingFaceAdapter,
  [AI_ADAPTER_TYPES.GEMINI]: geminiAdapter,
  [AI_ADAPTER_TYPES.OPENAI]: openAiAdapter,
}

export function getProviderAdapter(
  adapterType: AI_ADAPTER_TYPES,
): ProviderAdapter {
  return PROVIDER_ADAPTERS[adapterType]
}
