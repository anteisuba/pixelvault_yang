import { getLLMCapabilityScope } from '@/constants/llm-capability'
import { getAvailableModels } from '@/constants/models'
import {
  AI_ADAPTER_TYPES,
  AI_ADAPTER_TYPE_OPTIONS,
} from '@/constants/providers'

export const API_KEY_ADAPTER_OPTIONS = AI_ADAPTER_TYPE_OPTIONS

const LLM_API_KEY_ADAPTERS = new Set<AI_ADAPTER_TYPES>([
  ...getLLMCapabilityScope('enhance'),
  ...getLLMCapabilityScope('planner'),
  ...getLLMCapabilityScope('assistant'),
])

const AVAILABLE_MODEL_API_KEY_ADAPTERS = new Set<AI_ADAPTER_TYPES>(
  getAvailableModels().map((model) => model.adapterType),
)

export const ACTIVE_API_KEY_ADAPTER_OPTIONS = AI_ADAPTER_TYPE_OPTIONS.filter(
  (adapterType) =>
    AVAILABLE_MODEL_API_KEY_ADAPTERS.has(adapterType) ||
    LLM_API_KEY_ADAPTERS.has(adapterType),
)
