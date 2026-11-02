import 'server-only'

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { buildV3BackupKey } from '@/lib/node-workflow-migrate-v4'
import { uploadToR2 } from '@/services/storage/r2'
import type { NodeWorkflowV3BackupResult } from '@/types/node-workflow'

/**
 * 把一个项目的 v3 `state` 原样传上 R2（node-canvas-v2 §14.2 · owner 拍板「画-3」）。
 *
 * ⚠ **读原始 JSON，不过 v3 schema**：`getNodeWorkflowProject` 会把 state 过一遍
 * `NodeWorkflowStateDataSchema`，而备份要的正是「schema 看不见的那些坏形状」——
 * 过一遍 schema 的备份对不上原始数据，救不回来。
 *
 * ⛔ 失败就抛。调用方（惰性升级）**备份成功才允许写 v4**：静默失败等于用户的 v3
 * 图在下一次防抖写入时被 v4 覆盖且没有退路。
 *
 * ⚠ 归属校验走关系过滤而不是 `ensureUser`：批量回填脚本
 * （`scripts/migrate-node-workflow-v4.ts`）要在 Next 运行时之外调这个函数，而
 * `user.service` 的依赖链拽进 `next/navigation`，在 tsx 里加载不起来。用户不存在
 * 时关系过滤查不到行 —— 与「先 ensureUser 再按 userId 查」同样返回 null。
 */
export async function backupNodeWorkflowV3State(
  clerkId: string,
  projectId: string,
): Promise<NodeWorkflowV3BackupResult | null> {
  const row = await db.nodeWorkflowProject.findFirst({
    where: { id: projectId, user: { clerkId }, isDeleted: false },
    select: { id: true, state: true },
  })
  if (!row) return null

  const state = (row.state ?? {}) as {
    nodes?: unknown[]
    edges?: unknown[]
    version?: unknown
  }
  const key = buildV3BackupKey(projectId, new Date())
  const url = await uploadToR2({
    data: Buffer.from(JSON.stringify(state), 'utf8'),
    key,
    mimeType: 'application/json',
  })

  const result: NodeWorkflowV3BackupResult = {
    key,
    url,
    nodeCount: Array.isArray(state.nodes) ? state.nodes.length : 0,
    edgeCount: Array.isArray(state.edges) ? state.edges.length : 0,
  }
  logger.info('[node-workflow] v3 state backed up before v4 upgrade', {
    projectId,
    ...result,
  })
  return result
}
