import 'server-only'

import { db } from '@/lib/db'
import { buildGenerationTag } from '@/lib/generation-name'
import { resolvePicture } from '@/features/assistant/workspace.service'
import {
  checkImageGenerationStatus,
  submitImageGeneration,
} from '@/services/image/submit-image.service'
import { getResolvedModelOptions } from '@/services/model-config.service'
import { ensureUser } from '@/services/user.service'
import type { McpTokenOwner } from '@/services/mcp/mcp-token.service'
import { McpToolError } from '@/services/mcp/mcp-tools.service'
import {
  MCP_GENERATION_REQUEST_STATUSES,
  MCP_GENERATION_REQUEST_TTL_MS,
  MCP_PENDING_REQUESTS_LIMIT,
  type McpGenerationDecision,
  type McpGenerationRequestStatus,
} from '@/constants/mcp'
import { GenerateRequestSchema, type GenerateRequest } from '@/types'
import type {
  McpDecisionResult,
  McpGenerateInput,
  McpGenerationRequestRecord,
} from '@/types/mcp'

/**
 * 外部 AI 出图（`docs/references/mcp.md` §4.4，owner 2026-10-30）：AI 只能**发起**，
 * 出不出由她亲自定 —— 客户端弹框点「确认」，或在网站「设置 → 连接」上点。
 *
 * ⭐ 发起时先落一行 `McpGenerationRequest`（pending），确认才调 `submitImageGeneration`，
 *   与图片台同一条出图路（她自己的 key、同一套路由与扣费），⛔ 不另写一条。
 * ⭐ 确认是一条 `updateMany(pending → confirmed)`：客户端与网站同时点也只出一次。
 * ⚠ 每一步都按 userId 收敛：请求 id 走一趟客户端回来是不可信的，只碰得到她自己的那几行。
 */

const KIND_IMAGE = 'image'

type RequestRow = {
  id: string
  userId: string
  request: unknown
  summary: string
  status: string
  jobIds: string[]
  error: string | null
  createdAt: Date
  expiresAt: Date
}

function statusOf(row: Pick<RequestRow, 'status' | 'expiresAt'>, now: Date) {
  const status = (
    MCP_GENERATION_REQUEST_STATUSES as readonly string[]
  ).includes(row.status)
    ? (row.status as McpGenerationRequestStatus)
    : 'expired'
  return status === 'pending' && row.expiresAt <= now ? 'expired' : status
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/* ─── 模型 ─────────────────────────────────────────────────────────── */

export async function listModelsForMcp(owner: McpTokenOwner): Promise<string> {
  const [models, keys] = await Promise.all([
    getResolvedModelOptions(),
    db.userApiKey.findMany({
      where: { userId: owner.userId, isActive: true },
      select: { adapterType: true },
    }),
  ])
  const keyed = new Set(keys.map((key) => key.adapterType))
  const lines = models
    .filter((model) => model.available && model.outputType === 'IMAGE')
    .filter((model) => !model.imageKind || model.imageKind === 'generate')
    .map(
      (model) =>
        `${model.id} · ${model.adapterType}${keyed.has(model.adapterType) ? '' : ' · no key of theirs yet (they set it up in ANTEI first)'}`,
    )
  return lines.length
    ? `IMAGE MODELS (id · provider)\n${lines.join('\n')}`
    : 'IMAGE MODELS: none available.'
}

/* ─── 发起 ─────────────────────────────────────────────────────────── */

export interface McpGenerationPending {
  readonly requestId: string
  readonly summary: string
}

export async function createGenerationRequest(
  owner: McpTokenOwner,
  input: McpGenerateInput,
  now: Date = new Date(),
): Promise<McpGenerationPending> {
  const references: string[] = []
  for (const name of input.references ?? []) {
    const picture = await resolvePicture(
      { userId: owner.userId, clerkId: owner.clerkId, incognito: false },
      name,
    ).catch(() => null)
    if (!picture)
      throw new McpToolError(
        `${name}: not a picture of theirs. Use picture numbers (图_1624); find can look them up.`,
      )
    references.push(picture.url)
  }
  const parsed = GenerateRequestSchema.safeParse({
    prompt: input.prompt,
    modelId: input.model,
    aspectRatio: input.aspectRatio ?? '1:1',
    ...(references.length ? { referenceImages: references } : {}),
    ...(input.negativePrompt
      ? { advancedParams: { negativePrompt: input.negativePrompt } }
      : {}),
  })
  if (!parsed.success)
    throw new McpToolError(
      `That cannot be generated: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`,
    )
  const count = input.count ?? 1
  const summary = [
    `${count} × ${input.model}`,
    parsed.data.aspectRatio,
    references.length ? `${references.length} reference(s)` : null,
    `“${clip(input.prompt, 120)}”`,
  ]
    .filter(Boolean)
    .join(' · ')
  const row = await db.mcpGenerationRequest.create({
    data: {
      userId: owner.userId,
      tokenId: owner.tokenId,
      kind: KIND_IMAGE,
      request: { count, generate: parsed.data },
      summary,
      expiresAt: new Date(now.getTime() + MCP_GENERATION_REQUEST_TTL_MS),
    },
    select: { id: true, summary: true },
  })
  return { requestId: row.id, summary: row.summary }
}

/** 一行还在等、而且是她的（客户端带回来的 id 不可信）。 */
export async function readPendingSummary(
  owner: Pick<McpTokenOwner, 'userId'>,
  requestId: string,
  now: Date = new Date(),
): Promise<McpGenerationPending | null> {
  const row = await db.mcpGenerationRequest.findFirst({
    where: { id: requestId, userId: owner.userId },
    select: { id: true, summary: true, status: true, expiresAt: true },
  })
  return row && statusOf(row, now) === 'pending'
    ? { requestId: row.id, summary: row.summary }
    : null
}

/* ─── 她定 ─────────────────────────────────────────────────────────── */

/**
 * 确认或拒绝。⚠ 只有第一下算：pending → 别的状态是一条带条件的 `updateMany`，
 * 抢输的那一下读回现状（已确认就回已发出的任务）。确认成功才出图。
 */
export async function decideGenerationRequest(
  user: { userId: string; clerkId: string },
  requestId: string,
  decision: McpGenerationDecision,
  now: Date = new Date(),
): Promise<McpDecisionResult | null> {
  const won = await db.mcpGenerationRequest.updateMany({
    where: {
      id: requestId,
      userId: user.userId,
      status: 'pending',
      expiresAt: { gt: now },
    },
    data: {
      status: decision === 'confirm' ? 'confirmed' : 'declined',
      decidedAt: now,
    },
  })
  const row = await db.mcpGenerationRequest.findFirst({
    where: { id: requestId, userId: user.userId },
  })
  if (!row) return null
  if (won.count === 0 || decision === 'decline')
    return {
      status: statusOf(row, now),
      jobIds: row.jobIds,
      error: row.error,
    }

  const stored = row.request as { count?: unknown; generate?: unknown }
  const generate = GenerateRequestSchema.safeParse(stored.generate)
  const count =
    typeof stored.count === 'number' && stored.count > 0 ? stored.count : 1
  if (!generate.success) {
    await db.mcpGenerationRequest.update({
      where: { id: row.id },
      data: { error: 'The stored request could not be read.' },
    })
    return { status: 'confirmed', jobIds: [], error: 'unreadable request' }
  }
  const jobIds: string[] = []
  let error: string | null = null
  for (let index = 0; index < count; index += 1) {
    try {
      const submitted = await submitImageGeneration(
        user.clerkId,
        generate.data as GenerateRequest,
      )
      jobIds.push(submitted.jobId)
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught)
      break
    }
  }
  await db.mcpGenerationRequest.update({
    where: { id: row.id },
    data: { jobIds, error },
  })
  return { status: 'confirmed', jobIds, error }
}

