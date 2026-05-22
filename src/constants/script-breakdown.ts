import { AI_ADAPTER_TYPES } from '@/constants/providers'

export const SCRIPT_PLANNER_PROVIDERS = {
  AUTO: 'auto',
  GEMINI: AI_ADAPTER_TYPES.GEMINI,
  OPENAI: AI_ADAPTER_TYPES.OPENAI,
} as const

export type ScriptPlannerProvider =
  (typeof SCRIPT_PLANNER_PROVIDERS)[keyof typeof SCRIPT_PLANNER_PROVIDERS]

export const SCRIPT_PLANNER_PROVIDER_OPTIONS = [
  SCRIPT_PLANNER_PROVIDERS.AUTO,
  SCRIPT_PLANNER_PROVIDERS.GEMINI,
  SCRIPT_PLANNER_PROVIDERS.OPENAI,
] as const

export const SCRIPT_PLANNER_MODELS = {
  [AI_ADAPTER_TYPES.GEMINI]: 'gemini-3-pro-preview',
  [AI_ADAPTER_TYPES.OPENAI]: 'gpt-5.2',
} as const

export const SCRIPT_BREAKDOWN_LIMITS = {
  IDEA_MAX_LENGTH: 2000,
  MAX_CHARACTERS: 6,
  MAX_SCENES: 5,
  MAX_ACTIONS: 10,
  MAX_BEATS: 12,
  MAX_SHOTS: 24,
  MIN_BEAT_DURATION_SEC: 4,
  MAX_BEAT_DURATION_SEC: 15,
  LLM_MAX_OUTPUT_TOKENS: 8000,
} as const

export function isScriptPlannerProvider(
  value: string,
): value is ScriptPlannerProvider {
  return SCRIPT_PLANNER_PROVIDER_OPTIONS.includes(
    value as ScriptPlannerProvider,
  )
}
