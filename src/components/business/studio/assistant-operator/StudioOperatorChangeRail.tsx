'use client'

import { useEffect, useRef, useState } from 'react'
import { RotateCcw, Sparkles } from '@/components/icons'
import { useTranslations } from 'next-intl'

import {
  STUDIO_OPERATOR_CLEAR_CONFIRM_MS,
  STUDIO_OPERATOR_FIELDS,
  STUDIO_OPERATOR_KEEP_OPEN_ATTR,
} from '@/constants/studio-assistant-operator'
import { useStudioOperatorState } from '@/hooks/use-studio-operator-store'
import { useStudioOperatorRevert } from '@/hooks/use-studio-operator-revert'
import { cn } from '@/lib/utils'

export function StudioOperatorChangeRail() {
  const t = useTranslations('StudioOperator')
  const { changes } = useStudioOperatorState()
  const { revertField, revertAll, changeCount } = useStudioOperatorRevert()

  /**
   * 二击确认（拍板 14）。第一击变红并改文案，3 秒不点自己变回去。
   * ⚠ 计时器必须在卸载时清掉：切模态会把这颗组件拆掉，留着的 timeout 会对一个
   *   已卸载的组件 setState。
   */
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

  return (
    <div
      // 点这里不该收起面板：它是助手与用户的共同编辑区（拍板 7 的推论）。
      {...{ [STUDIO_OPERATOR_KEEP_OPEN_ATTR]: '' }}
      data-testid="operator-change-rail"
      className="flex flex-col gap-1.5"
      onClick={(event) => event.stopPropagation()}
    >
      {/* ── ✦ 归属标记：hover 出理由与原值，点一下还原这个字段 ── */}
      {fields.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
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
                className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-2sm font-medium text-primary transition-colors duration-fast ease-standard hover:bg-primary/20"
              >
                <Sparkles className="size-2.5" aria-hidden />
                {t(`field.${field}`)}
              </button>
            )
          })}
          <button
            type="button"
            data-testid="operator-revert-all"
            onClick={handleClear}
            className={cn(
              'ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2sm transition-colors duration-fast ease-standard',
              confirmingClear
                ? 'bg-status-risk-surface font-medium text-status-risk'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <RotateCcw className="size-2.5" aria-hidden />
            {confirmingClear
              ? t('changes.clearConfirm', { count: changeCount })
              : t('changes.revertAll', { count: changeCount })}
          </button>
        </div>
      ) : null}
    </div>
  )
}
