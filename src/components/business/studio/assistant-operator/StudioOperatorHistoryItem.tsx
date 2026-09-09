'use client'
import { StudioOperatorReferenceAnalysisCard } from './StudioOperatorReferenceAnalysisCard'

/**
 * 一条**只读历史**（P4-B）。
 *
 * ⭐ 它与 `StudioOperatorLogItem` / `StudioOperatorCritiqueCard` 是两颗组件，
 * 不是一颗组件的两个模式 —— 因为它收的是另一个类型：`StudioOperatorHistoryEntry`
 * 里没有 `inverse`、没有 `payload`、没有 `runKey`。于是「历史里冒出一颗点了会做
 * 错事的撤销钮 / 还原钮」在这颗组件里**写不出来**，不是靠一个 `readonly` 旗标
 * 拦着。同一条论据见 `types/studio-operator-history.ts` 的头注。
 *
 * ⚠ 正文**无气泡、无边框、无底色**（2026-09-06 面板轮，第 4 件）：历史与实时线程
 * 是同一条会话的昨天与今天，气泡只出现在其中一半的下场是「刷新之后我的话换了个
 * 样子」。两方靠头像与节点形状分（时间线沟本来就分得出来），⛔ 不靠色块分。
 *
 * ⚠ 「已撤销」的划线**留着**（那是历史事实），可点的撤销钮不留。
 * ⚠ 缩略图仍可点开灯箱：看大图是只读动作，不改任何东西。
 */

