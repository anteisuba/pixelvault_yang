import { z } from 'zod'

import {
  SCRIPT_DOC_DEPTHS,
  SCRIPT_DOC_FOCUS_KINDS,
  SCRIPT_DOC_LIMITS,
  SCRIPT_DOC_REF_KINDS,
  SCRIPT_DOC_STAGES,
} from '@/constants/script-doc'
import { NODE_STUDIO_ASSISTANT_MESSAGE_ROLES } from '@/constants/node-studio'
import { AssistantClarifyingQuestionSchema } from '@/types/assistant-protocol'
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
  /** Optional — sharpens dialogue voice (filled per depth). */
  personality: z
    .string()
    .trim()
    .max(SCRIPT_DOC_LIMITS.fieldMaxLength)
    .optional(),
  /** Optional — what the role wants, drives motivation (filled per depth). */
  goal: z.string().trim().max(SCRIPT_DOC_LIMITS.fieldMaxLength).optional(),
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
  /** Optional dual-emotion tag (surface · undercurrent), filled per depth. */
  emotion: z.string().trim().max(SCRIPT_DOC_LIMITS.emotionMaxLength).optional(),
  camera: z.string().trim().max(SCRIPT_DOC_LIMITS.fieldMaxLength).optional(),
  /**
   * 构图。2026-08-02 补 —— 在此之前它**只存在于 shotText 节点上**，而节点是
   * 投影的产物、没有任何人类可达的写入端，却照样参与最终 prompt 拼接
   * （`node-workflow-prompt.ts`）。owner 拍板「助手自动生成与用户手动输入是
   * 同一种东西」后，四个字段统一以 ScriptDoc 为事实源，它必须在这里有位置。
   * ⚠ 必须 `.optional()`：本 schema 嵌在 `NodeWorkflowStateDataSchema` 里，
   * 收紧会让存量项目在服务端读路径整体 parse 失败。
   */
  composition: z
    .string()
    .trim()
    .max(SCRIPT_DOC_LIMITS.fieldMaxLength)
    .optional(),
  /**
   * 每镜显式时长（秒）。画布对齐三梁之一 —— 与 seedance 节点的 `duration`
   * 字段双向同步（投影写入 `node-workflow-script-doc.ts`，节点编辑回写走
   * `syncSeedanceDurationPatchToScriptDoc`）。上限取自 Seedance 2.5 硬顶
   * （`SCRIPT_DOC_LIMITS.maxShotDurationSeconds`）；数值型先例见
   * `script-breakdown.ts` 的 `startSecond/endSecond`。
   * ⚠ 必须 `.optional()`：理由同上面的 `composition` —— 收紧会让存量项目在
   * 服务端读路径整体 parse 失败（见 `node-workflow.service.ts` validateState）。
   */
  durationSeconds: z
    .number()
    .min(0)
    .max(SCRIPT_DOC_LIMITS.maxShotDurationSeconds)
    .optional(),
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
  /** Optional world / setting / backstory (filled per depth). */
  background: z
    .string()
    .trim()
    .max(SCRIPT_DOC_LIMITS.backgroundMaxLength)
    .optional(),
  /** Optional target duration hint, e.g. "8s" / "12-15s" (filled per depth). */
  targetDuration: z
    .string()
    .trim()
    .max(SCRIPT_DOC_LIMITS.targetDurationMaxLength)
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

/** A targeted-edit scope: the whole cast (`roles`) or a single shot (`shot` + id). */
export const ScriptDocFocusSchema = z.object({
  kind: z.enum(SCRIPT_DOC_FOCUS_KINDS),
  id: z.string().trim().min(1).max(SCRIPT_DOC_LIMITS.idMaxLength).optional(),
})

export const NodeScriptDocRequestSchema = z.object({
  messages: z
    .array(ScriptDocMessageSchema)
    .min(1)
    .max(SCRIPT_DOC_LIMITS.maxMessages),
  /** Current doc, passed on "update outline" so the LLM preserves ids. */
  scriptDoc: ScriptDocSchema.optional(),
  /**
   * Drafting stage. `outline` locks the story (default, back-compat); `shots`
   * enriches the confirmed doc with camera language. Optional so existing
   * callers keep working without passing it.
   */
  stage: z.enum(SCRIPT_DOC_STAGES).optional(),
  /**
   * Adaptive depth — how much optional content the script brain fills. Optional
   * so existing callers default to standard server-side.
   */
  depth: z.enum(SCRIPT_DOC_DEPTHS).optional(),
  /**
   * Targeted edit — restrict the change to one module (the cast, or a single
   * shot by id). The instruction rides as the latest user message. Omitted for
   * whole-doc drafts.
   */
  focus: ScriptDocFocusSchema.optional(),
  locale: z.enum(LOCALES),
  apiKeyId: z.string().trim().min(1).max(160).optional(),
})

// ─── Clarifying questions (反问澄清卡) ────────────────────────────────────
// The drafting step may return structured questions instead of an outline when
// it needs creative direction. Chips backfill the next draft; never hue-coded.
//
// ⚠ 形状定义已上收到 `types/assistant-protocol.ts`（A2：反问从「只有 ScriptDoc
// 起草时才有」推广到四个域，`[[ask]]` 块用的是同一个 schema）。这里只保留剧本线
// 自己的用法，**不再有第二份定义** —— 两份迟早分叉成两种问题卡。

/**
 * What the server had to leave out of the prompt envelope to stay inside
 * `SCRIPT_DOC_PROMPT_BUDGET`. Attached only when something was actually
 * trimmed, so the workspace can say so rather than degrade silently — the
 * previous behaviour (a hard 4000-character ceiling, swallowed into a generic
 * 500) is precisely what made this failure so hard to attribute.
 */
export const ScriptDocTrimNoticeSchema = z.object({
  /** Conversation turns that made it into the envelope. */
  keptMessages: z.number().int().min(0),
  /** Turns dropped, oldest first, to fit. */
  droppedMessages: z.number().int().min(0),
  /**
   * Optional doc fields withheld from the model. Their values are restored on
   * the result, so they are preserved but were not available to revise.
   */
  heldBackFields: z.number().int().min(0),
})

// Drafting returns EITHER the outline OR clarifying questions (discriminated by
// `kind`). Keeps a single round-trip; the workspace renders the question card
// and folds answers back into the next draft. `trim` is server-attached (never
// model-authored) and optional, so existing consumers are unaffected.
export const NodeScriptDocResponseDataSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('scriptDoc'),
    scriptDoc: ScriptDocSchema,
    trim: ScriptDocTrimNoticeSchema.optional(),
  }),
  z.object({
    kind: z.literal('questions'),
    questions: z
      .array(AssistantClarifyingQuestionSchema)
      .min(1)
      .max(SCRIPT_DOC_LIMITS.maxClarifyQuestions),
    trim: ScriptDocTrimNoticeSchema.optional(),
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
export type ScriptDocFocus = z.infer<typeof ScriptDocFocusSchema>
export type ScriptDocTrimNotice = z.infer<typeof ScriptDocTrimNoticeSchema>
export type NodeScriptDocRequest = z.infer<typeof NodeScriptDocRequestSchema>
export type NodeScriptDocResponseData = z.infer<
  typeof NodeScriptDocResponseDataSchema
>
export type NodeScriptDocApiSuccessResponse = z.infer<
  typeof NodeScriptDocApiSuccessResponseSchema
>
