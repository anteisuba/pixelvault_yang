import 'server-only'

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { ensureUser } from '@/services/user.service'
import { MCP_ACTIVE_WINDOW_MS } from '@/constants/mcp'
import type { ProjectFollowStatus } from '@/types/mcp'

/**
 * 开着的画布跟上外部改动（`docs/references/mcp.md` §6）：只回版本号和「Claude 是否
 * 正在剪」这两样，⛔ 不回整份 state —— 这个口每 2～30 秒被问一次。
 *
 * 「是不是 Claude 改的」不另存一列：令牌 2 分钟内用过 = Claude 在线，这期间别处来
 * 的改动就当作它的。代价是那段时间里另一个标签页的改动也会被这么说 —— 只影响回执
 * 措辞；换来的是不改画布项目表（本地 dev 连的就是生产库，加列要先动生产库）。
 */
export async function getProjectFollowStatus(
  clerkId: string,
  projectId: string,
  now: Date = new Date(),
): Promise<ProjectFollowStatus | null> {
  const user = await ensureUser(clerkId)
  const project = await db.nodeWorkflowProject.findFirst({
    where: { id: projectId, userId: user.id, isDeleted: false },
    select: { updatedAt: true },
  })
  if (!project) return null

  let mcpActive = false
  try {
    const recent = await db.mcpToken.count({
      where: {
        userId: user.id,
        revokedAt: null,
        lastUsedAt: { gte: new Date(now.getTime() - MCP_ACTIVE_WINDOW_MS) },
      },
    })
    mcpActive = recent > 0
  } catch (error) {
    // ⚠ 只影响轮询快慢与回执措辞，⛔ 不因它让版本号也拿不到 —— 跟随其余部分照常。
    logger.warn('[mcp-follow] could not read token activity', {
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return { updatedAt: project.updatedAt.toISOString(), mcpActive }
}