import {
  AlertTriangle,
  Check,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'

import {
  ASSISTANT_OPERATOR_VERDICT_SEVERITY_IDS as SEVERITY,
  type AssistantOperatorTool,
} from '@/constants/assistant-operator'
import { openOperatorLightbox } from '@/components/business/studio/assistant-operator/StudioOperatorLightbox'
import { OPERATOR_TOOL_ICONS } from '@/components/business/studio/assistant-operator/StudioOperatorLogItem'
import { StudioOperatorCollapsibleText } from '@/components/business/studio/assistant-operator/StudioOperatorMessageBody'
import { cn } from '@/lib/utils'
import type {
  StudioOperatorHistoryEntry,
  StudioOperatorHistoryStep,
} from '@/types/studio-operator-history'

interface StudioOperatorHistoryItemProps {
  entry: StudioOperatorHistoryEntry
}

export function StudioOperatorHistoryItem({
  entry,
}: StudioOperatorHistoryItemProps) {
  const t = useTranslations('StudioOperator')

  switch (entry.kind) {
    case 'user':
      return (
        <div className="flex flex-col gap-1">
          <p className="whitespace-pre-wrap text-md font-medium leading-relaxed text-foreground">
            {entry.text}
          </p>
          {entry.attachments.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {entry.attachments.map((attachment) => (
                <span
                  key={attachment.id}
                  className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-2sm text-muted-foreground"
                >
                  {attachment.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      )
    case 'message':
      return (
        /* ⚠ 长回话的折叠**与实时线程共用一颗组件**（2026-09-07 真机）：历史里
           一条 8 行的正文此前整条铺开，既没有折叠开关也没有那颗测试锚 ——
           而历史恰恰是最需要折的地方（几十轮堆在一起）。 */
        <div className="flex min-w-0 flex-col gap-1">
          <StudioOperatorCollapsibleText text={entry.text} plain />
        </div>
      )
    case 'plan':
      return (
        /* 计划折成一行「计划 · N 步」（第 2 件）——与实时线程同一个形状：
           历史里换个样子，用户会以为那是另一种东西。 */
        <details data-testid="operator-history-plan" className="min-w-0">
          <summary className="cursor-pointer list-none py-0.5 text-2sm text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
            {t('planFold', { count: entry.steps.length })}
          </summary>
          <ol className="mt-1 flex flex-col gap-1 border-l border-border pl-2.5">
            {entry.steps.map((step, index) => (
              <li
                key={step}
                className="flex items-baseline gap-2 text-md text-foreground"
              >
                <span className="shrink-0 font-mono text-xs tracking-nav tabular-nums text-muted-foreground">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="min-w-0">{step}</span>
              </li>
            ))}
          </ol>
        </details>
      )
    case 'step':
      return entry.referenceAnalysis ? (
        <StudioOperatorReferenceAnalysisCard
          analysis={entry.referenceAnalysis}
        />
      ) : entry.critique ? (
        <HistoryCritiqueCard entry={entry} />
      ) : (
        <HistoryStepRow entry={entry} />
      )
    case 'system':
      return (
        <p
          data-testid="operator-history-system-line"
          className="mx-auto rounded-full border border-dashed border-border px-3 py-1 text-2sm text-muted-foreground"
        >
          {/* ⚠ 与线程里那条同一套词条与同一条 subject 规矩（`revertField` 存的是
              字段 id，要过词表；`undoStep` 存的是模型写的标题，原样用）。 */}
          {t(`system.${entry.code}`, {
            subject:
              entry.code === 'revertField' && entry.subject
                ? t(`field.${entry.subject}`)
                : entry.code === 'videoFramesFailed' && entry.subject
                  ? t(`videoFrameCaptureReason.${entry.subject}`)
                  : (entry.subject ?? ''),
            count: entry.count ?? 0,
          })}
        </p>
      )
    case 'domainMark':
      return null
  }
}

function HistoryStepRow({ entry }: { entry: StudioOperatorHistoryStep }) {
  const t = useTranslations('StudioOperator')
  const rejected = entry.status === 'error'
  /**
   * ⚠ 图标查不到就给个通用的：`tool` 在历史里是自由字符串（一条半年前的线程
   * 可能引用着今天已经改名的工具）—— 一条读不出图标的历史仍然是一条读得懂的历史。
   */
  const Icon: LucideIcon =
    OPERATOR_TOOL_ICONS[entry.tool as AssistantOperatorTool] ?? Sparkles
  /**
   * ⚠ 拒绝理由同理：翻不出来就退回它自己带的那行详情，⛔ 别把 i18n 键原样印
   * 到界面上（营销页那条台账就是这么翻的车）。
   */
  const rejectText =
    rejected && entry.rejectReason && t.has(`reject.${entry.rejectReason}`)
      ? t(`reject.${entry.rejectReason}`)
      : null

  return (
    <div
      data-testid="operator-history-step"
      data-tool={entry.tool}
      data-status={entry.status}
      data-undone={entry.undone ? 'true' : 'false'}
      className={cn(
        'rounded-xl border border-border/60 bg-muted/20 px-2.5 py-2 text-md',
        rejected && 'border-destructive/30 bg-destructive/5',
        entry.undone && 'opacity-55',
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className={cn(
            'mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border border-border bg-muted text-muted-foreground',
            rejected &&
              'border-destructive/40 bg-destructive/10 text-destructive',
          )}
        >
          <Icon className="size-3" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <span
            className={cn(
              'block font-medium text-foreground',
              entry.undone && 'line-through',
            )}
          >
            {entry.title}
          </span>
          {entry.reason ? (
            <span className="mt-0.5 block text-2sm text-muted-foreground">
              {entry.reason}
            </span>
          ) : null}
          {rejectText ? (
            <span className="mt-0.5 block text-2sm text-destructive">
              {rejectText}
            </span>
          ) : null}
          {entry.detail ? (
            <span className="mt-1 block break-words font-mono text-2sm leading-relaxed text-muted-foreground">
              {entry.detail}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/**
 * 历史里的评价卡 —— **文字与图，没有「还原这轮」**。
 *
 * ⛔ 那颗钮撤的是内存里的改动登记簿，而登记簿不跨刷新存在；渲染出来点下去要么
 * 什么都不发生、要么撤到一个几天后的表单上。历史条目里根本没有 `runKey`，
 * 所以它在这里写不出来。
 */
function HistoryCritiqueCard({ entry }: { entry: StudioOperatorHistoryStep }) {
  const t = useTranslations('StudioOperator')
  const critique = entry.critique
  if (!critique) return null

  return (
    <div
      data-testid="operator-history-critique"
      className="overflow-hidden rounded-xl border border-border/70 text-md"
    >
      <p className="bg-muted/50 px-2.5 py-1.5 text-2sm font-medium text-muted-foreground">
        {critique.modelLabel
          ? t('critique.titleWithModel', { model: critique.modelLabel })
          : t('critique.title')}
      </p>
      <div className="flex gap-2.5 p-2.5">
        <button
          type="button"
          onClick={() =>
            openOperatorLightbox(critique.imageUrl, t('critique.title'))
          }
          className="relative h-24 w-16 shrink-0 cursor-zoom-in overflow-hidden rounded-lg border border-border/70"
        >
          <Image
            src={critique.thumbnailUrl ?? critique.imageUrl}
            alt={t('critique.title')}
            fill
            sizes="64px"
            className="object-cover"
          />
        </button>
        <ul className="flex min-w-0 flex-1 flex-col gap-1">
          {/* ⚠ 与实时卡同一张严重度表（否定 / 异常 / 达成），⛔ 不在历史里退回
              两档：同一条结论在两个地方读出两个意思是最难查的那一类。 */}
          {critique.findings.map((finding) => (
            <li key={finding.text} className="flex items-start gap-1.5">
              {finding.severity === SEVERITY.pass ? (
                <Check
                  className="mt-0.5 size-3 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              ) : finding.severity === SEVERITY.warn ? (
                <AlertTriangle
                  className="mt-0.5 size-3 shrink-0 text-status-warning"
                  aria-hidden
                />
              ) : (
                <X
                  className="mt-0.5 size-3 shrink-0 text-destructive"
                  aria-hidden
                />
              )}
              <span className="min-w-0 text-2sm text-foreground">
                {finding.text}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {critique.advice ? (
        <p className="border-t border-dashed border-border px-2.5 py-2 text-2sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {t('critique.nextRound')}
          </span>{' '}
          {critique.advice}
        </p>
      ) : null}
    </div>
  )
}
