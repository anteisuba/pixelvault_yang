/**
 * 边的**运行态**判据（S6e 之后这个文件只剩这一条）。
 *
 * ⚠ 旧的 `resolveNodeWorkflowEdgeVisual` / `isPendingSourceNode`（五档粗细 + 石绿
 * 显现 + 未就绪虚线）随 `NodeWorkflowStatusEdge` 一起删了：spec §1.13 把已连的线
 * 收成两档（1.5px 灰 / 悬停或端点选中 2px 黑），视觉全部落在 `.node-slot-edge`
 * 的 CSS 上，⛔ 不再有一份 TS 的视觉解析器。生成中的脉冲留着——所以这条判据留着。
 */

import {
  NODE_GENERATION_STATUS_IDS,
  NODE_STATUS_IDS,
} from '@/constants/node-types'

/** A node is "generating" when its run status or generation status is active. */
export function isNodeWorkflowGenerating(
  status: string | undefined,
  generationStatus: string | undefined,
): boolean {
  return (
    status === NODE_STATUS_IDS.running ||
    generationStatus === NODE_GENERATION_STATUS_IDS.pending
  )
}
