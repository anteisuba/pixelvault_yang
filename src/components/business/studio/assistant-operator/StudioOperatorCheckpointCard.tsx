'use client'

/**
 * **每轮的「撤销」**—— 撤回的**唯一入口**（owner 2026-09-24：「只留一个入口」）。
 *
 * ⭐ 过程行的后半句：「做了 N 步 › · 改了提示词 · 规格 · 撤销」。点一下就把这一轮
 * 改的那几格按 `inverse` 逆序退回去，对话与结果都留着，就地换成「已撤销」。
 * ⛔ 没有二选（只回参数 / 连对话一起回）、没有逐步撤销、没有「恢复到这一步」、没有
 * ✦ 字段与「全部还原」—— 那四套都删了。想退更早的，点更早那一轮自己的「撤销」。
 * ⚠ 撤销后的系统行由 hook 插（`use-studio-operator-revert.ts`），这里只换自己的字。
 */

import { useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'

interface StudioOperatorCheckpointCardProps {
  /** 这一轮的 token —— 撤销认它，⛔ 不去劈条目 id。 */
  runKey: string
  /** 这一轮有几处可还原；0 时调用方就不该渲染这张卡。 */
  count: number
  /** 改了哪些字段（已经过词表的人话，用 ` · ` 串好）。 */
  fieldSummary: string
  onRevert(runKey: string): void
  details?: ReactNode
  detailsCount?: number
}

export function StudioOperatorCheckpointCard({
  runKey,
  count,
  fieldSummary,
  onRevert,
  details,
  detailsCount,
}: StudioOperatorCheckpointCardProps) {
  const t = useTranslations('StudioOperator')
  const [reverted, setReverted] = useState(false)

  const link =
    'rounded-sm text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none'

  /**
   * ⭐ D12 P5：**不再是一张绿边薄卡**，而是过程那一行的后半句 ——
   * 「· 改了提示词 · 模型 · 撤销」，紧跟在「做了 N 步 ▸」后面。
   * ⚠ 不再写「N 项」：那个数是按步数算的，而参数栏上的「还原（N 处）」按字段算，
   * 两个数对不上（C7）。只说改了哪几样。
   */
  return (
    <span
      data-testid="operator-checkpoint"
      data-run-key={runKey}
      data-reverted={reverted ? 'true' : 'false'}
      className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground"
    >
      {fieldSummary ? (
        <span className="min-w-0">
          · {t('checkpoint.summary', { count, fields: fieldSummary })}
        </span>
      ) : null}

      {reverted ? (
        <span data-testid="operator-checkpoint-done" className="shrink-0">
          · {t('checkpoint.reverted')}
        </span>
      ) : (
        <button
          type="button"
          data-testid="operator-checkpoint-undo"
          onClick={() => {
            onRevert(runKey)
            setReverted(true)
          }}
          className={cn('shrink-0 text-foreground/80', link)}
        >
          · {t('checkpoint.undo')}
        </button>
      )}

      {details ? (
        <details className="basis-full">
          <summary className="w-fit cursor-pointer list-none hover:text-foreground">
            {t('toolGroup.details', { count: detailsCount ?? 0 })}
          </summary>
          <div className="mt-1.5 flex flex-col gap-1.5">{details}</div>
        </details>
      ) : null}
    </span>
  )
}
