'use client'

import { useState, type ComponentType } from 'react'
import {
  ChevronDown,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  CircleSlash,
  Minus,
  Search,
  TriangleAlert,
  ZapOff,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Spinner } from '@/components/ui/spinner'
import {
  RESEARCH_RUN_STATUSES,
  RESEARCH_SOURCE_STATUSES,
  type ResearchRunStatus,
  type ResearchSourceStatus,
} from '@/constants/research'
import { cn } from '@/lib/utils'
import type { ResearchReceipt, ResearchSourceReceipt } from '@/types/research'

import {
  RESEARCH_SOURCE_LABEL_KEYS,
  useResearchRun,
} from '@/components/business/prompts/ResearchRunEvidence'

/**
 * 检索回执卡（§3.5「检索卡四态 + 源级回执 chip」）。
 *
 * 四态：**检索中 / succeeded / no_evidence / failed**，外加 `quota_exceeded`。
 *
 * ⚠ 三条不许含糊的语义：
 *  1. **没有回执 ≠ `grounded:false`**。整体缺席表示这一轮根本没打源（关了，或
 *     规划器判定不需要）—— 那时**不渲染这张卡**，而不是渲染一张「未取得证据」。
 *  2. **`no_evidence` ≠ `failed`**。「打了没料」要告诉用户换关键词；「源全挂」
 *     要告诉用户这条路不通。两句话完全不同，合并等于让用户换关键词换到怀疑人生。
 *  3. **部分成功是常态**，所以源级 chip 一直在，不藏在展开态里 —— 单源静默失败
 *     是这条线明令禁止的。
 */

const STATUS_ICON: Record<
  ResearchRunStatus,
  ComponentType<{
    className?: string
  }>
> = {
  [RESEARCH_RUN_STATUSES.succeeded]: Search,
  [RESEARCH_RUN_STATUSES.noEvidence]: CircleSlash,
  [RESEARCH_RUN_STATUSES.failed]: TriangleAlert,
  [RESEARCH_RUN_STATUSES.quotaExceeded]: CircleAlert,
}

const STATUS_TONE: Record<ResearchRunStatus, string> = {
  [RESEARCH_RUN_STATUSES.succeeded]: 'text-status-applied',
  [RESEARCH_RUN_STATUSES.noEvidence]: 'text-muted-foreground',
  [RESEARCH_RUN_STATUSES.failed]: 'text-status-risk',
  [RESEARCH_RUN_STATUSES.quotaExceeded]: 'text-status-risk',
}

const STATUS_LABEL_KEYS: Record<ResearchRunStatus, string> = {
  [RESEARCH_RUN_STATUSES.succeeded]: 'research.statusSucceeded',
  [RESEARCH_RUN_STATUSES.noEvidence]: 'research.statusNoEvidence',
  [RESEARCH_RUN_STATUSES.failed]: 'research.statusFailed',
  [RESEARCH_RUN_STATUSES.quotaExceeded]: 'research.statusQuotaExceeded',
}

/** 状态说明。`succeeded` 没有说明 —— 成功不需要一句话解释自己。 */
const STATUS_HINT_KEYS: Partial<Record<ResearchRunStatus, string>> = {
  [RESEARCH_RUN_STATUSES.noEvidence]: 'research.noEvidenceNextSteps',
  [RESEARCH_RUN_STATUSES.failed]: 'research.failedHint',
  [RESEARCH_RUN_STATUSES.quotaExceeded]: 'research.quotaHint',
}

const SOURCE_STATUS_ICON: Record<
  ResearchSourceStatus,
  ComponentType<{ className?: string }>
> = {
  [RESEARCH_SOURCE_STATUSES.ok]: CircleCheck,
  [RESEARCH_SOURCE_STATUSES.empty]: Minus,
  [RESEARCH_SOURCE_STATUSES.failed]: TriangleAlert,
  [RESEARCH_SOURCE_STATUSES.circuitOpen]: ZapOff,
  [RESEARCH_SOURCE_STATUSES.skipped]: CircleSlash,
}

/**
 * ⚠ 颜色只上**图标**，标签文字一律 `text-foreground`。
 *
 * 三个理由：① 图标是图形，3:1 就够，而 2xs 的文字要 4.5:1；② 「越来越淡的灰
 * 表示越不好」这条路算过不通（最浅一档 2.81:1）；③ 一排彩色小字会把卡片变成
 * 圣诞树，而这卡的主角是源名和条数。
 */
