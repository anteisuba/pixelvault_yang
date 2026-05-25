import type { AppLocale } from '@/i18n/routing'

export const SEEDANCE_PROMPT_PLAN_LIMITS = {
  ideaMaxLength: 4000,
  titleMaxLength: 90,
  visualDescriptionMaxLength: 1200,
  timelineActionMaxLength: 700,
  timelineCameraMaxLength: 500,
  timelineCompositionMaxLength: 500,
  maxTimelineItems: 8,
  motionMaxLength: 900,
  cameraMaxLength: 700,
  durationMaxLength: 80,
  audioIntentMaxLength: 900,
  finalPromptMaxLength: 4000,
  llmTimeoutMs: 60_000,
  maxTokens: 3500,
} as const

export const SEEDANCE_PROMPT_PLAN_ERROR_CODES = {
  invalidPlannerOutput: 'SEEDANCE_PROMPT_PLAN_INVALID_OUTPUT',
} as const

export const SEEDANCE_PROMPT_PLAN_HTTP_STATUS = {
  invalidPlannerOutput: 502,
  rateLimited: 429,
  temporarilyUnavailable: 503,
} as const

export const SEEDANCE_PROMPT_PLAN_OUTPUT_LANGUAGES: Record<AppLocale, string> =
  {
    en: 'English',
    ja: 'Japanese',
    zh: 'Simplified Chinese',
  } as const

export const SEEDANCE_PROMPT_PLAN_SYSTEM_PROMPT = `You are PixelVault's Seedance video prompt planning agent. Convert a user's rough video idea into a structured Seedance 2.0-ready video prompt plan.

Return only valid JSON. Do not include markdown fences, commentary, or extra keys.
Keep the final prompt model-ready, concrete, cinematic, and executable.
Avoid copyrighted franchise references unless the user explicitly supplied them.
Prefer clear timing, camera movement, subject action, scene continuity, and audio direction.`

export const SEEDANCE_PROMPT_PLAN_OUTPUT_CONTRACT = `Required JSON shape:
{
  "title": "short original title",
  "visualDescription": "one compact paragraph describing subject, setting, mood, lighting, and style",
  "timeline": [{"startSecond":0,"endSecond":4,"action":"what happens in this segment","camera":"camera movement and framing","composition":"optional composition note"}],
  "motion": "concise motion direction for the video model",
  "camera": "overall camera language",
  "duration": "target duration such as 8s or 12s",
  "audioIntent": "ambient sound, dialogue, music, or no-audio direction",
  "finalPrompt": "single ready-to-use Seedance prompt with timeline, camera, style, and audio direction",
  "copyRisk": "low" | "medium" | "high"
}`
