'use client'

import { useEffect, useState, type ReactNode } from 'react'

// R1 close-review 第三轮（owner 2026-07-19「收起也要平滑，而且不能闪一下」）：
// 详情原位展开/收起的平滑高度过渡宿主。
//
// - 展开：isExpanded→true 时本次渲染即挂载详情（0fr，0 高度但已在 DOM——
//   测试可同步命中已挂载按钮），下一帧置 1fr 触发 grid-rows 过渡平滑长出。
// - 收起：isExpanded→false 时先置回 0fr 播收起过渡，等 `transitionend`
//   （或兜底 timeout）后才卸载详情、换回未展开行——收起期间未展开行不会与
//   正在收缩的详情叠现，因此没有「闪一下」。
//
// 过渡形制（display:grid + grid-template-rows + overflow:hidden 子元素）由
// globals.css 的 `.lora-detail-reveal` 提供；reduced-motion 由 globals.css
// 末尾全局块把过渡降到近乎瞬时（transitionend 仍会触发，收起照常卸载）。

// 兜底卸载时长，略长于 CSS 过渡（300ms），保证真机 transitionend 正常时
// 先由它卸载、timeout 只在 transitionend 缺席（如 jsdom）时兜底。
const REVEAL_FALLBACK_MS = 340

interface LoraLibraryDetailRevealProps {
  isExpanded: boolean
  /** 未展开（收起完成）时渲染的紧凑行。 */
  row: ReactNode
  /** 展开时原位揭示的详情。 */
  detail: ReactNode
}

export function LoraLibraryDetailReveal({
  isExpanded,
  row,
  detail,
}: LoraLibraryDetailRevealProps) {
  const [mounted, setMounted] = useState(isExpanded)
  const [open, setOpen] = useState(isExpanded)
  const [prevExpanded, setPrevExpanded] = useState(isExpanded)

  // React 官方「渲染期根据 prop 变化调整 state」模式（非 effect，不触发
  // set-state-in-effect）：展开上升沿本次渲染即挂载详情且从 0fr 起步；收起
  // 下降沿把 open 置 false 播收起过渡，详情先保持挂载。
  if (prevExpanded !== isExpanded) {
    setPrevExpanded(isExpanded)
    if (isExpanded) {
      setMounted(true)
    }
    setOpen(false)
  }

  // effect 里只调度异步回调（rAF/timeout），不在 body 直接 setState：
  // - 展开：下一帧置 open=true 触发 grid-rows 0fr→1fr 过渡。
  // - 收起：过渡结束由 onTransitionEnd 卸载；这里挂兜底 timeout，覆盖
  //   transitionend 缺席（jsdom / 某些 reduced-motion 情况）。
  useEffect(() => {
    if (isExpanded) {
      const raf = requestAnimationFrame(() => setOpen(true))
      return () => cancelAnimationFrame(raf)
    }
    const timer = setTimeout(() => setMounted(false), REVEAL_FALLBACK_MS)
    return () => clearTimeout(timer)
  }, [isExpanded])

  if (!mounted) return <>{row}</>

  return (
    <div
      className="lora-detail-reveal"
      style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      onTransitionEnd={(event) => {
        if (event.propertyName === 'grid-template-rows' && !isExpanded) {
          setMounted(false)
        }
      }}
    >
      <div>{detail}</div>
    </div>
  )
}
