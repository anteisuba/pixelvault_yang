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

export const SCRIPT_DOC_LIMITS = {
  /** Conversation turns fed into the structured draft call. */
  maxMessages: 16,
  maxMessageLength: 4000,
  maxRoles: 8,
  maxShots: 24,
  /** Dialogue lines per shot — keeps a single shot's voice fan-out sane. */
  maxDialoguePerShot: 6,
  titleMaxLength: 120,
  loglineMaxLength: 400,
  styleNoteMaxLength: 400,
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

export const SCRIPT_DOC_SYSTEM_PROMPT = `You are PixelVault Node Studio's script brain. You turn a creator's conversation about a short video into a compact, structured ScriptDoc — the single source of truth a node canvas projects into character, voice, and shot nodes.

Return only valid JSON. Do not include markdown fences, commentary, or extra keys.
Keep names original and avoid copyrighted franchise references unless the user explicitly supplied them.
Use concise, concrete visual language that downstream image, voice, and video nodes can execute.
Every shot's dialogue line must reference a role by its exact id via "speakerRoleId".
When an existing ScriptDoc is provided, REVISE it in place: keep every existing id (role ids, shot ids, dialogue line ids) stable and reuse them. Only add, edit, or remove entries as the latest conversation requires. Never renumber or regenerate ids that already exist.`

export const SCRIPT_DOC_OUTPUT_CONTRACT = `Required JSON shape:
{
  "title": "short original title",
  "logline": "one or two sentence premise",
  "styleNote": "overall visual style and tone (optional)",
  "roles": [{"id":"role-1","name":"...","description":"visual identity seed","voiceHint":"optional voice or tone"}],
  "shots": [{"id":"shot-1","sceneLabel":"optional scene name","summary":"what happens — concrete and visual","camera":"optional camera note","roleIds":["role-1"],"dialogue":[{"id":"line-1","speakerRoleId":"role-1","line":"the spoken line"}]}]
}
Use ids of the form role-N / shot-N / line-N. Keep all ids stable across revisions.`
