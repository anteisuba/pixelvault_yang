'use client'

/**
 * 归属标记（✦）与就地确认条 —— **长在参数栏里**，紧挨着提示词框。
 *
 * ## 为什么在这里而不是在面板里
 * 拍板 3 要求覆写确认是「字段上的小条，不弹窗」，拍板 18 要求改动看得见来源。
 * 两件事的落点都在**工作台这一侧**：用户看着自己的表单被改，标记必须长在被改的
 * 那一栏，而不是躲在右边的面板里。
 *
 * ## 为什么是一条 rail 而不是逐字段的角标
 * 逐字段角标要往 `StudioPromptArea`（1900 行、当下还是别的会话的在飞文件）里插
 * 五个点。这里退一步：**一个插入点**，把每个被改的字段做成一枚 ✦ 药丸排成一行，
 * hover 出理由与原值、点一下还原那个字段。信息一条不少，接线面从五处降到一处。
 * ⚠ 这是对切片 v4 的一处**有意偏差**，交付报告里已列明；逐字段角标等
 * `StudioPromptArea` 的在飞改动落地之后再补。
 */

import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { RotateCcw, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  ASSISTANT_OPERATOR_CONFIRM_CHOICES,
  type AssistantOperatorConfirmChoice,
} from '@/constants/assistant-operator'
import {
  STUDIO_OPERATOR_CLEAR_CONFIRM_MS,
  STUDIO_OPERATOR_FIELDS,
  STUDIO_OPERATOR_KEEP_OPEN_ATTR,
} from '@/constants/studio-assistant-operator'
import {
  getOperatorRunner,
  useStudioOperatorState,
} from '@/hooks/use-studio-operator-store'
import { useStudioOperatorRevert } from '@/hooks/use-studio-operator-revert'
import { cn } from '@/lib/utils'

const CONFIRM_CHOICES: readonly AssistantOperatorConfirmChoice[] = [
  ASSISTANT_OPERATOR_CONFIRM_CHOICES.append,
  ASSISTANT_OPERATOR_CONFIRM_CHOICES.overwrite,
  ASSISTANT_OPERATOR_CONFIRM_CHOICES.keep,
]

export function StudioOperatorChangeRail() {
  const t = useTranslations('StudioOperator')
  const reduceMotion = useReducedMotion()
  const { changes, confirm } = useStudioOperatorState()
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

  if (!confirm && fields.length === 0) return null

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
      {/* ── 就地确认条（拍板 3）─────────────────────────────────
          ⚠ 只做入场不做退场，理由同 `StudioOperatorDock`：隐藏标签页里退场
          永远不完成，确认条会以 height:0 的形态赖在参数栏里。 */}
      {confirm ? (
        <motion.div
          key="operator-confirm"
          data-testid="operator-confirm-bar"
          initial={reduceMotion ? false : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={{ duration: reduceMotion ? 0 : 0.2 }}
          className="overflow-hidden"
        >
          <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 px-2.5 py-2">
            <p className="text-2xs text-primary">
              {t(`confirm.have.${confirm.field}`, {
                count: confirm.have.length,
              })}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {CONFIRM_CHOICES.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  data-testid={`operator-confirm-${choice}`}
                  onClick={() => getOperatorRunner()?.resume(choice)}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-2xs font-medium transition-colors duration-fast ease-standard',
                    choice === ASSISTANT_OPERATOR_CONFIRM_CHOICES.append
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'border border-primary/30 text-primary hover:bg-primary/10',
                  )}
                >
                  {t(`confirm.choice.${choice}`)}
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      ) : null}

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
                className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-2xs font-medium text-primary transition-colors duration-fast ease-standard hover:bg-primary/20"
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
              'ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs transition-colors duration-fast ease-standard',
              confirmingClear
                ? 'bg-destructive/10 font-medium text-destructive'
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
