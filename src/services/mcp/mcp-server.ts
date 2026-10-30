import 'server-only'

import {
  acceptedContent,
  CLIENT_CAPABILITIES_META_KEY,
  inputRequired,
  type AuthInfo,
  type CallToolResult,
  type InputRequiredResult,
  type McpServer,
  type ServerContext,
} from '@modelcontextprotocol/server'
import { z } from 'zod'

import { logger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'
import { editForMcp, undoForMcp } from '@/services/mcp/mcp-edit.service'
import {
  createGenerationRequest,
  decideGenerationRequest,
  getGenerationForMcp,
  listModelsForMcp,
  readPendingSummary,
} from '@/services/mcp/mcp-generate.service'
import { findForMcp, lookForMcp } from '@/services/mcp/mcp-library.service'
import { verifyMcpOAuthToken } from '@/services/mcp/mcp-oauth.service'
import {
  verifyMcpToken,
  type McpTokenOwner,
} from '@/services/mcp/mcp-token.service'
import {
  applyOpsForMcp,
  getRenderForMcp,
  listProjectsForMcp,
  lookAtForMcp,
  McpToolError,
  readProjectForMcp,
  renderForMcp,
} from '@/services/mcp/mcp-tools.service'
import type { EdgeFrame } from '@/services/video-frames/edge-frame.service'
import { getAppOrigin } from '@/constants/config'
import {
  MCP_ACCESS_LEVELS,
  MCP_CONFIRM_INPUT_KEY,
  MCP_RATE_LIMIT,
  MCP_TOKEN_PREFIX,
  MCP_TOOL_ACCESS,
  MCP_TOOL_IDS,
  mcpAccessAllows,
} from '@/constants/mcp'
import { ROUTES } from '@/constants/routes'
import {
  McpApplyOpsInputSchema,
  McpEditInputSchema,
  McpFindInputSchema,
  McpGenerateInputSchema,
  McpGetGenerationInputSchema,
  McpListModelsInputSchema,
  McpGetRenderInputSchema,
  McpListProjectsInputSchema,
  McpLookAtInputSchema,
  McpLookInputSchema,
  McpReadProjectInputSchema,
  McpRenderInputSchema,
  McpUndoInputSchema,
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
  access: z.enum(MCP_ACCESS_LEVELS),
})

