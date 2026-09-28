/**
 * 外部 Claude 经 MCP 读写画布（`docs/references/mcp.md`）的形状。
 *
 * 工具入参的 `.describe()` 是写给 Claude 读的（会进工具的 JSON Schema），
 * 所以用英文、写清单位。
 */

import { z } from 'zod'

import { EDIT_RESOLUTIONS } from '@/constants/edit-desk'
import {
  MCP_APPLY_OPS_MAX,
  MCP_LOOK_AT_MAX_TIMES,
  MCP_RENDER_KINDS,
  MCP_TOKEN_NAME_MAX_LENGTH,
} from '@/constants/mcp'
import { LOCALES } from '@/i18n/routing'
import { CANVAS_APPLY_OP_IDS } from '@/types/assistant-operator'
import { NodeAssistantOpV4Schema } from '@/types/node-assistant-ops'

/* ─── 令牌（§3.1）──────────────────────────────────────────────────────── */

export const CreateMcpTokenRequestSchema = z.object({
  name: z.string().trim().min(1).max(MCP_TOKEN_NAME_MAX_LENGTH),
})

export type CreateMcpTokenRequest = z.infer<typeof CreateMcpTokenRequestSchema>

export const McpTokenRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  last4: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
})

export type McpTokenRecord = z.infer<typeof McpTokenRecordSchema>

/** 生成那一刻的回包 —— ⚠ 明文 `token` 只在这里出现一次。 */
export const CreatedMcpTokenSchema = McpTokenRecordSchema.extend({
  token: z.string(),
})

export type CreatedMcpToken = z.infer<typeof CreatedMcpTokenSchema>

/* ─── 工具入参（§4）────────────────────────────────────────────────────── */

const IdSchema = z.string().trim().min(1).max(160)

const ProjectIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .describe('Canvas project id from list_projects.')

export const McpListProjectsInputSchema = z.object({})

export const McpReadProjectInputSchema = z.object({
  projectId: ProjectIdSchema,
  focusShot: z
    .number()
    .int()
    .min(0)
    .max(10_000)
    .optional()
    .describe(
      'Shot number to expand in full, together with its two neighbours. Other shots come back as one line each; read again with another focusShot to see them.',
    ),
})

export type McpReadProjectInput = z.infer<typeof McpReadProjectInputSchema>

export const McpLookAtInputSchema = z
  .object({
    projectId: ProjectIdSchema,
    nodeId: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .optional()
      .describe(
        'A video or image node. For video, times are seconds into its current take.',
      ),
    clipId: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .optional()
      .describe(
        'A video clip on the edit timeline. Times are seconds on the timeline; they are mapped into the source for you.',
      ),
    renderJobId: IdSchema.optional().describe(
      'A finished render from get_render. Times are seconds into the rendered cut.',
    ),
    times: z
      .array(z.number().min(0).max(36_000))
      .min(1)
      .max(MCP_LOOK_AT_MAX_TIMES)
      .optional()
      .describe(
        `Seconds to look at (up to ${MCP_LOOK_AT_MAX_TIMES}). Required for video; ignored for an image node.`,
      ),
  })
  .refine(
    (input) =>
      [input.nodeId, input.clipId, input.renderJobId].filter(Boolean).length ===
      1,
    { message: 'Pass exactly one of nodeId, clipId or renderJobId.' },
  )

export type McpLookAtInput = z.infer<typeof McpLookAtInputSchema>

/**
 * `apply_ops` 收的 op：v4 op 表里**站内 `canvas_apply` 准入的那一部分**（能撤销 ∧
 * 不是 `generate`）。⚠ 从同一份 `NodeAssistantOpV4Schema` 按 `CANVAS_APPLY_OP_IDS`
 * 过滤出来，⛔ 不手抄第二份（docs/references/mcp.md §2 第 1 条）—— 也因此生成与
 * 只读 op 根本不出现在工具的 JSON Schema 里。
 */
type McpApplyOpSchemaMember = (typeof NodeAssistantOpV4Schema.options)[number]

const MCP_APPLY_OP_SCHEMAS = NodeAssistantOpV4Schema.options.filter((schema) =>
  (CANVAS_APPLY_OP_IDS as readonly string[]).includes(schema.shape.op.value),
) as [McpApplyOpSchemaMember, ...McpApplyOpSchemaMember[]]

export const McpApplyOpSchema = z.discriminatedUnion('op', MCP_APPLY_OP_SCHEMAS)

export const McpApplyOpsInputSchema = z.object({
  projectId: ProjectIdSchema,
  baseVersion: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .describe(
      'The version read_project returned. If the project changed since, nothing is written and you are asked to read again.',
    ),
  ops: z
    .array(McpApplyOpSchema)
    .min(1)
    .max(MCP_APPLY_OPS_MAX)
    .describe(
      'Edits applied in order as one batch (one undo step for the user). Later ops can target a node an earlier add_node created through its ref.',
    ),
})

export type McpApplyOpsInput = z.infer<typeof McpApplyOpsInputSchema>

/* ─── 渲染（§7）────────────────────────────────────────────────────────── */

export const McpRenderInputSchema = z
  .object({
    projectId: ProjectIdSchema,
    kind: z
      .enum(MCP_RENDER_KINDS)
      .describe(
        'draft: a 480p preview for you to check the cut; it is not added to the library or the canvas. final: the same as the edit desk export; it lands on the canvas as a video card linked to its source shots.',
      ),
    fromSec: z
      .number()
      .min(0)
      .max(36_000)
      .optional()
      .describe('Start of the range in timeline seconds (default: 0).'),
    toSec: z
      .number()
      .min(0)
      .max(36_000)
      .optional()
      .describe('End of the range in timeline seconds (default: the end).'),
    clipId: IdSchema.optional().describe(
      'Render just this timeline clip instead of a range.',
    ),
    resolution: z
      .enum(EDIT_RESOLUTIONS)
      .optional()
      .describe(
        'final only: output resolution (default: the timeline setting). Drafts are always 480p.',
      ),
    locale: z
      .enum(LOCALES)
      .optional()
      .describe(
        "final only: language of the user's interface, for the source line on the landed card (default: en).",
      ),
  })
  .refine(
    (input) =>
      !input.clipId ||
      (input.fromSec === undefined && input.toSec === undefined),
    { message: 'Pass either clipId or fromSec/toSec, not both.' },
  )

export type McpRenderInput = z.infer<typeof McpRenderInputSchema>

export const McpGetRenderInputSchema = z.object({
  projectId: ProjectIdSchema,
  jobId: IdSchema.describe('The jobId render returned.'),
})

export type McpGetRenderInput = z.infer<typeof McpGetRenderInputSchema>

/* ─── 浏览器实时跟随（§6）─────────────────────────────────────────────── */

export const ProjectFollowStatusSchema = z.object({
  /** 画布内容的版本号（与保存用的 `baseUpdatedAt` 同一个）。 */
  updatedAt: z.string(),
  /** 这个账号的令牌最近用过 —— 开着的画布据此加快轮询，并把别处来的改动记成 Claude 的。 */
  mcpActive: z.boolean(),
})

export type ProjectFollowStatus = z.infer<typeof ProjectFollowStatusSchema>