/** 网站上点的那一下（Clerk 会话）。 */
export async function decideGenerationRequestForClerkId(
  clerkId: string,
  requestId: string,
  decision: McpGenerationDecision,
): Promise<McpDecisionResult | null> {
  const user = await ensureUser(clerkId)
  return decideGenerationRequest(
    { userId: user.id, clerkId },
    requestId,
    decision,
  )
}

/** 网站上「等你确认」那一列：只列还在等的。 */
export async function listPendingGenerationRequests(
  clerkId: string,
  now: Date = new Date(),
): Promise<McpGenerationRequestRecord[]> {
  const user = await ensureUser(clerkId)
  const rows = await db.mcpGenerationRequest.findMany({
    where: { userId: user.id, status: 'pending', expiresAt: { gt: now } },
    orderBy: { createdAt: 'desc' },
    take: MCP_PENDING_REQUESTS_LIMIT,
    select: {
      id: true,
      summary: true,
      status: true,
      createdAt: true,
      expiresAt: true,
      token: { select: { name: true } },
    },
  })
  return rows.map((row) => ({
    id: row.id,
    summary: row.summary,
    status: 'pending',
    tokenName: row.token?.name ?? null,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  }))
}

/* ─── 结果 ─────────────────────────────────────────────────────────── */

/** AI 回来问：确认了没、出到哪了、出好的是哪几张（图编号，再用 look 看）。 */
export async function getGenerationForMcp(
  owner: McpTokenOwner,
  requestId: string,
  now: Date = new Date(),
): Promise<string> {
  const row = await db.mcpGenerationRequest.findFirst({
    where: { id: requestId, userId: owner.userId },
  })
  if (!row) throw new McpToolError('No such generation request of theirs.')
  const status = statusOf(row, now)
  if (status === 'pending')
    return `Still waiting for the user to confirm (${row.summary}). They can confirm in their AI client or on the ANTEI website under Settings → Connections.`
  if (status === 'declined') return 'The user declined this generation.'
  if (status === 'expired')
    return 'Nobody confirmed it in time; it was dropped. Ask the user before trying again.'
  const lines: string[] = []
  for (const jobId of row.jobIds) {
    const job = await checkImageGenerationStatus(owner.clerkId, jobId).catch(
      () => null,
    )
    if (!job) lines.push(`${jobId}: could not be read`)
    else if (job.status === 'COMPLETED')
      lines.push(
        `${buildGenerationTag({ seq: job.generation.seq ?? null, outputType: job.generation.outputType }) ?? job.generation.id}: done — open it with look`,
      )
    else if (job.status === 'FAILED')
      lines.push(`failed: ${job.error ?? 'unknown error'}`)
    else lines.push(`${job.status.toLowerCase().replace('_', ' ')}…`)
  }
  if (row.error) lines.push(`Could not start the rest: ${row.error}`)
  return lines.length
    ? `Confirmed (${row.summary}).\n${lines.join('\n')}`
    : `Confirmed, but nothing was started: ${row.error ?? 'unknown error'}`
}
