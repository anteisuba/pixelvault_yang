import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

export type LlmCapabilityScope = 'enhance' | 'planner' | 'assistant'

export const LLM_ENHANCE_ROUTE_MODELS = [
  {
    adapterType: AI_ADAPTER_TYPES.OPENAI,
    modelId: LLM_TEXT_MODEL_IDS.OPENAI_GPT_5_5,
    label: 'OpenAI GPT-5.5',
  },
  {
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    modelId: LLM_TEXT_MODEL_IDS.GEMINI_3_1_FLASH_LITE,
    label: 'Gemini 3.1 Flash Lite',
  },
  {
    adapterType: AI_ADAPTER_TYPES.DASHSCOPE,
    modelId: LLM_TEXT_MODEL_IDS.QWEN_FLASH,
    label: 'Qwen Flash',
  },
] as const

const ADAPTER_CAPABILITIES: Record<
  AI_ADAPTER_TYPES,
  ReadonlyArray<LlmCapabilityScope>
> = {
  [AI_ADAPTER_TYPES.OPENAI]: ['enhance', 'planner', 'assistant'],
  [AI_ADAPTER_TYPES.GEMINI]: ['enhance', 'planner', 'assistant'],
  // DeepSeek is text-only (no vision). It stays the strongest planner for
  // Chinese scriptwriting / shot breakdowns and now also serves the canvas
  // assistant, which is text-only today (node context + chat, no images).
  [AI_ADAPTER_TYPES.DEEPSEEK]: ['planner', 'assistant'],
  // DashScope (Qwen): cheap enhance + text planner + assistant. The assistant
  // route runs the text flagship (qwen3-max); image-reverse vision turns route
  // to Gemini/GPT/qwen3-vl-plus instead.
  [AI_ADAPTER_TYPES.DASHSCOPE]: ['enhance', 'planner', 'assistant'],
  [AI_ADAPTER_TYPES.VOLCENGINE]: [],
  [AI_ADAPTER_TYPES.HUGGINGFACE]: [],
  [AI_ADAPTER_TYPES.FAL]: [],
  [AI_ADAPTER_TYPES.RUNWAY]: [],
  [AI_ADAPTER_TYPES.REPLICATE]: [],
  [AI_ADAPTER_TYPES.NOVELAI]: [],
  [AI_ADAPTER_TYPES.FISH_AUDIO]: [],
  [AI_ADAPTER_TYPES.HYPER3D_RODIN]: [],
  // ElevenLabs is TTS-only — no text/LLM capability.
  [AI_ADAPTER_TYPES.ELEVENLABS]: [],
}

export function getLLMCapabilityScope(
  scope: LlmCapabilityScope,
): AI_ADAPTER_TYPES[] {
  return (
    Object.entries(ADAPTER_CAPABILITIES) as Array<
      [AI_ADAPTER_TYPES, ReadonlyArray<LlmCapabilityScope>]
    >
  )
    .filter(([, caps]) => caps.includes(scope))
    .map(([adapter]) => adapter)
}

export function adapterHasCapability(
  adapter: AI_ADAPTER_TYPES,
  scope: LlmCapabilityScope,
): boolean {
  return ADAPTER_CAPABILITIES[adapter]?.includes(scope) ?? false
}