const SOURCE_STATUS_TONE: Record<ResearchSourceStatus, string> = {
  [RESEARCH_SOURCE_STATUSES.ok]: 'text-status-applied',
  [RESEARCH_SOURCE_STATUSES.empty]: 'text-muted-foreground',
  [RESEARCH_SOURCE_STATUSES.failed]: 'text-status-risk',
  [RESEARCH_SOURCE_STATUSES.circuitOpen]: 'text-status-risk',
  [RESEARCH_SOURCE_STATUSES.skipped]: 'text-muted-foreground',
}

const SOURCE_STATUS_LABEL_KEYS: Record<ResearchSourceStatus, string> = {
  [RESEARCH_SOURCE_STATUSES.ok]: 'research.sourceOk',
  [RESEARCH_SOURCE_STATUSES.empty]: 'research.sourceEmpty',
  [RESEARCH_SOURCE_STATUSES.failed]: 'research.sourceFailed',
  [RESEARCH_SOURCE_STATUSES.circuitOpen]: 'research.sourceCircuitOpen',
  [RESEARCH_SOURCE_STATUSES.skipped]: 'research.sourceSkipped',
}

function SourceChip({ entry }: { entry: ResearchSourceReceipt }) {
  const t = useTranslations('PromptAssistant')
  const Icon = SOURCE_STATUS_ICON[entry.status]
  const label = t(RESEARCH_SOURCE_LABEL_KEYS[entry.sourceId])
  const statusLabel = t(SOURCE_STATUS_LABEL_KEYS[entry.status])

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-1.5 py-0.5 text-2xs text-foreground"
      title={
        entry.error ? `${label} · ${statusLabel} · ${entry.error}` : undefined
      }
    >
      <Icon
        className={cn('size-3 shrink-0', SOURCE_STATUS_TONE[entry.status])}
      />
      <span>{label}</span>
      {/* 状态词给读屏，视觉上由图标承担 —— 一排 chip 每个都写「成功/为空」
          会把这一行撑成两行，而这一行的价值恰恰是一眼扫完。 */}
      <span className="sr-only">{statusLabel}</span>
      {entry.status === RESEARCH_SOURCE_STATUSES.ok && entry.count > 0 ? (
        <span className="tabular-nums text-muted-foreground">
          {entry.count}
        </span>
      ) : null}
      {entry.via ? (
        <span
          className="rounded-sm bg-secondary px-1 text-2xs font-medium text-foreground"
          title={entry.via}
        >
          {t('research.viaFallback')}
        </span>
      ) : null}
    </span>
  )
}

export interface ResearchReceiptCardProps {
  /**
   * 当轮回执（响应头解出来的）。**历史消息没有这个** —— 那时只有 `runId`，
   * 卡片走懒加载水合。
   */
  receipt?: ResearchReceipt
  /** `ResearchRun.id`。`quota_exceeded` 没有 run 行，所以它可以缺席。 */
  runId?: string
  /**
   * 「检索中」过渡态：请求已发出、回执还没到。
   * ⚠ 只有 `forced` 档才给得出这个态 —— `auto` 档要不要打源由服务端当轮决定，
   * 客户端在响应头到达前无从得知（见 `use-prompt-assistant` 的 `researchPending`）。
   */
  pending?: boolean
}

