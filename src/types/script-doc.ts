import { z } from 'zod'

import { SCRIPT_DOC_LIMITS, SCRIPT_DOC_REF_KINDS } from '@/constants/script-doc'
import { NODE_STUDIO_ASSISTANT_MESSAGE_ROLES } from '@/constants/node-studio'
import { LOCALES } from '@/i18n/routing'

const ScriptDocIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(SCRIPT_DOC_LIMITS.idMaxLength)

/**
 * Tag carried on a spawned node (`node.data.scriptRef`) so re-projecting a
 * ScriptDoc updates existing nodes in place instead of duplicating them.
 * Match key = `${kind}:${sourceId}`.
 */
export const ScriptRefSchema = z.object({
  kind: z.enum(SCRIPT_DOC_REF_KINDS),
  sourceId: z.string().trim().min(1).max(160),
})

export const ScriptDocRoleSchema = z.object({
  id: ScriptDocIdSchema,
  name: z.string().trim().min(1).max(SCRIPT_DOC_LIMITS.fieldMaxLength),
  /** Visual identity seed — becomes the character node's prompt. */
  description: z
    .string()
    .trim()
    .max(SCRIPT_DOC_LIMITS.fieldMaxLength)
    .default(''),
  voiceHint: z.string().trim().max(SCRIPT_DOC_LIMITS.fieldMaxLength).optional(),
})

export const ScriptDocDialogueLineSchema = z.object({
  id: ScriptDocIdSchema,
  speakerRoleId: ScriptDocIdSchema,
  line: z.string().trim().min(1).max(SCRIPT_DOC_LIMITS.lineMaxLength),
})

export const ScriptDocShotSchema = z.object({
  id: ScriptDocIdSchema,
  sceneLabel: z
    .string()
    .trim()
    .max(SCRIPT_DOC_LIMITS.fieldMaxLength)
    .optional(),
  summary: z.string().trim().min(1).max(SCRIPT_DOC_LIMITS.fieldMaxLength),
  camera: z.string().trim().max(SCRIPT_DOC_LIMITS.fieldMaxLength).optional(),
  /** Role bindings (character node → seedance edges). */
  roleIds: z
    .array(ScriptDocIdSchema)
    .max(SCRIPT_DOC_LIMITS.maxRoles)
    .default([]),
  /** Dialogue nested under the shot → unambiguous voice → seedance wiring. */
  dialogue: z
    .array(ScriptDocDialogueLineSchema)
    .max(SCRIPT_DOC_LIMITS.maxDialoguePerShot)
    .default([]),
})

/**
 * The ScriptDoc fact model. Kept permissive (defaults on arrays, generous
 * lengths) because it persists inside `NodeWorkflowStateDataSchema`; a strict
 * schema that rejected a real persisted doc would wipe the whole project on
 * the server read path (see `node-workflow.service.ts` validateState).
 */
export const ScriptDocSchema = z.object({
  title: z.string().trim().min(1).max(SCRIPT_DOC_LIMITS.titleMaxLength),
  logline: z
    .string()
    .trim()
    .max(SCRIPT_DOC_LIMITS.loglineMaxLength)
    .default(''),
  styleNote: z
    .string()
    .trim()
    .max(SCRIPT_DOC_LIMITS.styleNoteMaxLength)
    .optional(),
  roles: z
    .array(ScriptDocRoleSchema)
    .max(SCRIPT_DOC_LIMITS.maxRoles)
    .default([]),
  shots: z
    .array(ScriptDocShotSchema)
    .max(SCRIPT_DOC_LIMITS.maxShots)
    .default([]),
})

// ─── Structured draft API contract ───────────────────────────────────────

// Local message schema (role + content) so this module depends only on
// constants + i18n — importing `@/types/node-assistant` here would create a
// cycle (node-workflow → script-doc → node-assistant → node-workflow).
const ScriptDocMessageSchema = z.object({
  role: z.enum(NODE_STUDIO_ASSISTANT_MESSAGE_ROLES),
  content: z.string().trim().min(1).max(SCRIPT_DOC_LIMITS.maxMessageLength),
})

export const NodeScriptDocRequestSchema = z.object({
  messages: z
    .array(ScriptDocMessageSchema)
    .min(1)
    .max(SCRIPT_DOC_LIMITS.maxMessages),
  /** Current doc, passed on "update outline" so the LLM preserves ids. */
  scriptDoc: ScriptDocSchema.optional(),
  locale: z.enum(LOCALES),
  apiKeyId: z.string().trim().min(1).max(160).optional(),
})

// ─── Clarifying questions (反问澄清卡) ────────────────────────────────────
// The drafting step may return structured questions instead of an outline when
// it needs creative direction. Chips backfill the next draft; never hue-coded.

export const ScriptDocClarifyingOptionSchema = z.object({
  id: ScriptDocIdSchema,
  label: z.string().trim().min(1).max(SCRIPT_DOC_LIMITS.fieldMaxLength),
})

export const ScriptDocClarifyingQuestionSchema = z.object({
  id: ScriptDocIdSchema,
  question: z.string().trim().min(1).max(SCRIPT_DOC_LIMITS.fieldMaxLength),
  options: z
    .array(ScriptDocClarifyingOptionSchema)
    .min(1)
    .max(SCRIPT_DOC_LIMITS.maxClarifyOptions),
  multiSelect: z.boolean().default(false),
  allowCustom: z.boolean().default(true),
  allowSkip: z.boolean().default(true),
})

// Drafting returns EITHER the outline OR clarifying questions (discriminated by
// `kind`). Keeps a single round-trip; the workspace renders the question card
// and folds answers back into the next draft.
export const NodeScriptDocResponseDataSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('scriptDoc'), scriptDoc: ScriptDocSchema }),
  z.object({
    kind: z.literal('questions'),
    questions: z
      .array(ScriptDocClarifyingQuestionSchema)
      .min(1)
      .max(SCRIPT_DOC_LIMITS.maxClarifyQuestions),
  }),
])

export const NodeScriptDocApiSuccessResponseSchema = z.object({
  success: z.literal(true),
  data: NodeScriptDocResponseDataSchema,
})

export type ScriptRef = z.infer<typeof ScriptRefSchema>
export type ScriptDocRole = z.infer<typeof ScriptDocRoleSchema>
export type ScriptDocDialogueLine = z.infer<typeof ScriptDocDialogueLineSchema>
export type ScriptDocShot = z.infer<typeof ScriptDocShotSchema>
export type ScriptDoc = z.infer<typeof ScriptDocSchema>
export type ScriptDocClarifyingOption = z.infer<
  typeof ScriptDocClarifyingOptionSchema
>
export type ScriptDocClarifyingQuestion = z.infer<
  typeof ScriptDocClarifyingQuestionSchema
>
export type NodeScriptDocRequest = z.infer<typeof NodeScriptDocRequestSchema>
export type NodeScriptDocResponseData = z.infer<
  typeof NodeScriptDocResponseDataSchema
>
export type NodeScriptDocApiSuccessResponse = z.infer<
  typeof NodeScriptDocApiSuccessResponseSchema
>
