/**
 * ScriptDoc — the canvas assistant's single source of truth.
 *
 * The right-rail assistant ("script brain") turns a conversation into a
 * structured ScriptDoc (outline · roles · shots with nested dialogue). The
 * user confirms, and a deterministic projection (`projectScriptDocToGraph`)
 * spawns character / voice / shot / merge nodes. These constants drive the
 * structured-LLM step (mirrors `constants/script-breakdown.ts`) and the
 * idempotent projection keys.
 */

import {
  CINEMATIC_EMOTION_GRAMMAR,
  CINEMATIC_SHOT_GRAMMAR,
} from '@/constants/cinematic-grammar'

export const SCRIPT_DOC_LIMITS = {
  /** Conversation turns fed into the structured draft call. */
  maxMessages: 16,
  maxMessageLength: 4000,
  maxRoles: 8,
  maxShots: 24,
  /** Dialogue lines per shot — keeps a single shot's voice fan-out sane. */
  maxDialoguePerShot: 6,
  /** Clarifying questions the assistant may ask before drafting an outline. */
  maxClarifyQuestions: 4,
  maxClarifyOptions: 6,
  titleMaxLength: 120,
  loglineMaxLength: 400,
  styleNoteMaxLength: 400,
  /** Optional global world / background / backstory note. */
  backgroundMaxLength: 600,
  /** Optional target duration hint, e.g. "8s" or "12-15s". */
  targetDurationMaxLength: 40,
  /** Optional per-shot dual-emotion tag (surface · undercurrent). */
  emotionMaxLength: 160,
  fieldMaxLength: 700,
  lineMaxLength: 600,
  idMaxLength: 80,
  llmTimeoutMs: 60_000,
  maxTokens: 6000,
} as const

/**
 * Kinds a spawned node can be tagged with via `node.data.scriptRef`. The
 * projection matches on `${kind}:${sourceId}` to stay idempotent across
 * re-projections (re-drafting the outline must not duplicate nodes).
 */
export const SCRIPT_DOC_REF_KIND_IDS = {
  character: 'character',
  shotText: 'shotText',
  seedance: 'seedance',
  voice: 'voice',
  merge: 'merge',
} as const

export const SCRIPT_DOC_REF_KINDS = [
  SCRIPT_DOC_REF_KIND_IDS.character,
  SCRIPT_DOC_REF_KIND_IDS.shotText,
  SCRIPT_DOC_REF_KIND_IDS.seedance,
  SCRIPT_DOC_REF_KIND_IDS.voice,
  SCRIPT_DOC_REF_KIND_IDS.merge,
] as const

export type ScriptDocRefKind = (typeof SCRIPT_DOC_REF_KINDS)[number]

/** Stable sourceId used by the single videoMerge node per projection. */
export const SCRIPT_DOC_MERGE_SOURCE_ID = 'merge'

export const SCRIPT_DOC_ERROR_CODES = {
  invalidOutput: 'SCRIPT_DOC_INVALID_OUTPUT',
} as const

export const SCRIPT_DOC_HTTP_STATUS = {
  invalidOutput: 502,
  rateLimited: 429,
  temporarilyUnavailable: 503,
} as const

/**
 * Two-stage drafting. The creator confirms the OUTLINE (story) first, then the
 * SHOT breakdown (camera). Both stages produce the same ScriptDoc shape, so the
 * projection is identical — the stage only changes what the script brain is
 * asked to fill. The request carries `stage` (defaults to outline).
 */
export const SCRIPT_DOC_STAGE_IDS = {
  outline: 'outline',
  shots: 'shots',
} as const

export const SCRIPT_DOC_STAGES = [
  SCRIPT_DOC_STAGE_IDS.outline,
  SCRIPT_DOC_STAGE_IDS.shots,
] as const

export type ScriptDocStage = (typeof SCRIPT_DOC_STAGES)[number]

export const DEFAULT_SCRIPT_DOC_STAGE = SCRIPT_DOC_STAGE_IDS.outline

