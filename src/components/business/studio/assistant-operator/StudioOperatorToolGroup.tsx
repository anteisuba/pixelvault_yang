'use client'

import { useId, useMemo, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import { ChevronRight } from '@/components/icons'
import {
  operatorThoughtSteps,
  type OperatorThoughtStep,
} from '@/lib/studio-operator-timeline'
import { cn } from '@/lib/utils'
import {
  ThoughtStepRow,
  ThoughtTrail,
  useElapsedSince,
} from '@/components/business/studio/assistant-operator/StudioOperatorThinkingRow'

/**
 * 并进这一行的那几段「想」（owner 10-30「只留『想了 N 秒』这一行」）：工具步前面那段只想没说的、
 * 后面那一跳（在想 / 想完开口）。`pendingSince` = 那一跳还在等第一个字。
 */
export interface StudioOperatorAbsorbedThought {
  thinking?: string
  thoughtMs?: number
  pendingSince?: number
}

interface StudioOperatorToolGroupProps {
  total: number
  failed: number
  skipped?: number
  running: boolean
  runningTitle?: string
  failure?: ReactNode
  /** 紧跟在这一行后面的那颗「撤销」（P5）—— 本轮最后一个工具块才有。 */
  trailing?: ReactNode
  /** 并进来的「想」：前面那段画在展开的步骤上面，后面那段画在下面。 */
  thoughtsBefore?: readonly StudioOperatorAbsorbedThought[]
  thoughtsAfter?: readonly StudioOperatorAbsorbedThought[]
  children: ReactNode
}

const NO_THOUGHTS: readonly StudioOperatorAbsorbedThought[] = []

function stepsOf(
  thoughts: readonly StudioOperatorAbsorbedThought[],
): OperatorThoughtStep[] {
  return thoughts.flatMap((item) =>
    item.thinking ? operatorThoughtSteps(item.thinking) : [],
  )
}

export function StudioOperatorToolGroup({
  total,
  failed,
  skipped = 0,
  running,
  runningTitle,
  failure,
  trailing,
  thoughtsBefore = NO_THOUGHTS,
  thoughtsAfter = NO_THOUGHTS,
  children,
}: StudioOperatorToolGroupProps) {
  const t = useTranslations('StudioOperator')
  const before = useMemo(() => stepsOf(thoughtsBefore), [thoughtsBefore])
  const after = useMemo(() => stepsOf(thoughtsAfter), [thoughtsAfter])
  /** 后面那一跳还在想（第一个字没到）：这一行接着写「正在想… N 秒」。 */
  const pending = thoughtsAfter.find((item) => item.pendingSince !== undefined)
  const elapsed = useElapsedSince(pending?.pendingSince)
  const live = running || Boolean(pending)
  const ticks = before.length + total + after.length
  const thoughtMs = [...thoughtsBefore, ...thoughtsAfter].reduce(
    (sum, item) => sum + (item.thoughtMs ?? 0),
    0,
  )
  const seconds = Math.round(thoughtMs / 1000)
  /**
   * 开合：默认收着，跑着也不自动展开（owner 10-30「只留『想了 N 秒』这一行」）；点了才展开。
   */
  const [userOpen, setUserOpen] = useState<boolean | null>(null)
  const open = userOpen ?? false
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
      {/* ── 过程一行（owner 10-30 合并）：「——— 想了 N 秒 ›  · 撤销」。前后那几段「想」并进来
          （短线 = 想的步数 + 做的步数），跑着写正在做的那一步，后一跳在想时写「正在想… N 秒」。
          没量到想了多久的退回「做了 N 步」。「撤销」紧跟在后（`trailing`）。
          ⚠ 跑着时写的是正在做的那一步的**人话动词**（面板按工具取，⛔ 不读模型
          起的标题），⛔ 不再挂转圈。
          ⚠ ⛔ 不是 live region：播报只走面板那一颗隐藏的 `role=status`（开始 /
          完成 / 停止 / 失败），每一步都念一遍是噪音。 */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
        <button
          type="button"
          data-testid="operator-tool-group-toggle"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setUserOpen(!open)}
          className="flex h-6 min-w-0 items-center gap-2 rounded-sm text-left transition-colors duration-fast ease-standard hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none"
        >
          <ThoughtTrail count={Math.max(ticks, 1)} live={live} />
          <span
            data-testid={
              live ? 'operator-tool-group-running' : 'operator-tool-group-title'
            }
            className={cn('min-w-0 truncate', live && 'assistant-shimmer-text')}
          >
            {running
              ? (runningTitle ?? t('toolGroup.running'))
              : pending
                ? (after.at(-1)?.title ?? t('streaming.thinking'))
                : seconds > 0
                  ? t('streaming.thought', { count: seconds })
                  : t('toolGroup.details', { count: total })}
          </span>
          {!running && pending && elapsed !== null ? (
            <span className="shrink-0 font-mono tabular-nums">
              {t('streaming.seconds', { count: Math.floor(elapsed / 1000) })}
            </span>
          ) : null}
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
              'size-3 shrink-0 transition-transform duration-fast ease-standard motion-reduce:transition-none',
              open && 'rotate-90',
            )}
            aria-hidden
          />
        </button>
        {trailing}
      </div>
      <div id={detailsId} hidden={!open}>
        {before.length ? (
          <ol data-testid="operator-tool-group-thoughts">
            {before.map((step, index) => (
              <ThoughtStepRow key={index} step={step} />
            ))}
          </ol>
        ) : null}
        <div className="mt-1.5 flex min-w-0 flex-col gap-1.5">{children}</div>
        {after.length ? (
          <ol data-testid="operator-tool-group-thoughts-after">
            {after.map((step, index) => (
              <ThoughtStepRow key={index} step={step} />
            ))}
          </ol>
        ) : null}
      </div>
    </div>
  )
}
