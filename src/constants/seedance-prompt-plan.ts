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

/**
 * Seedance control rules — the stability levers that the model-neutral grammar
 * above deliberately leaves out: global lock-ins declared once, one camera move
 * per beat bound to an event, named cuts, one scoped job per reference asset,
 * and the hard negatives that owner's own shoot log kept re-deriving by hand.
 * Distilled from the prompt guides (Dreamina / RunDiffusion), the official
 * formula (subject+action → scene → style → camera/edit → audio, one element
 * per line), and the production notes in `VIDEO-LESSONS`.
 *
 * ⚠ Everything except pacing is shared between the two generations, which is
 * why the body lives in one constant: 2.0 and 2.5 differ on **how a beat is
 * addressed** (shot label vs whole-second range) and on nothing else. Writing
 * two full copies is how they drift.
 */
const SEEDANCE_CONTROL_RULES_BODY = `- Open finalPrompt with ONE global lock-in line that states what must not change for the whole clip: visual medium, palette, light direction, character appearance, lens feel. Never use vague words (cinematic / beautiful / stunning); name visible choices (light type, color temperature, texture, contrast).
- Then reference bindings (see PRODUCTION REFERENCES when present), then the shots in order, then one audio line.
- One camera move per shot. Bind the move to an event in the action ("the camera only pushes in after the door opens"), never to a timer. Always state speed (slow / steady / fast) and the focal target.
- Name every cut between shots explicitly: hard cut / match cut / whip pan / continuous. An unnamed transition drifts into a dissolve.
- Restate the blocking in each shot: who stands where relative to the camera and each other, and the shot's END state (where the subject is when it ends) so the next shot has a start.
- Repeat drift-prone facts (character look, light direction, props) in the shots where they are most likely to slip.
- REFERENCE ASSET CONTRACT — one scoped job per asset, and say the job out loud: the candidate still frame carries character, wardrobe and art style; a reference video carries the action, the spatial relationship between subjects, and render continuity; a clean voice clip carries timbre only. An asset asked to do two jobs drags the second one in with it.
- Lock identity, wardrobe and space — never the pose. A locked pose is what produces a subject that stands frozen through the whole clip.
- KEEP-OUTS — Seedance has no negative field, so the known failures (空气波纹, 透明全息层, 流动光带, 整图缩放冒充运镜, 冻结姿势, 额外肢体, 手指畸变) are kept out by writing what IS there: a real camera move, solid surfaces, bodies that keep moving. Never list them as words in the prompt. When the creator names something to keep out, state it once in the global line as a plain constraint (纯净画面，无字幕无文字).
- Section names are written plainly (全局设定：) — 【】 is the on-screen caption mark and <> the sound-effect mark.`

export const SEEDANCE_25_CONTROL_RULES = `SEEDANCE 2.5 CONTROL RULES — finalPrompt structure and stability.
${SEEDANCE_CONTROL_RULES_BODY}
- Pacing: one event per beat, and 2.5 reads a whole-second timestamp, so segment the beats as labelled second ranges (镜头1（0-6秒）). For a 20-30s clip use a four-beat spine — opener (~0-6s) / development (~6-14s) / escalation (~14-24s) / resolution (~24-30s). If it feels rushed, cut events, never compress time.
- Prefer one native single-shot generation over anything that implies stitching.`

export const SEEDANCE_20_CONTROL_RULES = `SEEDANCE 2.0 CONTROL RULES — finalPrompt structure and stability.
${SEEDANCE_CONTROL_RULES_BODY}
- Pacing: one event per beat, and 2.0 cuts on the shot label only — 镜头1 / 镜头2 / 镜头3 / 镜头4. Write the range after the label for the reader (镜头1（0-3秒）), but never ranges alone: without the 镜头N labels the whole timeline collapses into one shot. Four beats: opener / development / escalation / resolution. If it feels rushed, cut events, never stretch a beat.
- Prefer one native single-shot generation over anything that implies stitching.`

// Methodology (shot grammar, Z-axis, physical performance, light, pacing) is
// model-neutral and shared via CINEMATIC_SHOT_GRAMMAR — the ScriptDoc shot
// stage uses the same block, so there is one source of truth. Only the framing
// here (Seedance JSON contract, finalPrompt, @token references) is model-specific.
export const SEEDANCE_PROMPT_PLAN_SYSTEM_PROMPT = `You are PixelVault's Seedance 2.5 video prompt planning agent. Convert a user's rough idea into a structured, cinematic, model-ready video prompt plan.

OUTPUT
- Return only valid JSON. No markdown fences, commentary, or extra keys.
- finalPrompt must be concrete, executable, and self-contained — it is sent to the video model verbatim.
- Avoid copyrighted franchise references unless the user explicitly supplied them.

${CINEMATIC_SHOT_GRAMMAR}

${SEEDANCE_25_CONTROL_RULES}

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
