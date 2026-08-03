'use client'

import { useId, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

interface EvidenceDrawerProps {
  /** 名词部分，如「发送预览」「拼成的提示词」。⚠ 这不是槽标题，是这一行按钮自己的文字。 */
  label: string
  /** 计数。`undefined` 时不渲染括号那段。 */
  count?: number
  /** 默认展开。⚠ 契约要求「这次真正会送出什么」在默认视图里看得见。 */
  defaultOpen?: boolean
  children: ReactNode
}

/**
 * 槽 6 · 证据抽屉 —— 「这次真正会送出什么？刚才为什么失败？有什么限制？」
 *
 * R1 的承载物是一行「名词 + 计数 + 箭头」：`发送预览 (6 项) ▾`。
 * 这一行**不是槽标题** —— 它是一个可点的东西，「组」在这里是行为不是文字。
 *
 * ⚠ 展开动画**不用 `grid-template-rows`**。画布域现有的 `.node-collapsible` 就是那么写的，
 * 而 `grid-template-rows` 是布局属性，违反项目自己的「合成层只动 transform/opacity」判据
 * （台账 §13.2）。这里用条件渲染 + opacity/transform 过渡：内容不在时不占位，
 * 在时淡入并轻微上移。
 *
 * ⚠ 收起 = 不可**操作**，不是不可**到达**。所以用条件渲染而不是 `inert` —— 收起时内容
 * 整个不在 DOM 里，键盘与屏读自然拿不到；展开后一切正常可达。
 * （旧实现相反：`.node-collapsible` 收起后仍可 Tab 进去并回车触发。）
 */
export function EvidenceDrawer({
  label,
  count,
  defaultOpen = true,
  children,
}: EvidenceDrawerProps) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex items-center gap-1.5 rounded-md text-xs font-medium text-node-muted outline-none transition-colors hover:text-node-foreground focus-visible:ring-2 focus-visible:ring-node-focus-ring/30"
      >
        <span>
          {label}
          {count === undefined ? null : ` (${count})`}
        </span>
        <ChevronDown
          aria-hidden
          className={`size-3.5 transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
        />
      </button>
      {open ? (
        <div
          id={panelId}
          className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1"
        >
          {children}
        </div>
      ) : null}
    </div>
  )
}
