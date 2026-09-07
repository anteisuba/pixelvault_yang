'use client'

/**
 * 展开态左缘的槽格列（node-canvas-v2 §3.2）。
 *
 * 从 `MediaNodeV4` 里拆出来的**共享**件：image / audio / video 三类展开态用的是
 * 同一份「按端口表逐槽渲染 `NodeV4SlotCard`」逻辑。⛔ 不在各卡里各抄一份——
 * 端口表加一个槽的时候，那会变成三处要改。
 */

import { getNodeV4Ports } from '@/constants/node-slots'
import type { NodeV4 } from '@/types/node-workflow'

import { NodeV4SlotCard } from './NodeV4SlotCard'

export function NodeV4SlotRail({ node }: { node: NodeV4 }) {
  const ports = getNodeV4Ports(node.data.kind, node.data.subtype)
  if (!ports || ports.inputs.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      {ports.inputs.map((spec) => (
        <NodeV4SlotCard
          key={spec.slot}
          nodeId={node.id}
          slot={spec.slot}
          binding={node.data.slots?.[spec.slot]}
        />
      ))}
    </div>
  )
}
