'use client'

/**
 * **ToolGroup 折叠行**（§2.7 / §11.4）——连续的工具步收成一行「N 个操作 · 成功/失败」。
 *
 * ⭐ 方向 C 的全部意义就在这一颗上：**结果优先、过程自动折叠**。不收的话 20 行
 * 日志会把结论淹掉，而用户真正要读的是最后那两行。
 *
 * ⭐ 流式那一段**强制展开**（§3.1 ⑧）：正在跑的时候人是想看的；跑完停 1000ms
 * （`STUDIO_OPERATOR_TOOL_GROUP_COLLAPSE_MS`）再自己收起，标题换成「用时 Ns」。
 * ⛔ 不做「跑完立刻收」：那一瞬间的折叠会让用户以为刚才那几行是自己看花眼了。
 * ⚠ 用户**手动展开过**之后就不再自动收 —— 自动化压过一次显式意图，用户下次就
 * 不敢再点开了。
 *
 * ⚠ 无卡框（§11.4）：它是沟里的一行，不是一张卡。加了框就和确认卡 / 结果卡
 * 抢同一档视觉重量。
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { STUDIO_OPERATOR_TOOL_GROUP_COLLAPSE_MS } from '@/constants/studio-assistant-operator'
import { cn } from '@/lib/utils'

interface StudioOperatorToolGroupProps {
  /** 这一组里有几步。 */
  total: number
  /** 其中失败了几步 —— >0 时计数套 `text-status-risk`（§11.2 的 risk 分工）。 */
  failed: number
  /** 组里还有步在跑（流式）—— 为真时强制展开。 */
  running: boolean
  children: ReactNode
}

export function StudioOperatorToolGroup({
  total,
  failed,
  running,
  children,
}: StudioOperatorToolGroupProps) {
  const t = useTranslations('StudioOperator')
  /**
   * 展开与否是**派生的**，只有用户亲手点过之后才变成受控值。
   *
   * ⚠ ⛔ 不在 effect 里同步 `setOpen`（`react-hooks/set-state-in-effect`）：
   * 「跑着就展开」是一个能从 props 算出来的事实，写成级联渲染只会多一帧闪烁。
   * 唯一真正异步的那件事（1000ms 之后自己收起）才走 effect + timer。
   */
  const [manualOpen, setManualOpen] = useState<boolean | null>(null)
  /** 初值 = 挂载时就已经跑完的组直接收着（载回来的历史不该展开一屏日志）。 */
  const [autoCollapsed, setAutoCollapsed] = useState(!running)
  const [elapsedSeconds, setElapsedSeconds] = useState<number | null>(null)
  /** 这一组**曾经**跑过 —— 没跑过就没有「用时」可言。 */
  const sawRunningRef = useRef(running)
  // ⚠ 懒初始化：`useRef(Date.now())` 会在每次 render 都求值一次（react-hooks/purity）。
  const [startedAt] = useState(() => Date.now())

  const open = manualOpen ?? (running || !autoCollapsed)

  useEffect(() => {
    if (running) {
      sawRunningRef.current = true
      return
    }
    if (!sawRunningRef.current) return
    const timer = window.setTimeout(() => {
      setAutoCollapsed(true)
      setElapsedSeconds(
        Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
      )
    }, STUDIO_OPERATOR_TOOL_GROUP_COLLAPSE_MS)
    return () => window.clearTimeout(timer)
  }, [running, startedAt])

  const succeeded = total - failed

  return (
    <div data-testid="operator-tool-group" data-open={open ? 'true' : 'false'}>
      <button
        type="button"
        data-testid="operator-tool-group-toggle"
        aria-expanded={open}
        onClick={() => setManualOpen(!open)}
        className="flex w-full items-center gap-2 py-0.5 text-left transition-colors duration-(--duration-fast) ease-standard"
      >
        <span
          data-testid="operator-tool-group-title"
          className="min-w-0 truncate text-xs text-foreground"
        >
          {elapsedSeconds !== null && !running
            ? t('toolGroup.elapsed', { seconds: elapsedSeconds })
            : t('toolGroup.title', { count: total })}
        </span>
        <span className="shrink-0 font-mono text-3xs tracking-nav tabular-nums text-muted-foreground">
          {t('toolGroup.succeeded', { count: succeeded })}
        </span>
        {failed > 0 ? (
          <span
            data-testid="operator-tool-group-failed"
            className="shrink-0 font-mono text-3xs tracking-nav tabular-nums text-status-risk"
          >
            {t('toolGroup.failed', { count: failed })}
          </span>
        ) : null}
        <ChevronDown
          className={cn(
            'ml-auto size-3 shrink-0 text-muted-foreground transition-transform duration-(--duration-fast) ease-standard motion-reduce:transition-none',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>
      {/* 折叠：`grid-template-rows` 0fr↔1fr 配方（`ui-defaults.md §4`）。 */}
      <div
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-(--duration-base) ease-standard motion-reduce:transition-none',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          {/* 展开体缩进一级（§11.4）—— 一条 border 就够，⛔ 不再套一层底色块。 */}
          <div className="ml-3.5 mt-1.5 flex flex-col gap-1.5 border-l border-border pl-2.5">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
