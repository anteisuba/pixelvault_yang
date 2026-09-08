'use client'

/**
 * **checkpoint 薄卡**（§2.13 / 拍板 18 升级：撤销粒度从「一条日志」升到「一轮」）。
 *
 * ⭐ 每轮改动后一张：「已改 N 项：模型 · 提示词 · 参考图」+「撤销」。点撤销
 * **就地**展开二选（§3.2）：
 *  · 只回参数     —— 按 `inverse` 逆序回滚，对话保留，**结果不删**；
 *  · 连对话一起回 —— 参数回滚 + 截断该轮之后的线程消息。
 * ⛔ 不弹窗、不跳焦点：撤销是个小动作，弹窗会让人以为要出大事。
 *
 * ⚠ 顶部那颗「清掉助手全部改动」二击确认**照旧留着**（拍板 14 未被推翻）：
 * 它在参数栏上（`StudioOperatorChangeRail`），管的是「这个工作台上助手改的全部」，
 * 与这张薄卡的「这一轮」是两种粒度，不是两套实现。
 *
 * ⚠ 撤销后的**系统行由 hook 插**（`use-studio-operator-revert.ts`），这颗组件
 * 只负责就地把自己变成「已撤销 · ××」—— 两处都写会得到两行通报。
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'

/** 二选的两个值 —— ⚠ 同时是 `data-choice`，测试与真机目检按它取。 */
export const STUDIO_OPERATOR_REVERT_CHOICES = {
  /** 只回参数：对话与结果都留着。 */
  params: 'params',
  /** 连对话一起回：参数回滚 + 截断该轮之后的线程。 */
  thread: 'thread',
} as const

export type StudioOperatorRevertChoice =
  (typeof STUDIO_OPERATOR_REVERT_CHOICES)[keyof typeof STUDIO_OPERATOR_REVERT_CHOICES]

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
  onRevert(runKey: string, choice: StudioOperatorRevertChoice): void
  /** 见 `StudioOperatorCheckpointResume`。 */
  resume?: StudioOperatorCheckpointResume
}

export function StudioOperatorCheckpointCard({
  runKey,
  count,
  fieldSummary,
  onRevert,
  resume,
}: StudioOperatorCheckpointCardProps) {
  const t = useTranslations('StudioOperator')
  const [choosing, setChoosing] = useState(false)
  const [reverted, setReverted] = useState<StudioOperatorRevertChoice | null>(
    null,
  )

  const ghost =
    'rounded-md px-1.5 py-0.5 text-2sm text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <div
      data-testid="operator-checkpoint"
      data-run-key={runKey}
      data-reverted={reverted ?? 'false'}
      className={cn(
        'flex flex-wrap items-center gap-x-2 gap-y-1 rounded-r-md border-l-2 border-status-applied bg-status-applied-surface px-2.5 py-1.5 text-2sm text-foreground',
        reverted && 'opacity-90',
      )}
    >
      <span className="min-w-0 flex-1">
        {t('checkpoint.summary', { count, fields: fieldSummary })}
      </span>

      {reverted ? (
        <span
          data-testid="operator-checkpoint-done"
          className="shrink-0 font-mono text-xs tracking-nav text-muted-foreground"
        >
          {t(`checkpoint.reverted.${reverted}`)}
        </span>
      ) : choosing ? (
        <span className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            data-testid="operator-checkpoint-choice"
            data-choice={STUDIO_OPERATOR_REVERT_CHOICES.params}
            onClick={() => {
              onRevert(runKey, STUDIO_OPERATOR_REVERT_CHOICES.params)
              setReverted(STUDIO_OPERATOR_REVERT_CHOICES.params)
            }}
            className="rounded-md border border-border bg-card px-1.5 py-0.5 text-2sm text-foreground shadow-xs transition-colors duration-(--duration-fast) ease-standard hover:bg-accent"
          >
            {t('checkpoint.choice.params')}
          </button>
          <button
            type="button"
            data-testid="operator-checkpoint-choice"
            data-choice={STUDIO_OPERATOR_REVERT_CHOICES.thread}
            onClick={() => {
              onRevert(runKey, STUDIO_OPERATOR_REVERT_CHOICES.thread)
              setReverted(STUDIO_OPERATOR_REVERT_CHOICES.thread)
            }}
            // 破坏性档只给 `--destructive`（§11.2）：它真的会删掉这一轮之后的对话。
            className="rounded-md border border-destructive/40 bg-card px-1.5 py-0.5 text-2sm text-destructive shadow-xs transition-colors duration-(--duration-fast) ease-standard hover:bg-destructive/5"
          >
            {t('checkpoint.choice.thread')}
          </button>
          <button
            type="button"
            data-testid="operator-checkpoint-cancel"
            onClick={() => setChoosing(false)}
            className={ghost}
          >
            {t('checkpoint.choice.cancel')}
          </button>
        </span>
      ) : (
        <button
          type="button"
          data-testid="operator-checkpoint-undo"
          onClick={() => setChoosing(true)}
          className={cn('shrink-0', ghost)}
        >
          {t('checkpoint.undo')}
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
            className="shrink-0 rounded-md border border-border bg-card px-1.5 py-0.5 text-2sm font-medium text-foreground shadow-xs transition-colors duration-(--duration-fast) ease-standard hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('resume.continue', { step: resume.stepNumber })}
          </button>
        </span>
      ) : null}
    </div>
  )
}
