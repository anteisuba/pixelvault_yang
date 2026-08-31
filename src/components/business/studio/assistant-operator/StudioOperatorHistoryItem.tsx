'use client'

/**
 * 一条**只读历史**（P4-B）。
 *
 * ⭐ 它与 `StudioOperatorLogItem` / `StudioOperatorCritiqueCard` 是两颗组件，
 * 不是一颗组件的两个模式 —— 因为它收的是另一个类型：`StudioOperatorHistoryEntry`
 * 里没有 `inverse`、没有 `payload`、没有 `runKey`。于是「历史里冒出一颗点了会做
 * 错事的撤销钮 / 还原钮」在这颗组件里**写不出来**，不是靠一个 `readonly` 旗标
 * 拦着。同一条论据见 `types/studio-operator-history.ts` 的头注。
 *
 * ⚠ 「已撤销」的划线**留着**（那是历史事实），可点的撤销钮不留。
 * ⚠ 缩略图仍可点开灯箱：看大图是只读动作，不改任何东西。
 */

import { Check, Sparkles, X, type LucideIcon } from 'lucide-react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'

import type { AssistantOperatorTool } from '@/constants/assistant-operator'
import { openOperatorLightbox } from '@/components/business/studio/assistant-operator/StudioOperatorLightbox'
import { OPERATOR_TOOL_ICONS } from '@/components/business/studio/assistant-operator/StudioOperatorLogItem'
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
        <div className="ml-8 flex flex-col items-end gap-1">
          <p className="rounded-xl rounded-br-sm bg-foreground/85 px-3 py-2 text-xs text-background">
            {entry.text}
          </p>
          {entry.attachments.length > 0 ? (
            <div className="flex flex-wrap justify-end gap-1">
              {entry.attachments.map((attachment) => (
                <span
                  key={attachment.id}
                  className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-2xs text-muted-foreground"
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
        <p className="mr-6 whitespace-pre-wrap rounded-xl rounded-bl-sm bg-muted/45 px-3 py-2 text-xs text-foreground">
          {entry.text}
        </p>
      )
    case 'plan':
      return (
        <div
          data-testid="operator-history-plan"
          className="rounded-xl border border-border/70 bg-muted/30 px-2.5 py-2"
        >
          <p className="mb-1.5 text-2xs font-medium text-muted-foreground">
            {t('planTitle')}
          </p>
          <div className="flex flex-wrap gap-1">
            {entry.steps.map((step) => (
              <span
                key={step}
                className="rounded-full border border-border bg-background px-2 py-0.5 text-2xs text-muted-foreground"
              >
                {step}
              </span>
            ))}
          </div>
        </div>
      )
    case 'step':
      return entry.critique ? (
        <HistoryCritiqueCard entry={entry} />
      ) : (
        <HistoryStepRow entry={entry} />
      )
    case 'system':
      return (
        <p
          data-testid="operator-history-system-line"
          className="mx-auto rounded-full border border-dashed border-border px-3 py-1 text-2xs text-muted-foreground"
        >
          {/* ⚠ 与线程里那条同一套词条与同一条 subject 规矩（`revertField` 存的是
              字段 id，要过词表；`undoStep` 存的是模型写的标题，原样用）。 */}
          {t(`system.${entry.code}`, {
            subject:
              entry.code === 'revertField' && entry.subject
                ? t(`field.${entry.subject}`)
                : (entry.subject ?? ''),
            count: entry.count ?? 0,
          })}
        </p>
      )
    case 'domainMark':
      return (
        <p
          data-testid="operator-history-domain-mark"
          data-domain={entry.domain}
          className="mx-auto rounded-full border border-dashed border-border px-3 py-1 text-2xs text-muted-foreground"
        >
          {t('domainMark', { domain: t(`domainName.${entry.domain}`) })}
        </p>
      )
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
        'rounded-xl border border-border/60 bg-muted/20 px-2.5 py-2 text-xs',
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
            <span className="mt-0.5 block text-2xs text-muted-foreground">
              {entry.reason}
            </span>
          ) : null}
          {rejectText ? (
            <span className="mt-0.5 block text-2xs text-destructive">
              {rejectText}
            </span>
          ) : null}
          {entry.detail ? (
            <span className="mt-1 block break-words font-mono text-2xs leading-relaxed text-muted-foreground">
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
      className="overflow-hidden rounded-xl border border-border/70 text-xs"
    >
      <p className="bg-muted/50 px-2.5 py-1.5 text-2xs font-medium text-muted-foreground">
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
          {critique.findings.map((finding) => (
            <li key={finding.text} className="flex items-start gap-1.5">
              {finding.ok ? (
                <Check
                  className="mt-0.5 size-3 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              ) : (
                <X
                  className="mt-0.5 size-3 shrink-0 text-destructive"
                  aria-hidden
                />
              )}
              <span className="min-w-0 text-2xs text-foreground">
                {finding.text}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {critique.advice ? (
        <p className="border-t border-dashed border-border px-2.5 py-2 text-2xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {t('critique.nextRound')}
          </span>{' '}
          {critique.advice}
        </p>
      ) : null}
    </div>
  )
}
