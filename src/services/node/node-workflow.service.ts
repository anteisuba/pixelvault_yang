import 'server-only'

import type { NodeWorkflowProject } from '@/lib/generated/prisma/client'
import { Prisma } from '@/lib/generated/prisma/client'

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { ensureUser } from '@/services/user.service'
import {
  NodeWorkflowStateDataSchema,
  type CreateNodeWorkflowProjectRequest,
  type NodeWorkflowProjectRecord,
  type UpdateNodeWorkflowProjectRequest,
} from '@/types/node-workflow'

type NodeWorkflowStateData = NodeWorkflowProjectRecord['state']

/**
 * Prisma's Json column type is `InputJsonValue` which requires an index
 * signature on every object. Our Zod-typed shape doesn't have one (it has
 * named fields). Casting through `unknown` is the canonical workaround
 * Prisma docs recommend for "I trust this is JSON-serializable" payloads.
 */
function toPrismaJson(state: NodeWorkflowStateData): Prisma.InputJsonValue {
  return state as unknown as Prisma.InputJsonValue
}

const EMPTY_STATE: NodeWorkflowStateData = {
  nodes: [],
  edges: [],
} as unknown as NodeWorkflowStateData

/**
 * Cap on projects per user. Hitting this cap means "your account has lots
 * of stale projects you should clean up first" — we don't auto-prune.
 */
const MAX_PROJECTS_PER_USER = 50

export class NodeWorkflowProjectLimitError extends Error {
  constructor() {
    super('Maximum number of Node Studio projects reached')
    this.name = 'NodeWorkflowProjectLimitError'
  }
}

export class NodeWorkflowProjectNotFoundError extends Error {
  constructor(projectId: string) {
    super(`Node workflow project ${projectId} not found`)
    this.name = 'NodeWorkflowProjectNotFoundError'
  }
}

/**
 * Validate untrusted JSON before write. We do this server-side even though
 * the API route already validated the request body — DB-stored state should
 * never trust the persisted JSON to round-trip cleanly; bad data here means
 * the hydrating client crashes silently and the user thinks their work is
 * gone.
 */
function validateState(value: unknown): NodeWorkflowStateData {
  const parsed = NodeWorkflowStateDataSchema.safeParse(value)
  if (!parsed.success) {
    // Coerce to empty rather than throw — better to lose the bad save than
    // to brick the user's whole project list.
    return EMPTY_STATE
  }
  return parsed.data
}

