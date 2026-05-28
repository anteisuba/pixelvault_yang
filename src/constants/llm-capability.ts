import { AI_ADAPTER_TYPES } from '@/constants/providers'

export type LlmCapabilityScope = 'enhance' | 'planner' | 'assistant'

const ADAPTER_CAPABILITIES: Record<
  AI_ADAPTER_TYPES,
  ReadonlyArray<LlmCapabilityScope>
> = {
  [AI_ADAPTER_TYPES.OPENAI]: ['enhance', 'planner', 'assistant'],
  [AI_ADAPTER_TYPES.GEMINI]: ['enhance', 'planner', 'assistant'],
  [AI_ADAPTER_TYPES.DEEPSEEK]: ['planner', 'assistant'],
  [AI_ADAPTER_TYPES.VOLCENGINE]: ['enhance'],
  [AI_ADAPTER_TYPES.HUGGINGFACE]: [],
  [AI_ADAPTER_TYPES.FAL]: [],
  [AI_ADAPTER_TYPES.RUNWAY]: [],
  [AI_ADAPTER_TYPES.REPLICATE]: [],
  [AI_ADAPTER_TYPES.NOVELAI]: [],
  [AI_ADAPTER_TYPES.FISH_AUDIO]: [],
  [AI_ADAPTER_TYPES.HYPER3D_RODIN]: [],
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
