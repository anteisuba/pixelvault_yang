import { z } from 'zod'

import { SCRIPT_DOC_LIMITS, SCRIPT_DOC_REF_KINDS } from '@/constants/script-doc'

/**
 * 旧剧本笺的事实模型 —— **只剩 v3 读端在用**（v3 状态里的 `scriptDoc` 决定迁移时的
 * 镜号，见 `node-workflow-migrate-v4.ts`；`node-workflow-migrate-planner.ts` 往里折
 * 旧拆解）。剧本笺入口 10-22 删，起草接口与 v4 投影 11-01 删（`p-canvas-shotlist`：
 * 镜头信息改住在镜头卡上，见 `docs/design/canvas-shotlist.md`）。
 * ⛔ 不要在 v4 里重新用它；随 v3 读端一起删（node-canvas-v2 §14.4）。
 */

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
  name: z.string().trim().min(1).max(SCRIPT_DOC_LIMITS.roleNameMaxLength),
  /** Visual identity seed — becomes the character node's prompt. */
  description: z
    .string()
    .trim()
    .max(SCRIPT_DOC_LIMITS.textMaxLength)
    .default(''),
  voiceHint: z.string().trim().max(SCRIPT_DOC_LIMITS.textMaxLength).optional(),
  /** Optional — sharpens dialogue voice (filled per depth). */
  personality: z
    .string()
    .trim()
    .max(SCRIPT_DOC_LIMITS.textMaxLength)
    .optional(),
  /** Optional — what the role wants, drives motivation (filled per depth). */
  goal: z.string().trim().max(SCRIPT_DOC_LIMITS.textMaxLength).optional(),
})

export const ScriptDocDialogueLineSchema = z.object({
  id: ScriptDocIdSchema,
  speakerRoleId: ScriptDocIdSchema,
  line: z.string().trim().min(1).max(SCRIPT_DOC_LIMITS.textMaxLength),
})

export const ScriptDocShotSchema = z.object({
  id: ScriptDocIdSchema,
  sceneLabel: z.string().trim().max(SCRIPT_DOC_LIMITS.textMaxLength).optional(),
  summary: z.string().trim().min(1).max(SCRIPT_DOC_LIMITS.textMaxLength),
  /** Optional dual-emotion tag (surface · undercurrent), filled per depth. */
  emotion: z.string().trim().max(SCRIPT_DOC_LIMITS.emotionMaxLength).optional(),
  camera: z.string().trim().max(SCRIPT_DOC_LIMITS.textMaxLength).optional(),
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
    .max(SCRIPT_DOC_LIMITS.textMaxLength)
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
  logline: z.string().trim().max(SCRIPT_DOC_LIMITS.textMaxLength).default(''),
  styleNote: z.string().trim().max(SCRIPT_DOC_LIMITS.textMaxLength).optional(),
  /** Optional world / setting / backstory (filled per depth). */
  background: z.string().trim().max(SCRIPT_DOC_LIMITS.textMaxLength).optional(),
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

export type ScriptRef = z.infer<typeof ScriptRefSchema>
export type ScriptDocRole = z.infer<typeof ScriptDocRoleSchema>
export type ScriptDocDialogueLine = z.infer<typeof ScriptDocDialogueLineSchema>
export type ScriptDocShot = z.infer<typeof ScriptDocShotSchema>
export type ScriptDoc = z.infer<typeof ScriptDocSchema>
