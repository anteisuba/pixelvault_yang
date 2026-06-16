import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { LLM_TEXT_MODEL_IDS } from '@/constants/config'

export const SCRIPT_BREAKDOWN_LIMITS = {
  ideaMaxLength: 2400,
  titleMaxLength: 90,
  loglineMaxLength: 360,
  referenceIntentMaxLength: 260,
  maxCharacters: 8,
  maxScenes: 10,
  maxActions: 24,
  maxBeats: 32,
  maxShots: 48,
  fieldMaxLength: 700,
  llmTimeoutMs: 60_000,
  maxTokens: 6000,
} as const

export const SCRIPT_PLANNER_PROVIDER_IDS = {
  auto: 'auto',
  gemini: 'gemini',
  deepseek: 'deepseek',
  openai: 'openai',
} as const

export const SCRIPT_PLANNER_PROVIDERS = [
  SCRIPT_PLANNER_PROVIDER_IDS.auto,
  SCRIPT_PLANNER_PROVIDER_IDS.gemini,
  SCRIPT_PLANNER_PROVIDER_IDS.deepseek,
  SCRIPT_PLANNER_PROVIDER_IDS.openai,
] as const

export type ScriptPlannerProvider = (typeof SCRIPT_PLANNER_PROVIDERS)[number]
export type ScriptPlannerConcreteProvider = Exclude<
  ScriptPlannerProvider,
  typeof SCRIPT_PLANNER_PROVIDER_IDS.auto
>

export const DEFAULT_SCRIPT_PLANNER_PROVIDER = SCRIPT_PLANNER_PROVIDER_IDS.auto

export const SCRIPT_PLANNER_MODELS = {
  gemini: {
    modelId: LLM_TEXT_MODEL_IDS.GEMINI_3_5_FLASH,
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    label: 'Gemini 3.5 Flash',
  },
  deepseek: {
    modelId: LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO,
    adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
    label: 'DeepSeek V4 Pro',
  },
  openai: {
    modelId: LLM_TEXT_MODEL_IDS.OPENAI_GPT_5_4_MINI,
    adapterType: AI_ADAPTER_TYPES.OPENAI,
    label: 'OpenAI GPT-5.4 Mini',
  },
} as const

export const SCRIPT_PLANNER_MODEL_OPTIONS = [
  {
    provider: SCRIPT_PLANNER_PROVIDER_IDS.gemini,
    ...SCRIPT_PLANNER_MODELS.gemini,
  },
  {
    provider: SCRIPT_PLANNER_PROVIDER_IDS.deepseek,
    ...SCRIPT_PLANNER_MODELS.deepseek,
  },
  {
    provider: SCRIPT_PLANNER_PROVIDER_IDS.openai,
    ...SCRIPT_PLANNER_MODELS.openai,
  },
] as const

export const SCRIPT_BREAKDOWN_COPY_RISKS = ['low', 'medium', 'high'] as const

export const SCRIPT_BREAKDOWN_SUMMARY_FIELDS = [
  'characters',
  'scenes',
  'actions',
  'beats',
  'shots',
] as const

export type ScriptBreakdownSummaryField =
  (typeof SCRIPT_BREAKDOWN_SUMMARY_FIELDS)[number]

export const SCRIPT_BREAKDOWN_ERROR_CODES = {
  missingApiKey: 'MISSING_API_KEY',
  invalidPlannerOutput: 'SCRIPT_BREAKDOWN_INVALID_OUTPUT',
} as const

export const SCRIPT_BREAKDOWN_HTTP_STATUS = {
  invalidPlannerOutput: 502,
  rateLimited: 429,
  temporarilyUnavailable: 503,
} as const

export const SCRIPT_BREAKDOWN_QUICK_SETUP_OPTION_PREFIX = 'node-studio-planner'

export const SCRIPT_BREAKDOWN_SYSTEM_PROMPT = `You are PixelVault's Node Studio planning agent. Convert a user's story or visual idea into a compact production breakdown for AI media generation.

Return only valid JSON. Do not include markdown fences, commentary, or extra keys.
Keep names original and avoid copyrighted franchise references unless the user explicitly supplied them.
Use concise, concrete visual language that downstream image, voice, and video nodes can execute.`

export const SCRIPT_BREAKDOWN_OUTPUT_CONTRACT = `Required JSON shape:
{
  "title": "short original title",
  "logline": "one or two sentence story premise",
  "referenceIntent": "visual and tonal intent without copyrighted mimicry",
  "copyRisk": "low" | "medium" | "high",
  "characters": [{"id":"char-1","label":"Lead","nameSuggestion":"...","role":"...","functionInStory":"...","personality":"...","visualSeed":"...","goal":"..."}],
  "scenes": [{"id":"scene-1","label":"...","summary":"...","location":"...","timeOfDay":"...","mood":"..."}],
  "actions": [{"id":"action-1","sceneId":"scene-1","label":"...","description":"..."}],
  "beats": [{"id":"beat-1","sceneId":"scene-1","label":"...","emotionalTurn":"...","description":"..."}],
  "shots": [{"id":"shot-1","sceneId":"scene-1","beatId":"beat-1","label":"...","camera":"...","composition":"...","promptSeed":"..."}]
}`
