'use client'

import { useMemo } from 'react'
import { useEdges, useNodes } from '@xyflow/react'

import { resolveNodeDisplayName } from '@/lib/node-display-name'
import type { NodeWorkflowNode } from '@/types/node-workflow'

export interface DownstreamUse {
  /** 下游节点 id —— 点击时用它在画布上聚焦。 */
  nodeId: string
  /** 该节点的呈现类型，调用方拿它取类型名做兜底文案。 */
  type: string
  /** 用户起过的名字；从没命名过时是 `undefined`（`resolveNodeDisplayName` 不带兜底）。 */
  name: string | undefined
}

/**
 * 「这个节点**被谁用了**」—— 沿出边找下游。
 *
 * 契约 §2 槽 5 关系带的数据源。方向 E 把关系带扩到全族（账本 ⑧），
 * 而在此之前只有角色与背景两族手写过这段逻辑，其余八族**整族缺席** ——
 * 参考视频没有「哪个下游在参考我」（而它的 6 折价格事实正依赖这条边）、
 * 音色没有「哪个角色绑了我」、镜头图没有「哪条视频用了我」。
 *
 * ⚠ **按 target 去重。** 两份手写实现都是裸的 `edges.filter(e => e.source === id)`，
 * 同一对节点之间有两条边（例如一张图既做参考图又做首帧）就会出两颗一模一样的 chip。
 *
 * ⚠ 只认**边**。音色被角色绑定走的是数据字段不是边，参考视频被下游引用也可能不经边 ——
 * 那两族在各自的迁移片里用自己的字段反查填关系带槽，不要把第二种来源塞进这个 hook
 * （职责单一；若之后有三族以上需要字段反查，再考虑加第二个来源）。
 */
export function useDownstreamUses(nodeId: string): DownstreamUse[] {
  const nodes = useNodes<NodeWorkflowNode>()
  const edges = useEdges()

  return useMemo(() => {
    const seen = new Set<string>()
    const uses: DownstreamUse[] = []
    for (const edge of edges) {
      if (edge.source !== nodeId) continue
      // 自环：节点连到自己身上不算「被谁用」，否则关系带会把自己列进去。
      if (edge.target === nodeId) continue
      if (seen.has(edge.target)) continue
      const target = nodes.find((candidate) => candidate.id === edge.target)
      if (!target) continue
      seen.add(edge.target)
      uses.push({
        nodeId: target.id,
        type: target.type ?? '',
        name: resolveNodeDisplayName(target.data),
      })
    }
    return uses
  }, [edges, nodeId, nodes])
}
