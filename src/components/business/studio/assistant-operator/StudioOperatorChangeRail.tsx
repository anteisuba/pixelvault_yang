'use client'

import { useEffect, useRef, useState } from 'react'
import { RotateCcw, Sparkles } from '@/components/icons'
import { useTranslations } from 'next-intl'

import {
  STUDIO_OPERATOR_CLEAR_CONFIRM_MS,
  STUDIO_OPERATOR_FIELDS,
} from '@/constants/studio-assistant-operator'
import { useStudioOperatorState } from '@/hooks/use-studio-operator-store'
import { useStudioOperatorRevert } from '@/hooks/use-studio-operator-revert'
import { cn } from '@/lib/utils'

/**
 * **助手改了什么 + 还原**（owner 2026-09-24：从参数栏搬进助手）。
 *
 * ⭐ 长在**最新一轮的过程行**上（「做了 3 步 › ✦ 提示词 ✦ 规格 ↺ 全部还原（2 处）」），
 * 替掉那一轮的「改了… · 撤销」；更早的轮次照旧只有「撤销」。⛔ 参数栏上不再有这一排。
 * ⚠ 读的是**登记簿**（跨轮累计、跨新对话留着），所以数的是「现在工作台上助手改着的
 *   那几格」，不是这一轮改了几步。
 * ⚠ 全部还原要点两次（拍板 14），第一击变风险色，3 秒不点自己变回去；单个字段一击还原。
 */
export function StudioOperatorChangeRail() {
  const t = useTranslations('StudioOperator')
  const { changes } = useStudioOperatorState()
  const { revertField, revertAll, changeCount } = useStudioOperatorRevert()

  const [confirmingClear, setConfirmingClear] = useState(false)
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
    },
    [],
  )

  const fields = STUDIO_OPERATOR_FIELDS.filter(
    (field) => changes[field] !== undefined,
  )
  if (fields.length === 0) return null

  const handleClear = () => {
    if (!confirmingClear) {
      setConfirmingClear(true)
      clearTimerRef.current = setTimeout(
        () => setConfirmingClear(false),
        STUDIO_OPERATOR_CLEAR_CONFIRM_MS,
      )
      return
    }
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
    setConfirmingClear(false)
    revertAll()
  }

  const link =
    'inline-flex shrink-0 items-center gap-1 rounded-sm transition-colors duration-(--duration-fast) ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none'

  return (
    <span
      data-testid="operator-change-rail"
      className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-xs"
    >
      {fields.map((field) => {
        const change = changes[field]
        if (!change) return null
        const previous = change.previousLabel.trim()
        return (
          <button
            key={field}
            type="button"
            data-testid="operator-field-mark"
            data-field={field}
            onClick={() => revertField(field)}
            title={[
              change.reason,
              previous
                ? t('changes.originalValue', { value: previous })
                : t('changes.originalEmpty'),
              t('changes.revertOne'),
            ]
              .filter(Boolean)
              .join('\n')}
            className={cn(link, 'text-foreground/80 hover:text-foreground')}
          >
            <Sparkles className="size-3" aria-hidden />
            {t(`field.${field}`)}
          </button>
        )
      })}
      <button
        type="button"
        data-testid="operator-revert-all"
        onClick={handleClear}
        className={cn(
          link,
          confirmingClear
            ? 'font-medium text-status-risk'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <RotateCcw className="size-3" aria-hidden />
        {confirmingClear
          ? t('changes.clearConfirm', { count: changeCount })
          : t('changes.revertAll', { count: changeCount })}
      </button>
    </span>
  )
}
