/**
 * **只重跑下游**的拓扑（第三期，owner 2026-09-07 定）——纯函数。
 *
 * ── 它解决的是什么 ────────────────────────────────────────────────
 * 用户在画布上换掉了第 02 镜的首帧。今天要么手动逐个点重跑（漏一个就得到一份
 * 前后不一致的成片），要么整张图重来（上游那几张一模一样的图再花一次钱）。
 * Krea 的 Nodes Agent 是唯一做对这件事的（`competitor-assistants.md`）：改一个
 * 节点，只重跑受影响的后继闭包，上游走缓存。
 *
 * ── 三条判据 ────────────────────────────────────────────────────
 * ① **上下游只由具名槽边定义**（`NodeWorkflowEdgeV4.source → target`）。⛔ 不看
 *    坐标、不看镜号、不看谁先被创建 —— 那三样都能被用户随手改掉，而依赖关系
 *    不会因为拖了一下卡片就变。
 * ② **不含起点**：用户改的就是那一个，重跑它等于把他刚换上去的东西盖掉。要连
 *    自己一起跑的调用方自己把它加回去（那是一个不同的意图，应当写在调用点上）。
 * ③ **环安全**：v4 的图理论上是 DAG，但边表是用户与助手一起写的，一条回连就能
 *    让朴素递归无限展开。`seen` 是硬要求，不是防御性编程。
 *
 * ⚠ 返回**广度优先的顺序**：那正是重跑要用的顺序（近的先跑，远的等它的上游落
 * 下来）。⛔ 别返回 `Set`：调用方要拿它按顺序发 op，而 Set 的迭代序是插入序 ——
 * 能用，但它没有把「这是顺序」写进类型里。
 */

import type { NodeWorkflowEdgeV4 } from '@/types/node-workflow'

/**
 * 从 `nodeId` 出发，沿具名槽边能走到的**全部后继**。
 *
 * ⚠ 汇合点只出现一次（`seen`），且落在**第一次**到达它的那一层：A→C、B→C 且
 * A 是起点时，C 排在第一层 —— 它确实只等 A 那一个上游变了。
 */
export function collectDownstream(
  nodeId: string,
  edges: readonly NodeWorkflowEdgeV4[],
): string[] {
  /**
   * 邻接表**先建一次**，⛔ 不在每一层里重扫整张边表：一张 200 边的图里那是
   * O(n²)，而这个函数会在右键菜单打开的那一帧里跑。
   */
  const bySource = new Map<string, string[]>()
  for (const edge of edges) {
    if (edge.source === edge.target) continue
    const list = bySource.get(edge.source)
    if (list) list.push(edge.target)
    else bySource.set(edge.source, [edge.target])
  }

  const seen = new Set<string>([nodeId])
  const order: string[] = []
  let frontier: string[] = [nodeId]

  while (frontier.length > 0) {
    const next: string[] = []
    for (const current of frontier) {
      for (const target of bySource.get(current) ?? []) {
        if (seen.has(target)) continue
        seen.add(target)
        order.push(target)
        next.push(target)
      }
    }
    frontier = next
  }

  return order
}
