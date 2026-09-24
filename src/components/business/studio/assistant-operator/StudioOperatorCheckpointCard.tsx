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

/**
 * **续跑那一档**（第三期 · 断点续跑）——「从第 N 步继续」。
 *
 * ⭐ 为什么长在 checkpoint 薄卡上而不是另起一张卡：这一轮断在哪儿、改了什么、
 * 要不要回退，是同一个决定的三个面。另起一张卡的下场是流末尾并排两张薄卡，
 * 一张说「撤销」一张说「继续」，而用户要问的是「这两个是一件事吗」。
 * ⚠ 缺席 = 这一轮没有没跑完的计划（⛔ 不画一颗停用的按钮：`ui-defaults.md`
 *   的状态配方 —— 不适用的动作不渲染）。
 */
export interface StudioOperatorCheckpointResume {
  /** 1 起数，写在按钮上。 */
  stepNumber: number
  /** 挂掉的那一步说了什么；`undefined` = 不是挂的（刷新 / 被 ⏹ 掐掉）。 */
  failedReason?: string
  onResume(): void
}

interface StudioOperatorCheckpointCardProps {
  /** 这一轮的 token —— 撤销认它，⛔ 不去劈条目 id。 */
  runKey: string
  /** 这一轮有几处可还原；0 时调用方就不该渲染这张卡。 */
  count: number
  /** 改了哪些字段（已经过词表的人话，用 ` · ` 串好）。 */
  fieldSummary: string
  onRevert(runKey: string): void
  /** 见 `StudioOperatorCheckpointResume`。 */
  resume?: StudioOperatorCheckpointResume
  details?: ReactNode
  detailsCount?: number
}

export function StudioOperatorCheckpointCard({
  runKey,
  count,
  fieldSummary,
  onRevert,
  resume,
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

      {/* ── 续跑（第三期）────────────────────────────────────────────
          ⚠ 独占一整行（`basis-full`）：它与撤销是**方向相反**的两个动作，
            并排放在同一行里点错的代价是把刚跑完的三步全退掉。
          ⚠ 失败那句原因写在按钮**前面**：先读为什么，再决定要不要继续。 */}
      {resume ? (
        <span className="flex basis-full items-center gap-2 pt-1">
          {resume.failedReason ? (
            <span
              data-testid="operator-checkpoint-resume-reason"
              className="min-w-0 flex-1 truncate text-2xs text-muted-foreground"
              title={resume.failedReason}
            >
              {t('resume.failed', { reason: resume.failedReason })}
            </span>
          ) : (
            <span className="min-w-0 flex-1" />
          )}
          <button
            type="button"
            data-testid="operator-checkpoint-resume"
            data-step={resume.stepNumber}
            onClick={resume.onResume}
            className="flex h-7 shrink-0 items-center rounded-full border border-border bg-card px-2.5 text-xs text-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('resume.continue', { step: resume.stepNumber })}
          </button>
        </span>
      ) : null}
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
