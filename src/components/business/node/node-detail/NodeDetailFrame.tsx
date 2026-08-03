'use client'

import type { ReactNode } from 'react'

import {
  NODE_DETAIL_SCROLL_SLOT_ORDER,
  NODE_DETAIL_SLOT_IDS,
  type NodeDetailScrollSlotId,
} from '@/constants/node-detail-slots'

import type { NodeDetailSlots } from './slots'

interface NodeDetailFrameProps {
  /**
   * 槽 1 · 身份条的**内容**（族牌 / 面包屑 / 标题 / 状态章 / 收起按钮）。
   * ⚠ 内容留在 `NodeDetailPanel` 里渲染，不搬进来 —— `closeButtonRef` 必须始终指向
   * 那颗真实的 `aria-label=close` 按钮，而它是壳的两条焦点回归锁的被测面
   * （`NodeDetailPanel.test.tsx` 的「数据变化不重夺焦点」与「换节点重新接管」）。
   * Frame 只拥有 `<header>` 这个壳与四段的次序。
   */
  identity: ReactNode
  slots: NodeDetailSlots
}

/**
 * 滚动区槽 id → 槽表字段。
 * 单独列出来是为了让「元组顺序」与「字段名」的对应关系只有一处，
 * 改槽序时不必同时改两个地方。
 */
const SCROLL_SLOT_CONTENT: Record<
  NodeDetailScrollSlotId,
  (slots: NodeDetailSlots) => ReactNode | undefined
> = {
  [NODE_DETAIL_SLOT_IDS.rack]: (s) => s.rack,
  [NODE_DETAIL_SLOT_IDS.desk]: (s) => s.desk,
  [NODE_DETAIL_SLOT_IDS.relations]: (s) => s.relations,
  [NODE_DETAIL_SLOT_IDS.evidence]: (s) => s.evidence,
}

/**
 * 详情面板的四段骨架（契约 §3，方向 E「静默」）：
 *
 * ```
 * 身份条   钉，不滚
 * 主体台   钉，不滚 —— 看图与改提示词永远同屏
 * 滚动区   素材架 → 编排台 → 关系带 → 证据抽屉
 * 动作坞   钉，通栏，在滚动区之外
 * ```
 *
 * ⚠ 滚动区严格按 `NODE_DETAIL_SCROLL_SLOT_ORDER` 这个元组 `map`，
 * **不迭代 `Object.keys(slots)`** —— 后者会把「槽序 = DOM 序 = 键盘序」这条不可推翻的
 * 契约交给十个族各自的字面量书写顺序，而且写错了没有任何东西会报错。
 * 方向 C 就是因为桌面 Tab 序跳成 3→5→2→4→6→7 被判出局。
 *
 * ⚠ 槽的渲染判据是 `!== undefined`，不是真值判断。`undefined` = 组级不适用（整栏不渲染），
 * 而「空但有位」必须传一个带空态文案的元素 —— 详见 `slots.ts` 的头注。
 */
export function NodeDetailFrame({ identity, slots }: NodeDetailFrameProps) {
  return (
    <>
      <header
        data-node-detail-slot={NODE_DETAIL_SLOT_IDS.identity}
        className="canvas-modal-divider canvas-object-studio-header flex items-center justify-between border-b"
      >
        {identity}
      </header>

      {slots.stage !== undefined ? (
        <div
          data-node-detail-slot={NODE_DETAIL_SLOT_IDS.stage}
          className="canvas-detail-stage-pin min-w-0"
        >
          {slots.stage}
        </div>
      ) : null}

      <div
        className="canvas-object-studio-body min-h-0 min-w-0 flex-1 overflow-y-auto"
        data-node-detail-body="true"
      >
        <div className="canvas-object-studio-content min-w-0">
          {NODE_DETAIL_SCROLL_SLOT_ORDER.map((slotId) => {
            const content = SCROLL_SLOT_CONTENT[slotId](slots)
            if (content === undefined) return null
            return (
              <div
                key={slotId}
                data-node-detail-slot={slotId}
                className="min-w-0"
              >
                {content}
              </div>
            )
          })}
        </div>
      </div>

      {slots.dock !== undefined ? (
        <div
          data-node-detail-slot={NODE_DETAIL_SLOT_IDS.dock}
          className="canvas-detail-dock min-w-0"
        >
          {slots.dock}
        </div>
      ) : null}

      {slots.overlays}
    </>
  )
}