function toRecord(row: NodeWorkflowProject): NodeWorkflowProjectRecord {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    state: validateState(row.state),
    lastActiveAt: row.lastActiveAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * All service entry points take the Clerk id (the same string that comes
 * from `auth().userId` in API routes). Each function ensures the user
 * exists in our DB before touching workflow rows — matches voice-card
 * service style so routes can stay 1-liners.
 */
export async function listNodeWorkflowProjectsForUser(
  clerkId: string,
): Promise<NodeWorkflowProjectRecord[]> {
  const user = await ensureUser(clerkId)
  const rows = await db.nodeWorkflowProject.findMany({
    where: { userId: user.id, isDeleted: false },
    orderBy: { lastActiveAt: 'desc' },
  })
  return rows.map(toRecord)
}

export async function getNodeWorkflowProject(
  clerkId: string,
  projectId: string,
): Promise<NodeWorkflowProjectRecord | null> {
  const user = await ensureUser(clerkId)
  const row = await db.nodeWorkflowProject.findFirst({
    where: { id: projectId, userId: user.id, isDeleted: false },
  })
  return row ? toRecord(row) : null
}

export async function createNodeWorkflowProject(
  clerkId: string,
  input: CreateNodeWorkflowProjectRequest,
): Promise<NodeWorkflowProjectRecord> {
  const user = await ensureUser(clerkId)
  const existingCount = await db.nodeWorkflowProject.count({
    where: { userId: user.id, isDeleted: false },
  })
  if (existingCount >= MAX_PROJECTS_PER_USER) {
    throw new NodeWorkflowProjectLimitError()
  }

  const row = await db.nodeWorkflowProject.create({
    data: {
      userId: user.id,
      name: input.name,
      state: toPrismaJson(input.state ?? EMPTY_STATE),
    },
  })
  return toRecord(row)
}

export async function updateNodeWorkflowProject(
  clerkId: string,
  projectId: string,
  input: UpdateNodeWorkflowProjectRequest,
): Promise<NodeWorkflowProjectRecord> {
  const user = await ensureUser(clerkId)
  const existing = await db.nodeWorkflowProject.findFirst({
    where: { id: projectId, userId: user.id, isDeleted: false },
  })
  if (!existing) {
    throw new NodeWorkflowProjectNotFoundError(projectId)
  }

  // ── 空覆盖闸 ────────────────────────────────────────────────────────────
  // `state` 是**整体替换**（没有 merge、没有 patch），所以一份空的 state 上来
  // 就足以把库里那份好副本抹平。客户端不一定知道自己手里那份是不是真的——
  // 服务端 list 请求失败后它会回落到 localStorage 的旧快照，而那份可能陈旧、
  // 可能只是浏览器刚清过站点数据后的空壳。
  //
  // 所以这里只认一种「空」：客户端明确说「是用户自己删空的」
  // （`allowEmptyState`，由 `useNodeWorkflow` 在亲眼看见「有节点 → 零节点」
  // 时带上来）。画布**没有**一键清空入口，清空只能一个个删节点，那条路全部
  // 经过客户端的记账点，所以合法清空不会被这条闸挡住。
  //
  // 没有这个标记的空 state 一律当成事故：**只跳过 state 这一个字段**，
  // name / lastActiveAt 照常写。故意不抛错——被拦下来意味着用户的数据是
  // 安全的，把它报成「保存失败」反而是假警报；真正需要看见它的是我们，
  // 所以走 logger.error。
  const existingNodeCount = validateState(existing.state).nodes.length
  const incomingNodeCount = input.state?.nodes.length ?? 0
  const refusesEmptyOverwrite =
    input.state !== undefined &&
    incomingNodeCount === 0 &&
    existingNodeCount > 0 &&
    input.allowEmptyState !== true

  if (refusesEmptyOverwrite) {
    logger.error('[node-workflow] refused an empty-state overwrite', {
      projectId,
      existingNodeCount,
      incomingNodeCount,
      incomingEdgeCount: input.state?.edges.length ?? 0,
    })
  }

  const row = await db.nodeWorkflowProject.update({
    where: { id: projectId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.state !== undefined && !refusesEmptyOverwrite
        ? { state: toPrismaJson(input.state) }
        : {}),
      lastActiveAt: new Date(),
    },
  })
  return toRecord(row)
}

export async function deleteNodeWorkflowProject(
  clerkId: string,
  projectId: string,
): Promise<void> {
  const user = await ensureUser(clerkId)
  const existing = await db.nodeWorkflowProject.findFirst({
    where: { id: projectId, userId: user.id, isDeleted: false },
  })
  if (!existing) {
    throw new NodeWorkflowProjectNotFoundError(projectId)
  }

  // Soft delete — same pattern as Project so we can audit/restore later if
  // a user complains. Cron-prune is a separate concern (TODO).
  await db.nodeWorkflowProject.update({
    where: { id: projectId },
    data: { isDeleted: true },
  })
}

/**
 * Bump lastActiveAt to "now" without touching state. Called when the user
 * switches to a different project — that project should become the
 * default-open one on next session.
 */
export async function touchNodeWorkflowProject(
  clerkId: string,
  projectId: string,
): Promise<void> {
  const user = await ensureUser(clerkId)
  const existing = await db.nodeWorkflowProject.findFirst({
    where: { id: projectId, userId: user.id, isDeleted: false },
  })
  if (!existing) {
    throw new NodeWorkflowProjectNotFoundError(projectId)
  }
  await db.nodeWorkflowProject.update({
    where: { id: projectId },
    data: { lastActiveAt: new Date() },
  })
}