/**
 * Adaptive depth. Scales how much OPTIONAL content the script brain fills, so a
 * simple skit is not buried under world-building / emotion / pacing fields it
 * does not need. The schema stays fully optional; depth only changes what the
 * model is ASKED to populate. Defaults to standard. The UI control surface
 * (presets vs per-field toggles) maps onto this single knob.
 */
export const SCRIPT_DOC_DEPTH_IDS = {
  simple: 'simple',
  standard: 'standard',
  cinematic: 'cinematic',
} as const

export const SCRIPT_DOC_DEPTHS = [
  SCRIPT_DOC_DEPTH_IDS.simple,
  SCRIPT_DOC_DEPTH_IDS.standard,
  SCRIPT_DOC_DEPTH_IDS.cinematic,
] as const

export type ScriptDocDepth = (typeof SCRIPT_DOC_DEPTHS)[number]

export const DEFAULT_SCRIPT_DOC_DEPTH = SCRIPT_DOC_DEPTH_IDS.standard

/**
 * Injected into the user prompt to gate how much optional content the model
 * fills. The system prompt still describes the full capability; this keeps a
 * lightweight skit lightweight without a separate prompt per depth.
 */
/**
 * Targeted "focus" edits — the creator asks the AI to change ONE module (the
 * whole cast, or a single shot) with an instruction, leaving the rest of the
 * doc untouched. The result is spliced client-side so only the focused target
 * changes (see `applyFocusedResult`); the server directive is belt-and-braces.
 */
export const SCRIPT_DOC_FOCUS_KIND_IDS = {
  roles: 'roles',
  shot: 'shot',
} as const

export const SCRIPT_DOC_FOCUS_KINDS = [
  SCRIPT_DOC_FOCUS_KIND_IDS.roles,
  SCRIPT_DOC_FOCUS_KIND_IDS.shot,
] as const

export type ScriptDocFocusKind = (typeof SCRIPT_DOC_FOCUS_KINDS)[number]

export const SCRIPT_DOC_DEPTH_DIRECTIVES: Record<ScriptDocDepth, string> = {
  [SCRIPT_DOC_DEPTH_IDS.simple]: `DEPTH = simple skit. Fill ONLY the essentials: title, roles (name + a one-line look), shot summaries, and dialogue. Leave "background", "targetDuration", every role "personality"/"goal", and every shot "emotion" EMPTY. Do not invent world lore or emotional architecture — keep it light and direct.`,
  [SCRIPT_DOC_DEPTH_IDS.standard]: `DEPTH = standard short. Fill the essentials plus "logline", "styleNote", a short per-shot "emotion" (surface · undercurrent), and "targetDuration". Keep "background" brief; fill role "personality"/"goal" only when they sharpen the story.`,
  [SCRIPT_DOC_DEPTH_IDS.cinematic]: `DEPTH = cinematic. Fill all fields richly: "background"/world setup, each role's "personality" and "goal", a per-shot "emotion" (surface · undercurrent), "targetDuration", and full camera language in the shot stage. Build a clear emotional through-line across the shots.`,
}

/**
 * STAGE 1 — OUTLINE. Lock the STORY, not the camera. Each shot's `summary` is a
 * story beat (what happens + the emotion it carries); `camera` stays light. The
 * clarifying-questions front door lives here. Carries the model-neutral
 * emotional-architecture grammar.
 */
