'use client'

/**
 * **调查那一行**（56b 切片 2 · 画板 D56bUI「深入调查」四态）。
 *
 * ── 它替掉了什么 ────────────────────────────────────────────────
 * 深入调查此前要么没有形态、要么会变成一张常驻卡。owner 2026-09-19 改口：
 * **进度是加载态，不是常驻卡** —— 跑着的时候一行微光，跑完就收成灰底一行折在
 * 回答上方。一张常驻卡的问题是它跑完之后还在那儿占一整块，而那时唯一要读的
 * 东西是下面那段回答。
 *
 * ── 三态一颗组件 ────────────────────────────────────────────────
 *  · **跑着**：一行微光 + 「深入调查中 · 约 1 分钟」（预估写在行里）；
 *  · **点开**：就地展开步骤（`children` 是那几条日志），再点收起；
 *  · **跑完**：灰底一行「深入调查 · N 条 · 读了 M 页」/ 快搜同形状「搜了 N 条 ·
 *    读了 M 页」。
 *
 * ⛔ **不弹确认卡**（owner 定）：花的是搜索额度不是生成费。开跑前那句预估写在
 *    这一行里，而不是拦一道要人点的闸。
 * ⚠ 微光走 `animate-pulse` + `motion-reduce:animate-none`（`ui-defaults` 的现有
 *    配方，与占位脉冲同一支），⛔ 不为这一行新造一条渐变扫光的 keyframe。
 */

import { useId, useState, type ReactNode } from 'react'
import { ChevronDown, Check, Search } from '@/components/icons'
import { useTranslations } from 'next-intl'

import {
  ASSISTANT_RESEARCH_DEPTHS,
  ASSISTANT_RESEARCH_ESTIMATE_SECONDS,
  type AssistantResearchDepth,
} from '@/constants/assistant-operator'
import { cn } from '@/lib/utils'

interface StudioOperatorResearchProgressProps {
  depth: AssistantResearchDepth
  /** 这一组里还有步在跑 —— 微光那一档。 */
  running: boolean
  /** 查回来几条。 */
  found: number
  /** 读了几页全文（快搜是服务端读的，深档是模型自己发的 `read_url`）。 */
  readPages: number
  /** 失败摘要 —— 有就画在行上面（与 `StudioOperatorToolGroup` 同一处位置）。 */
  failure?: ReactNode
  /** 那几条日志 —— 点开才展开。 */
  children: ReactNode
}

/** 预估写成「约 N 秒」还是「约 N 分钟」——⛔ 不做倒计时（见常量头注）。 */
function estimateKey(depth: AssistantResearchDepth): {
  key: 'estimateSeconds' | 'estimateMinutes'
  value: number
} {
  const seconds = ASSISTANT_RESEARCH_ESTIMATE_SECONDS[depth]
  return seconds >= 60
    ? { key: 'estimateMinutes', value: Math.round(seconds / 60) }
    : { key: 'estimateSeconds', value: seconds }
}

export function StudioOperatorResearchProgress({
  depth,
  running,
  found,
  readPages,
  failure,
  children,
}: StudioOperatorResearchProgressProps) {
  const t = useTranslations('StudioOperator')
  const [open, setOpen] = useState(false)
  const detailsId = useId()
  const deep = depth === ASSISTANT_RESEARCH_DEPTHS.deep
  const estimate = estimateKey(depth)

  const label = running
    ? `${t(deep ? 'researchProgress.runningDeep' : 'researchProgress.runningQuick')} · ${t(
        `researchProgress.${estimate.key}`,
        { count: estimate.value },
      )}`
    : `${t(deep ? 'researchProgress.doneDeep' : 'researchProgress.doneQuick', {
        count: found,
      })} · ${t('researchProgress.readPages', { count: readPages })}`

  return (
    <div
      data-testid="operator-research-progress"
      data-depth={depth}
      data-state={running ? 'running' : 'done'}
      data-open={String(open)}
      className="min-w-0"
    >
      {/* 失败摘要照旧长在行上面 —— 它是那一刻唯一要读的东西。 */}
      {failure ? (
        <div
          data-testid="operator-research-progress-blocker"
          className="my-2 border-l-2 border-status-risk pl-3 text-2sm"
        >
          {failure}
        </div>
      ) : null}
      <button
        type="button"
        data-testid="operator-research-progress-toggle"
        aria-expanded={open}
        aria-controls={detailsId}
        {...(running ? { 'aria-busy': true } : {})}
        onClick={() => setOpen(!open)}
        className={cn(
          'flex min-h-9 w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs transition-colors duration-(--duration-fast) ease-standard focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none',
          running
            ? 'bg-muted/60 text-foreground animate-pulse motion-reduce:animate-none'
            : 'bg-muted text-muted-foreground hover:text-foreground',
        )}
      >
        {running ? (
          <Search className="size-3 shrink-0" aria-hidden />
        ) : (
          <Check className="size-3 shrink-0 text-status-applied" aria-hidden />
        )}
        <span
          data-testid="operator-research-progress-label"
          className="min-w-0 truncate"
        >
          {label}
        </span>
        <ChevronDown
          className={cn('ml-auto size-3 shrink-0', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      <div id={detailsId} hidden={!open}>
        <div className="mt-1 flex min-w-0 flex-col gap-2 border-l border-border pl-3">
          {children}
        </div>
      </div>
    </div>
  )
}