export async function verifyMcpBearer(
  _request: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined
  // 自己生成的令牌认前缀；其余当 Clerk 签的 OAuth 访问令牌（§3.2）。
  const owner = bearerToken.startsWith(MCP_TOKEN_PREFIX)
    ? await verifyMcpToken(bearerToken)
    : await verifyMcpOAuthToken(bearerToken)
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

/** 一帧 / 一张图 → 一行标签 + 那张图；取不到的只回原因。 */
function frameContent(frame: EdgeFrame): CallToolResult['content'] {
  return frame.ok
    ? [
        { type: 'text', text: frame.label },
        { type: 'image', data: frame.base64, mimeType: frame.mimeType },
      ]
    : [{ type: 'text', text: `${frame.label}: ${frame.reason}` }]
}

async function guard<R extends CallToolResult | InputRequiredResult>(
  tool: (typeof MCP_TOOL_IDS)[keyof typeof MCP_TOOL_IDS],
  authInfo: AuthInfo | undefined,
  run: (owner: McpTokenOwner) => Promise<R>,
): Promise<R | CallToolResult> {
  const parsed = OwnerSchema.safeParse(authInfo?.extra)
  if (!parsed.success) return textResult('Not signed in to ANTEI.', true)
  const owner = parsed.data

  // 权限闸（§3.3）：工具照样列出来，调用时才拦，回一句她能照着做的话。
  const needed = MCP_TOOL_ACCESS[tool] ?? 'read'
  if (!mcpAccessAllows(owner.access, needed)) {
    return textResult(
      `This connection can only ${owner.access === 'read' ? 'look' : 'look and change things'}; ${tool} needs "${needed}". Ask the user to raise it for this connection in ANTEI Settings → Connections.`,
      true,
    )
  }

  const limited = await rateLimit(`mcp:${owner.userId}`, MCP_RATE_LIMIT)
  if (!limited.success) {
    return textResult(
      'Too many ANTEI calls in the last minute; wait a moment and try again.',
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
    return textResult('Something went wrong on ANTEI’s side; try again.', true)
  }
}

/* ─── 出图确认（§4.4）────────────────────────────────────────────────── */

const ConfirmSchema = z.object({
  confirm: z.boolean().describe('Generate it'),
})

/**
 * 客户端会不会弹框：只认 2026-07-28 的每请求信封里声明的 `elicitation.form`。
 * ⚠ 2025 那一代在无状态部署上没有会话，服务器→客户端的弹框请求回不来，所以一律当不会，
 *   走网站确认。
 */
function clientCanConfirm(ctx: ServerContext): boolean {
  const envelope = (ctx.mcpReq.envelope ?? {}) as Record<string, unknown>
  const capabilities = (envelope[CLIENT_CAPABILITIES_META_KEY] ??
    envelope.clientCapabilities) as
    | { elicitation?: { form?: unknown } | Record<string, never> }
    | undefined
  const elicitation = capabilities?.elicitation
  // 老写法 `elicitation: {}` 等于只会表单。
  return Boolean(
    elicitation &&
    ('form' in elicitation || Object.keys(elicitation).length === 0),
  )
}

function confirmOnSiteUrl(): string {
  return `${getAppOrigin()}${ROUTES.SETTINGS_CONNECTIONS}`
}

async function runGenerate(
  owner: McpTokenOwner,
  input: z.infer<typeof McpGenerateInputSchema>,
  ctx: ServerContext,
): Promise<CallToolResult | InputRequiredResult> {
  const state = ctx.mcpReq.requestState()
  if (typeof state === 'string' && state) {
    const pending = await readPendingSummary(owner, state)
    // 已经定过 / 过期：照实说，⛔ 不再发起一条新的。
    if (!pending) return textResult(await getGenerationForMcp(owner, state))
    if (ctx.mcpReq.inputResponses?.[MCP_CONFIRM_INPUT_KEY] !== undefined) {
      const answer = acceptedContent(
        ctx.mcpReq.inputResponses,
        MCP_CONFIRM_INPUT_KEY,
        ConfirmSchema,
      )
      const decision = answer?.confirm === true ? 'confirm' : 'decline'
      const decided = await decideGenerationRequest(owner, state, decision)
      if (decision === 'decline' || !decided)
        return textResult('The user declined this generation.')
      return textResult(
        `${await getGenerationForMcp(owner, state)}\nrequestId: ${state} — poll get_generation until the pictures are done.`,
      )
    }
    return askToConfirm(pending, ctx)
  }
  return askToConfirm(await createGenerationRequest(owner, input), ctx)
}

function askToConfirm(
  pending: { requestId: string; summary: string },
  ctx: ServerContext,
): CallToolResult | InputRequiredResult {
  if (clientCanConfirm(ctx))
    return inputRequired({
      inputRequests: {
        [MCP_CONFIRM_INPUT_KEY]: inputRequired.elicit({
          message: `ANTEI: generate ${pending.summary}? It uses your own API key. (You can also confirm it at ${confirmOnSiteUrl()})`,
          requestedSchema: ConfirmSchema,
        }),
      },
      requestState: pending.requestId,
    })
  return textResult(
    `Nothing is generated yet: the user has to confirm it themselves. Tell them to open ${confirmOnSiteUrl()} and confirm "${pending.summary}" (it waits 30 minutes). Then poll get_generation with requestId ${pending.requestId}.`,
  )
}

export function registerMcpTools(server: McpServer): void {
  server.registerTool(
    MCP_TOOL_IDS.listProjects,
    {
      title: 'List canvas projects',
      description:
        'Lists your ANTEI canvas projects, most recently active first: id, name, last change, node count, and the edit timeline length if there is one.',
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
        'Shows actual frames: a video card at given seconds of its current take, a timeline clip at given timeline seconds, a finished render at given seconds of the cut, or an image card. Returns one 512px-wide JPEG per time.',
      inputSchema: McpLookAtInputSchema,
      annotations: { readOnlyHint: true },
    },
    async (input, ctx) =>
      guard(MCP_TOOL_IDS.lookAt, ctx.http?.authInfo, async (owner) => {
        const frames = await lookAtForMcp(owner, input)
        return { content: frames.flatMap(frameContent) }
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

  server.registerTool(
    MCP_TOOL_IDS.render,
    {
      title: 'Render the edit timeline',
      description:
        'Renders the edit timeline, whole or a range (fromSec/toSec in timeline seconds) or one clip. draft: a 480p preview only you look at; it is not added to the library or the canvas. final: the same as the edit desk export; when it finishes it lands on the canvas as a video card linked to its source shots. Rendering is free, but only a couple can run at once. Returns a jobId to poll with get_render.',
      inputSchema: McpRenderInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input, ctx) =>
      guard(MCP_TOOL_IDS.render, ctx.http?.authInfo, async (owner) =>
        jsonResult(await renderForMcp(owner, input)),
      ),
  )

  server.registerTool(
    MCP_TOOL_IDS.getRender,
    {
      title: 'Check a render',
      description:
        'Status of a render: queued / running (with step and progress) / completed / failed / cancelled. When completed it gives the video url and poster, and for a final render the id of the card it landed on the canvas. Then use look_at with renderJobId to check the cut points.',
      inputSchema: McpGetRenderInputSchema,
      annotations: { readOnlyHint: true },
    },
    async (input, ctx) =>
      guard(MCP_TOOL_IDS.getRender, ctx.http?.authInfo, async (owner) =>
        jsonResult(await getRenderForMcp(owner, input)),
      ),
  )

  server.registerTool(
    MCP_TOOL_IDS.find,
    {
      title: 'Search their ANTEI library',
      description:
        'Searches their pictures, characters, LoRAs, saved prompts, earlier assistant conversations and voices, and when named the Danbooru tag library and the Civitai LoRA library. Each line starts with a number or name to open with look.',
      inputSchema: McpFindInputSchema,
      annotations: { readOnlyHint: true },
    },
    async (input, ctx) =>
      guard(MCP_TOOL_IDS.find, ctx.http?.authInfo, async (owner) =>
        textResult(await findForMcp(owner, input)),
      ),
  )

  server.registerTool(
    MCP_TOOL_IDS.look,
    {
      title: 'Open items from their library',
      description:
        'Opens what find listed, by number or name: a picture with its full recipe (prompt, model, LoRAs, settings) and the picture itself, a character with every look and setting, a LoRA, a Danbooru tag (wiki, related tags, samples), a voice, a saved prompt, a gallery picture, an earlier conversation, an assistant skill, or their assistant settings.',
      inputSchema: McpLookInputSchema,
      annotations: { readOnlyHint: true },
    },
    async (input, ctx) =>
      guard(MCP_TOOL_IDS.look, ctx.http?.authInfo, async (owner) => {
        const parts = await lookForMcp(owner, input)
        return {
          content: parts.flatMap((part) => [
            { type: 'text' as const, text: part.text },
            ...part.frames.flatMap(frameContent),
          ]),
        }
      }),
  )

  server.registerTool(
    MCP_TOOL_IDS.edit,
    {
      title: 'Change their ANTEI library',
      description:
        'Changes their library, a batch at a time: tag, favourite or file pictures, make folders, edit or add characters and their looks, attach a LoRA to a character, favourite a LoRA or change its cover, save or edit a prompt. Name things the way find prints them. Each change succeeds or fails on its own and comes back with an undo code. Nothing is deleted or made public, and nothing generates.',
      inputSchema: McpEditInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input, ctx) =>
      guard(MCP_TOOL_IDS.edit, ctx.http?.authInfo, async (owner) =>
        jsonResult(await editForMcp(owner, input)),
      ),
  )

  server.registerTool(
    MCP_TOOL_IDS.undo,
    {
      title: 'Undo a library change',
      description:
        'Undoes one change edit made, by the undo code it gave back. Only what that change did is taken back; anything changed since is left alone.',
      inputSchema: McpUndoInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async (input, ctx) =>
      guard(MCP_TOOL_IDS.undo, ctx.http?.authInfo, async (owner) =>
        textResult(await undoForMcp(owner, input)),
      ),
  )

  server.registerTool(
    MCP_TOOL_IDS.models,
    {
      title: 'List image models',
      description:
        'Lists the image models generate can use: model id and provider, and whether they have a key for that provider yet.',
      inputSchema: McpListModelsInputSchema,
      annotations: { readOnlyHint: true },
    },
    async (_input, ctx) =>
      guard(MCP_TOOL_IDS.models, ctx.http?.authInfo, async (owner) =>
        textResult(await listModelsForMcp(owner)),
      ),
  )

  server.registerTool(
    MCP_TOOL_IDS.generate,
    {
      title: 'Generate pictures (the user confirms)',
      description:
        'Asks to generate pictures with their own key: prompt, model (from list_models), aspect ratio, how many, and optional reference pictures from their library. Nothing is generated until the user confirms it themselves — in this client if it can show a confirmation, otherwise on the ANTEI website. Returns a requestId; poll get_generation for the pictures.',
      inputSchema: McpGenerateInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input, ctx) =>
      guard(MCP_TOOL_IDS.generate, ctx.http?.authInfo, (owner) =>
        runGenerate(owner, input, ctx),
      ),
  )

  server.registerTool(
    MCP_TOOL_IDS.getGeneration,
    {
      title: 'Check a generation',
      description:
        'Status of a generate request: waiting for the user, declined, expired, or confirmed with each picture’s progress. Finished pictures come back as numbers (图_N) to open with look.',
      inputSchema: McpGetGenerationInputSchema,
      annotations: { readOnlyHint: true },
    },
    async (input, ctx) =>
      guard(MCP_TOOL_IDS.getGeneration, ctx.http?.authInfo, async (owner) =>
        textResult(await getGenerationForMcp(owner, input.requestId)),
      ),
  )
}
