'use client'

import { useTranslations } from 'next-intl'

/** 续跑那一档（§3.6）—— 形态与 checkpoint 薄卡上那一颗逐字同源。 */
export interface StudioOperatorRoundResume {
  /** 1 起数，写在按钮上。 */
  stepNumber: number
  /** 挂掉的那一步说了什么；`undefined` = 不是挂的（刷新 / 被 ⏹ 掐掉）。 */
  failedReason?: string
  onResume(): void
}

/**
 * **「从第 N 步继续」**（§3.6）—— 挂在一轮末尾。
 *
 * ⭐ 它原先挂在「本轮记录」那一行下面；记录整行不再显示之后（owner 2026-09-24：
 * 「没什么有用的信息」），只剩这一颗按钮留在原位。失败那句原因写在按钮前面：先读为什么。
 */
export function StudioOperatorResumeChip({
  resume,
}: {
  resume: StudioOperatorRoundResume
}) {
  const t = useTranslations('StudioOperator.resume')
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      {resume.failedReason ? (
        <span
          data-testid="operator-round-resume-reason"
          className="min-w-0 text-xs text-muted-foreground"
          title={resume.failedReason}
        >
          {t('failed', { reason: resume.failedReason })}
        </span>
      ) : null}
      <button
        type="button"
        data-testid="operator-round-resume"
        data-step={resume.stepNumber}
        onClick={resume.onResume}
        className="flex h-7 shrink-0 items-center rounded-full border border-border bg-card px-2.5 text-xs text-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
      >
        {t('continue', { step: resume.stepNumber })}
      </button>
    </div>
  )
}
