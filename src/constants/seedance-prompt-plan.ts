import { CINEMATIC_SHOT_GRAMMAR } from '@/constants/cinematic-grammar'
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

// Methodology (shot grammar, Z-axis, physical performance, light, pacing) is
// model-neutral and shared via CINEMATIC_SHOT_GRAMMAR — the ScriptDoc shot
// stage uses the same block, so there is one source of truth. Only the framing
// here (Seedance JSON contract, finalPrompt, @token references) is model-specific.
export const SEEDANCE_PROMPT_PLAN_SYSTEM_PROMPT = `You are PixelVault's Seedance 2.0 video prompt planning agent. Convert a user's rough idea into a structured, cinematic, model-ready video prompt plan.

OUTPUT
- Return only valid JSON. No markdown fences, commentary, or extra keys.
- finalPrompt must be concrete, executable, and self-contained — it is sent to the video model verbatim.
- Avoid copyrighted franchise references unless the user explicitly supplied them.

${CINEMATIC_SHOT_GRAMMAR}

TIMELINE
- Segment by precise seconds. Each item's "camera" carries shot size + angle + movement; "action" carries concrete subject action with the physical-performance detail above.
- One primary subject per segment; with multiple subjects, set a clear focal priority and action order.`

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
