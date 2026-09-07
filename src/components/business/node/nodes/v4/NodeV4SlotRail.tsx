'use client'

/**
 * 槽轨（node-canvas-v2 §3.2）。
 *
 * 从 `MediaNodeV4` 里拆出来的**共享**件：image / audio / video 三类用的是同一份
 * 「按端口表逐槽渲染 `NodeV4SlotCard`」逻辑。⛔ 不在各卡里各抄一份——端口表加一
 * 个槽的时候，那会变成三处要改。
 *
 * 两种朝向（HIG 定稿 2026-09-08）：
 * - `vertical` = 收起态左缘那一列（形态不动）。
 * - `horizontal` = 展开态卡内的一条横轨。480 − 32 内距 = **448 可用**，槽卡
 *   `slotCardWidth` + `slotCardGap` ⇒ 一屏 4 格整齐、第 5 格露 24px——露出的那
 *   24px 本身就是「还有」的提示，所以 `video.shot` 的五槽既不换行也不缩字。
 *   ⚠ 卡宽变了就要回头核这条算术，⛔ 不要靠 `flex-wrap` 兜。
 */

import { getNodeV4Ports } from '@/constants/node-slots'
import { NODE_V4_CARD } from '@/constants/node-studio'
import { cn } from '@/lib/utils'
import type { NodeV4 } from '@/types/node-workflow'

import { NodeV4SlotCard } from './NodeV4SlotCard'

export function NodeV4SlotRail({
  node,
  orientation = 'vertical',
}: {
  node: NodeV4
  orientation?: 'vertical' | 'horizontal'
}) {
  const ports = getNodeV4Ports(node.data.kind, node.data.subtype)
  if (!ports || ports.inputs.length === 0) return null
  const horizontal = orientation === 'horizontal'
  return (
    <div
      data-slot-rail={orientation}
      style={horizontal ? { gap: NODE_V4_CARD.slotCardGap } : undefined}
      className={cn(
        horizontal
          ? // `nowheel`：横轨要自己吃掉滚轮，否则滚轨等于缩放画布。
            'nowheel flex snap-x snap-proximity overflow-x-auto scroll-smooth pb-1'
          : 'flex flex-col gap-1',
      )}
    >
      {ports.inputs.map((spec) => (
        <NodeV4SlotCard
          key={spec.slot}
          nodeId={node.id}
          slot={spec.slot}
          binding={node.data.slots?.[spec.slot]}
          layout={orientation}
        />
      ))}
    </div>
  )
}