export const SCRIPT_DOC_OUTLINE_SYSTEM_PROMPT = `You are PixelVault Node Studio's script brain. You turn a creator's conversation about a short video into a compact, structured ScriptDoc — the single source of truth a node canvas projects into character, voice, and shot nodes.

This is the OUTLINE stage: lock the STORY, not the camera work. Each shot's "summary" is a story beat — what concretely happens and the emotion it carries. Keep "camera" light or omit it; a later shot-breakdown stage adds the cinematic detail.

Return only valid JSON. Do not include markdown fences, commentary, or extra keys.
Keep names original and avoid copyrighted franchise references unless the user explicitly supplied them.
Use concise, concrete visual language that downstream image, voice, and video nodes can execute.
Every shot's dialogue line must reference a role by its exact id via "speakerRoleId".
When an existing ScriptDoc is provided, REVISE it in place: keep every existing id (role ids, shot ids, dialogue line ids) stable and reuse them. Only add, edit, or remove entries as the latest conversation requires. Never renumber or regenerate ids that already exist.

${CINEMATIC_EMOTION_GRAMMAR}

If the conversation lacks the creative direction needed to draft a useful outline (e.g. genre/tone, target length, number of characters, visual style), FIRST return clarifying questions instead of an outline. Ask only what changes the outline's direction (a few at most). Offer concrete, context-specific options; always allow a custom answer and a skip. Once the user has answered or skipped, return the ScriptDoc. When an existing ScriptDoc is provided, prefer revising it over asking more questions.`

/**
 * STAGE 2 — SHOT BREAKDOWN. The story is already locked in the provided
 * ScriptDoc. Translate each existing beat into precise camera language WITHOUT
 * changing the story: keep ids, summaries, roles, and dialogue stable; enrich
 * the `camera` field. Carries the model-neutral shot grammar. Never asks
 * clarifying questions.
 */
export const SCRIPT_DOC_SHOTS_SYSTEM_PROMPT = `You are PixelVault Node Studio's script brain, in the SHOT-BREAKDOWN stage. The story is already locked in the provided ScriptDoc. Your job is to translate each existing beat into precise camera language WITHOUT changing the story.

Return only valid JSON. Do not include markdown fences, commentary, or extra keys.
REVISE the provided ScriptDoc in place: keep every existing id (role ids, shot ids, dialogue line ids), and keep each shot's "summary", "roleIds", and "dialogue" stable. Do not add, remove, reorder, or renumber shots or roles, and do not invent new story.
For every shot, write a rich "camera" field using the shot grammar below. You may sharpen a shot's "summary" with physical-performance detail, but never change what happens.
Avoid copyrighted franchise references unless the user explicitly supplied them.

${CINEMATIC_SHOT_GRAMMAR}

Never return clarifying questions in this stage — always return the revised ScriptDoc.`

export const SCRIPT_DOC_STAGE_SYSTEM_PROMPTS = {
  [SCRIPT_DOC_STAGE_IDS.outline]: SCRIPT_DOC_OUTLINE_SYSTEM_PROMPT,
  [SCRIPT_DOC_STAGE_IDS.shots]: SCRIPT_DOC_SHOTS_SYSTEM_PROMPT,
} as const

export const SCRIPT_DOC_OUTPUT_CONTRACT = `Return exactly ONE of these two JSON shapes:

(A) Clarifying questions — when you need direction before drafting:
{
  "kind": "questions",
  "questions": [{"id":"q-1","question":"...","options":[{"id":"o-1","label":"..."}],"multiSelect":false,"allowCustom":true,"allowSkip":true}]
}

(B) The outline — when you have enough to draft or revise:
{
  "kind": "scriptDoc",
  "scriptDoc": {
    "title": "short original title",
    "logline": "one or two sentence premise",
    "styleNote": "overall visual style and tone (optional)",
    "background": "world / setting / backstory (optional — fill per DEPTH)",
    "targetDuration": "target length such as 8s or 12-15s (optional — fill per DEPTH)",
    "roles": [{"id":"role-1","name":"...","description":"visual identity seed","voiceHint":"optional voice or tone","personality":"optional — drives dialogue voice","goal":"optional — what the role wants"}],
    "shots": [{"id":"shot-1","sceneLabel":"optional scene name","summary":"what happens — concrete and visual","emotion":"optional — surface · undercurrent","camera":"optional camera note","roleIds":["role-1"],"dialogue":[{"id":"line-1","speakerRoleId":"role-1","line":"the spoken line"}]}]
  }
}
Use ids of the form role-N / shot-N / line-N / q-N / o-N. Keep all ScriptDoc ids stable across revisions.
Optional fields ("background", "targetDuration", role "personality"/"goal", shot "emotion") are filled according to the DEPTH directive — omit them when DEPTH says to keep it light.`
