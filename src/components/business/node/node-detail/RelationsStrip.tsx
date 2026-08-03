'use client'

import type { ReactNode } from 'react'

import type { DownstreamUse } from '@/hooks/node/use-downstream-uses'
import { useFocusCanvasNode } from '@/hooks/node/use-focus-canvas-node'

interface RelationsStripProps {
  /** 下游用途。空数组 = 「有这件事，只是现在没有」→ 渲染 `emptyLabel`，**不消失**。 */
  uses: DownstreamUse[]
  /** 空态那一行灰字。必给 —— 关系带不允许整族缺席，空也要有话说。 */
  emptyLabel: string
  /** 把 use 变成 chip 上的文字（各族自己决定兜底用哪个类型名）。 */
  labelOf: (use: DownstreamUse) => string
  /** chip 的无障碍名模板（各族自己的 i18n）。 */
  ariaOf: (label: string) => string
  /** 本族在「出去的关系」里额外要放的东西（如角色族的卡库 / 绑定音色）。排在 chip 之前。 */
  leading?: ReactNode
}

/**
 * 槽 5 · 关系带 —— 「这个节点绑了谁，又**被哪些节点用**」。
 *
 * ⚠ **不渲染标题**（契约 R1「一级面零标题预算」）。此前角色族的出演区顶着一行
 * 「出演」小标题，那是十族里唯一做出来的关系带，也是 R1 要删的那类槽标题。
 * 槽的边界由留白与位置表达，不由文字。
 *
 * ⚠ **空态渲染一行灰字，不是不渲染。** 「关系带必须全族出现（可为空但要有位）」
 * 是已拍板契约。原型阶段对散图族写过 `return ''`，把关系带整族抹掉，而其余四族
 * 都留了一行 —— 同一条规则在新旧族上分岔，正是这条组件签名要堵的：`emptyLabel`
 * 必填，想让整槽消失只能在族那一层显式传 `undefined` 给槽表。
 */
export function RelationsStrip({
  uses,
  emptyLabel,
  labelOf,
  ariaOf,
  leading,
}: RelationsStripProps) {
  const focusCanvasNode = useFocusCanvasNode()

  return (
    <div className="space-y-2">
      {leading}
      {uses.length === 0 ? (
        <p className="text-xs leading-5 text-node-muted">{emptyLabel}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {uses.map((use) => {
            const label = labelOf(use)
            return (
              <button
                key={use.nodeId}
                type="button"
                onClick={() => focusCanvasNode(use.nodeId)}
                aria-label={ariaOf(label)}
                title={ariaOf(label)}
                className="rounded-full border border-node-edge px-2.5 py-1 text-2xs font-medium text-node-foreground transition-colors hover:bg-node-panel-inner"
              >
                {label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
