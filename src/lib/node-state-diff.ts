/**
 * 两份画布 state 之间**哪些卡变了**（docs/references/mcp.md §6）：外部改动换进来
 * 之后闪的就是这些。纯函数。
 *
 * ⚠ 按内容比而不是按引用：换进来的那一份是服务端重新解析出来的，每张卡都是新对象。
 * 删掉的卡不在结果里 —— 闪一张已经不在的卡没有意义。
 */

import type { NodeWorkflowStateV4 } from '@/types/node-workflow'

export function changedNodeIds(
  before: NodeWorkflowStateV4,
  after: NodeWorkflowStateV4,
): string[] {
  const previous = new Map(before.nodes.map((node) => [node.id, node]))
  return after.nodes
    .filter((node) => {
      const old = previous.get(node.id)
      if (!old) return true
      return old !== node && JSON.stringify(old) !== JSON.stringify(node)
    })
    .map((node) => node.id)
}
