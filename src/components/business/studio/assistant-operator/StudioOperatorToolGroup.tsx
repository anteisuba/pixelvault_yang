'use client'

import { useId, useState, type ReactNode } from 'react'
import { ChevronRight } from '@/components/icons'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'

interface StudioOperatorToolGroupProps {
  total: number
  failed: number
  skipped?: number
  running: boolean
  runningTitle?: string
  failure?: ReactNode
  /** 紧跟在这一行后面的那颗「撤销」（P5）—— 本轮最后一个工具块才有。 */
  trailing?: ReactNode
  children: ReactNode
}

export function StudioOperatorToolGroup({
  total,
  failed,
  skipped = 0,
  running,
  runningTitle,
  failure,
  trailing,
  children,
}: StudioOperatorToolGroupProps) {
  const t = useTranslations('StudioOperator')
  const [open, setOpen] = useState(false)
  const detailsId = useId()

  return (
    <div
      data-testid="operator-tool-group"
      data-open={String(open)}
      className="min-w-0"
    >
      {/* ── 失败说人话（D12 S10 / C11）：细风险左边条 + 一句，技术细节在「做了 N
          步」展开里。⚠ 跑着时不画：那一步可能下一刻就换条路成功了。 */}
      {!running && failure ? (
        <div
          data-testid="operator-tool-group-blocker"
          className="mb-1.5 border-l-2 border-status-risk/70 pl-2.5 text-sm leading-relaxed"
        >
          {failure}
        </div>
      ) : null}
      {/* ── 过程一行（D12 A · C3 / C4 / P5）：「做了 N 步 · 改了 X ▸ · 撤销」。
          ⭐ 四种记录皮统一成这一种 12 号灰字；「撤销」紧跟在后（`trailing`）。
          ⚠ 跑着时写的是正在做的那一步，⛔ 不再挂转圈。 */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
        <button
          type="button"
          data-testid="operator-tool-group-toggle"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen(!open)}
          className="flex min-w-0 items-center gap-1.5 rounded-sm text-left transition-colors duration-(--duration-fast) ease-standard hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none"
        >
          <span
            data-testid={
              running
                ? 'operator-tool-group-running'
                : 'operator-tool-group-title'
            }
            {...(running ? { role: 'status' } : {})}
            className="min-w-0 truncate"
          >
            {running
              ? (runningTitle ?? t('toolGroup.running'))
              : t('toolGroup.details', { count: total })}
          </span>
          {failed > 0 ? (
            <span data-testid="operator-tool-group-failed">
              · {t('toolGroup.failed', { count: failed })}
            </span>
          ) : null}
          {skipped > 0 ? (
            <span data-testid="operator-tool-group-skipped">
              · {t('toolGroup.skipped', { count: skipped })}
            </span>
          ) : null}
          <ChevronRight
            className={cn(
              'size-3 shrink-0 transition-transform duration-(--duration-fast) ease-standard motion-reduce:transition-none',
              open && 'rotate-90',
            )}
            aria-hidden
          />
        </button>
        {trailing}
      </div>
      <div id={detailsId} hidden={!open}>
        <div className="mt-1.5 flex min-w-0 flex-col gap-1.5">{children}</div>
      </div>
    </div>
  )
}
