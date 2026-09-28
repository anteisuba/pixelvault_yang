import 'server-only'

import type {
  AuthInfo,
  CallToolResult,
  McpServer,
} from '@modelcontextprotocol/server'
import { z } from 'zod'

import { logger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'
import {
  verifyMcpToken,
  type McpTokenOwner,
} from '@/services/mcp/mcp-token.service'
import {
  applyOpsForMcp,
  listProjectsForMcp,
  lookAtForMcp,
  McpToolError,
  readProjectForMcp,
} from '@/services/mcp/mcp-tools.service'
import { MCP_RATE_LIMIT, MCP_TOOL_IDS } from '@/constants/mcp'
import {
  McpApplyOpsInputSchema,
  McpListProjectsInputSchema,
  McpLookAtInputSchema,
  McpReadProjectInputSchema,
} from '@/types/mcp'

/**
 * MCP 服务的装配（`docs/references/mcp.md` §3 / §4）：认令牌、注册工具、每次调用
 * 过同一道「认人 → 限流 → 把错误翻成一句话」。路由只负责把它挂上去。
 */

/** 令牌主人塞在 `AuthInfo.extra` 里带到工具回调；取出来时再验一遍形状。 */
const OwnerSchema = z.object({
  tokenId: z.string(),
  userId: z.string(),
  clerkId: z.string(),
})

export async function verifyMcpBearer(
  _request: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined
  const owner = await verifyMcpToken(bearerToken)
  if (!owner) return undefined
  return {
    token: bearerToken,
    clientId: owner.tokenId,
    scopes: [],
    extra: { ...owner },
  }
}

function textResult(text: string, isError = false): CallToolResult {
  return { content: [{ type: 'text', text }], ...(isError ? { isError } : {}) }
}

function jsonResult(value: unknown): CallToolResult {
  return textResult(JSON.stringify(value))
}

async function guard(
  tool: string,
  authInfo: AuthInfo | undefined,
  run: (owner: McpTokenOwner) => Promise<CallToolResult>,
): Promise<CallToolResult> {
  const parsed = OwnerSchema.safeParse(authInfo?.extra)
  if (!parsed.success) return textResult('Not signed in to PixelVault.', true)
  const owner = parsed.data

  const limited = await rateLimit(`mcp:${owner.userId}`, MCP_RATE_LIMIT)
  if (!limited.success) {
    return textResult(
      'Too many PixelVault calls in the last minute; wait a moment and try again.',
      true,
    )
  }

  const startedAt = Date.now()
  try {
    const result = await run(owner)
    logger.info('[mcp] tool call', {
      tool,
      userId: owner.userId,
      durationMs: Date.now() - startedAt,
    })
    return result
  } catch (error) {
    if (error instanceof McpToolError) return textResult(error.message, true)
    logger.error('[mcp] tool failed', {
      tool,
      userId: owner.userId,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    })
    return textResult(
      'Something went wrong on PixelVault’s side; try again.',
      true,
    )
  }
}

export function registerMcpTools(server: McpServer): void {
  server.registerTool(
    MCP_TOOL_IDS.listProjects,
    {
      title: 'List canvas projects',
      description:
        'Lists your PixelVault canvas projects, most recently active first: id, name, last change, node count, and the edit timeline length if there is one.',
      inputSchema: McpListProjectsInputSchema,
      annotations: { readOnlyHint: true },
    },
    async (_input, ctx) =>
      guard(MCP_TOOL_IDS.listProjects, ctx.http?.authInfo, async (owner) =>
        jsonResult(await listProjectsForMcp(owner)),
      ),
  )

  server.registerTool(
    MCP_TOOL_IDS.readProject,
    {
      title: 'Read a canvas project',
      description:
        'Reads one project: its version, the canvas (shots and their nodes; the focused shot and its neighbours in full, other shots one line each) and the edit timeline (every clip with timeline start/end seconds, source trim, speed, transition, and whether its source card has a newer take).',
      inputSchema: McpReadProjectInputSchema,
      annotations: { readOnlyHint: true },
    },
    async (input, ctx) =>
      guard(MCP_TOOL_IDS.readProject, ctx.http?.authInfo, async (owner) =>
        jsonResult(await readProjectForMcp(owner, input)),
      ),
  )

  server.registerTool(
    MCP_TOOL_IDS.lookAt,
    {
      title: 'Look at frames',
      description:
        'Shows actual frames: a video card at given seconds of its current take, a timeline clip at given timeline seconds, or an image card. Returns one 512px-wide JPEG per time.',
      inputSchema: McpLookAtInputSchema,
      annotations: { readOnlyHint: true },
    },
    async (input, ctx) =>
      guard(MCP_TOOL_IDS.lookAt, ctx.http?.authInfo, async (owner) => {
        const frames = await lookAtForMcp(owner, input)
        return {
          content: frames.flatMap((frame) =>
            frame.ok
              ? [
                  { type: 'text' as const, text: frame.label },
                  {
                    type: 'image' as const,
                    data: frame.base64,
                    mimeType: frame.mimeType,
                  },
                ]
              : [
                  {
                    type: 'text' as const,
                    text: `${frame.label}: ${frame.reason}`,
                  },
                ],
          ),
        }
      }),
  )

  server.registerTool(
    MCP_TOOL_IDS.applyOps,
    {
      title: 'Edit a canvas project',
      description:
        'Applies a batch of edits: the same operations the in-app canvas assistant uses, minus anything that generates. Timeline: edit_add_clip, edit_update_clip (trim, speed, transition, mute, gain), edit_move_clip, edit_remove_clip, edit_add_text / edit_update_text / edit_remove_text, edit_set_timeline. Cards: set_prompt, set_text, set_review_state, add_node, connect and the rest. Pass baseVersion from read_project; the whole batch is one undo step for the user, and the open canvas follows it. Returns the new version and any op that was skipped with its reason.',
      inputSchema: McpApplyOpsInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input, ctx) =>
      guard(MCP_TOOL_IDS.applyOps, ctx.http?.authInfo, async (owner) =>
        jsonResult(await applyOpsForMcp(owner, input)),
      ),
  )
}
