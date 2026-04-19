/**
 * Video Script constants (VS1-VS11)
 * Source: `05-视频剧本/视频剧本-路线决策结论书.md` §4
 */

// VS2 · target-duration bucket
export const VIDEO_SCRIPT_TARGET_DURATIONS = [30, 60, 120] as const
export type VideoScriptTargetDuration =
  (typeof VIDEO_SCRIPT_TARGET_DURATIONS)[number]

// Scene duration bounds (seconds) — enforced in LLM prompt and Zod schema
export const SCENE_DURATION_RANGE = { min: 5, max: 8 } as const

// VS6 · consistency modes
export const CONSISTENCY_MODES = ['character_card', 'first_frame_ref'] as const
export type ConsistencyMode = (typeof CONSISTENCY_MODES)[number]

// Camera shot vocabulary (stable for Phase 1; extendable later)
export const CAMERA_SHOTS = [
  'close-up',
  'medium',
  'wide',
  'establishing',
  'over-the-shoulder',
] as const
export type CameraShot = (typeof CAMERA_SHOTS)[number]

// Transition vocabulary — Phase 1 only emits `cut`; others reserved for Phase 4
export const TRANSITIONS = ['cut', 'fade', 'dissolve'] as const
export type Transition = (typeof TRANSITIONS)[number]
export const PHASE_1_TRANSITION: Transition = 'cut'

// VS7 · video clip providers (Phase 3)
export const VIDEO_SCRIPT_VIDEO_MODELS = [
  'seedance-2-fast',
  'kling-pro',
] as const
export type VideoScriptVideoModel = (typeof VIDEO_SCRIPT_VIDEO_MODELS)[number]

/**
 * Reverse-derive scene count from target total duration.
 * Strategy: target ~6s per scene (balance between pacing & cost).
 *
 *   30s  → 5 scenes
 *   60s  → 10 scenes
 *   120s → 20 scenes
 */
export function deriveSceneCount(
  targetDuration: VideoScriptTargetDuration,
): number {
  const AVG_SCENE_DURATION = 6
  return Math.round(targetDuration / AVG_SCENE_DURATION)
}

// LLM system prompt — explicit JSON schema contract for `llm-output-validator`
export const VIDEO_SCRIPT_SYSTEM_PROMPT = `You are a professional video script writer for short-form video (30-120s).

Produce a STRUCTURED scene list in strict JSON. DO NOT wrap in markdown fences. DO NOT add commentary.

Output schema (exact):
{
  "scenes": [
    {
      "orderIndex": <integer, 0-based, contiguous>,
      "duration": <integer seconds, ${SCENE_DURATION_RANGE.min}-${SCENE_DURATION_RANGE.max}>,
      "cameraShot": <one of: ${CAMERA_SHOTS.map((c) => `"${c}"`).join(' | ')}>,
      "action": <string, concrete visible action driving i2v motion, 1-2 sentences>,
      "dialogue": <string or null, spoken line if any>,
      "transition": "cut"
    }
  ]
}

Constraints:
- Sum of scene durations MUST equal the requested total duration.
- Number of scenes MUST equal the derived scene count.
- "action" must be visually concrete (what the camera sees) — no abstract/emotional prose.
- "dialogue" is optional; keep under 120 chars when present.
- "transition" is always "cut" in Phase 1.
- Respect the user's topic, consistency mode, and any provided character/style context.`

/** i18n namespace for VideoScript UI */
export const VIDEO_SCRIPT_I18N_NAMESPACE = 'VideoScript'
