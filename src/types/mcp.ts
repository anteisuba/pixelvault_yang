/**
 * 外部 Claude 经 MCP 读写画布（`docs/references/mcp.md`）的形状。
 *
 * 工具入参的 `.describe()` 是写给 Claude 读的（会进工具的 JSON Schema），
 * 所以用英文、写清单位。
 */

import { z } from 'zod'

import {
  MCP_LOOK_AT_MAX_TIMES,
  MCP_TOKEN_NAME_MAX_LENGTH,
} from '@/constants/mcp'

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
    times: z
      .array(z.number().min(0).max(36_000))
      .min(1)
      .max(MCP_LOOK_AT_MAX_TIMES)
      .optional()
      .describe(
        `Seconds to look at (up to ${MCP_LOOK_AT_MAX_TIMES}). Required for video; ignored for an image node.`,
      ),
  })
  .refine((input) => Boolean(input.nodeId) !== Boolean(input.clipId), {
    message: 'Pass exactly one of nodeId or clipId.',
  })

export type McpLookAtInput = z.infer<typeof McpLookAtInputSchema>