export function ResearchReceiptCard({
  receipt,
  runId,
  pending = false,
}: ResearchReceiptCardProps) {
  const t = useTranslations('PromptAssistant')
  const [expanded, setExpanded] = useState(false)
  // 历史消息（无 receipt）才需要拉；有 receipt 的当轮一个请求都不发。
  const needsHydration = !receipt && Boolean(runId)
  const { detail, status: loadStatus } = useResearchRun(
    runId,
    needsHydration && expanded,
  )

  if (pending && !receipt) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-2.5 py-1.5 text-xs text-foreground">
        <Spinner size="sm" />
        {t('research.searching')}
      </div>
    )
  }

  // 本轮没检索 —— 什么都不画。⚠ 这不是 `grounded:false`，别拿一张
  // 「未取得联网证据」去表达「压根没打算联网」。
  if (!receipt && !runId) return null

  // ── 历史消息：收起时只有一行入口，展开才 fetch ──────────────────
  if (!receipt) {
    return (
      <div className="rounded-xl border border-border bg-card px-2.5 py-1.5">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="flex w-full items-center gap-1.5 text-xs text-foreground"
        >
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="flex-1 text-left">{t('research.historyLabel')}</span>
          {expanded ? (
            <ChevronUp className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          )}
        </button>
        {expanded ? (
          loadStatus === 'ready' && detail ? (
            <ReceiptBody
              status={detail.status}
              grounded={detail.grounded}
              perSource={detail.perSource}
              queries={[]}
              runQuery={detail.query}
              evidenceCount={detail.evidence.length}
              expanded
            />
          ) : loadStatus === 'error' ? (
            <p className="pt-1.5 text-2xs text-status-risk">
              {t('research.loadFailed')}
            </p>
          ) : (
            <p className="flex items-center gap-2 pt-1.5 text-2xs text-muted-foreground">
              <Spinner size="sm" />
              {t('research.loading')}
            </p>
          )
        ) : null}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card px-2.5 py-1.5">
      <ReceiptBody
        status={receipt.status}
        grounded={receipt.grounded}
        perSource={receipt.perSource}
        queries={receipt.queries}
        evidenceCount={receipt.evidenceCount}
        expanded={expanded}
        onToggle={() => setExpanded((value) => !value)}
      />
    </div>
  )
}

function ReceiptBody({
  status,
  grounded,
  perSource,
  queries,
  runQuery,
  evidenceCount,
  expanded,
  onToggle,
}: {
  status: ResearchRunStatus
  grounded: boolean
  perSource: ResearchSourceReceipt[]
  queries: string[]
  runQuery?: string
  evidenceCount: number
  expanded: boolean
  onToggle?: () => void
}) {
  const t = useTranslations('PromptAssistant')
  const StatusIcon = STATUS_ICON[status]
  const hintKey = STATUS_HINT_KEYS[status]
  const failedSources = perSource.filter((entry) => entry.error)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs">
        <StatusIcon className={cn('size-3.5 shrink-0', STATUS_TONE[status])} />
        <span className="font-medium text-foreground">
          {t(STATUS_LABEL_KEYS[status])}
        </span>
        {evidenceCount > 0 ? (
          <span className="text-muted-foreground">
            {t('research.evidenceCount', { count: evidenceCount })}
          </span>
        ) : null}
        {/* grounded badge：`no_evidence` / `failed` 时明示「未取得联网证据」。
            ⚠ 这句话只在**打过源**时才成立，所以它长在回执卡里而不是全局。 */}
        {!grounded ? (
          <span className="rounded-full border border-border px-1.5 py-0.5 text-2xs font-medium text-foreground">
            {t('research.notGrounded')}
          </span>
        ) : null}
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={t(expanded ? 'research.collapse' : 'research.expand')}
            className="ml-auto text-muted-foreground hover:text-foreground"
          >
            {expanded ? (
              <ChevronUp className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
          </button>
        ) : null}
      </div>

      {perSource.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {perSource.map((entry) => (
            <SourceChip key={entry.sourceId} entry={entry} />
          ))}
        </div>
      ) : null}

      {/* 出问题的三态各自带下一步话术 —— 不藏在展开态里。「没搜到」不给方向，
          用户就只会一遍遍换词。 */}
      {hintKey ? (
        <p className="text-2xs leading-4 text-muted-foreground">{t(hintKey)}</p>
      ) : null}

      {expanded ? (
        <div className="space-y-1.5 border-t border-border/60 pt-1.5">
          {queries.length > 0 ? (
            <div className="space-y-0.5">
              <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('research.queriesLabel')}
              </p>
              <ul className="space-y-0.5">
                {queries.map((query) => (
                  <li key={query} className="text-2xs text-foreground">
                    {query}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* ⚠ 规划器那 2–3 条查询**没有落库**（`ResearchRun` 只有用户原问题），
              所以历史消息展开时给的是原问题，不是查询清单 —— 造一个假的查询
              清单比少一块信息坏得多。 */}
          {queries.length === 0 && runQuery ? (
            <div className="space-y-0.5">
              <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('research.runQueryLabel')}
              </p>
              <p className="text-2xs text-foreground">{runQuery}</p>
            </div>
          ) : null}

          {failedSources.length > 0 ? (
            <ul className="space-y-0.5">
              {failedSources.map((entry) => (
                <li key={entry.sourceId} className="text-2xs text-status-risk">
                  {t(RESEARCH_SOURCE_LABEL_KEYS[entry.sourceId])}: {entry.error}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
