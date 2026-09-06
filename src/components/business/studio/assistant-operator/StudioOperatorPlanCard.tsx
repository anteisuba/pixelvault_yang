'use client'

/**
 * **计划卡**（§2.6 / §11.4「计划卡」/ §3.1 ②–⑤）。
 *
 * ⭐ 它是「生成前反问」的唯一载体：阶段列表让人看得出助手打算做什么，待定项把
 * 「你要半身还是全身」这种问题从一轮 LLM 往返压成一次点击。
 *
 * ⛔ **这颗组件不判断自己该不该出现**：出卡与否由 `lib/studio-operator-plan.ts`
 * 的 `shouldShowPlanCard` 说了算（owner 2026-09-06「客户端硬判」），面板据它决定
 * 渲不渲染。把判据写进组件的表现是「历史里那张卡消失了」—— 因为历史条目走的是
 * 另一条渲染路。
 *
 * ⚠ 「修改」**不发请求**（§3.1 ⑤）：就地回到可编辑态、焦点落回第一个待定项。
 * 要不要顺手让助手重新规划一次（`planApproved: false`）是**宿主**的决定，
 * 这里只把这件事通知出去。
 */

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'

import { getAssistantPlanVisual } from '@/constants/assistant-plan-visuals'
import { cn } from '@/lib/utils'
import type {
  AssistantOperatorPlanAnswer,
  AssistantOperatorPlanEstimate,
  AssistantOperatorPlanPending,
} from '@/types/assistant-operator'

import { PlanOptionVisual } from './PlanOptionVisual'

interface StudioOperatorPlanCardProps {
  steps: readonly { id: string; label: string }[]
  pending: readonly AssistantOperatorPlanPending[]
  estimate: AssistantOperatorPlanEstimate
  /**
   * 点过「开始」了没有 —— 卡收成一行摘要（§3.1 ④）。
   *
   * ⭐ **受控**（切片 3a 接线时改的）：这一位住在 store。卡自己 `useState` 记的
   * 下场是收放法则（拍板 7）把面板卸载一次，再展开时它又变回可点的「开始」——
   * 而那一轮其实早就跑起来了。
   */
  started: boolean
  /** 「开始」—— 带着答复重发（§3.1 ④）。 */
  onStart(answers: AssistantOperatorPlanAnswer[]): void
  /** 「修改」—— ⚠ 就地回到可编辑态，**不发请求**（§3.1 ⑤）。 */
  onRevise?(): void
}

export function StudioOperatorPlanCard({
  steps,
  pending,
  estimate,
  started,
  onStart,
  onRevise,
}: StudioOperatorPlanCardProps) {
  const t = useTranslations('StudioOperator')
  const [answers, setAnswers] = useState<Record<string, string>>({})

  /**
   * ⚠ 每一格都必须有答案「开始」才亮（§3.1 ③）—— 没有待定项时它一开始就是亮的。
   * ⛔ 别让一个没答完的计划开跑：那正是这张卡存在的全部理由。
   */
  const ready = useMemo(
    () => pending.every((item) => answers[item.id] !== undefined),
    [answers, pending],
  )

  if (started) {
    return (
      <div
        data-testid="operator-plan-card"
        data-started="true"
        className="flex items-center gap-2 overflow-hidden rounded-xl border border-border bg-card px-3 py-2 opacity-[.92]"
      >
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {steps.map((step) => step.label).join(' · ')}
        </span>
        <button
          type="button"
          data-testid="operator-plan-revise"
          onClick={() => onRevise?.()}
          className="shrink-0 rounded-md px-1.5 py-0.5 text-2xs text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('plan.revise')}
        </button>
      </div>
    )
  }

  return (
    <div
      data-testid="operator-plan-card"
      data-started="false"
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="min-w-0 flex-1 text-xs font-semibold text-foreground">
          {t('plan.title')}
        </span>
        <span className="shrink-0 font-mono text-3xs tracking-nav text-muted-foreground">
          {t('plan.meta', { steps: steps.length, pending: pending.length })}
        </span>
      </div>

      <div className="flex flex-col gap-3 p-3">
        <ol className="flex flex-col gap-1.5">
          {steps.map((step, index) => (
            <li
              key={step.id}
              data-testid="operator-plan-step"
              className="flex items-start gap-2 text-xs text-foreground"
            >
              <span className="shrink-0 font-mono text-3xs tracking-nav text-muted-foreground">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="min-w-0 flex-1">{step.label}</span>
            </li>
          ))}
        </ol>

        {pending.map((item) => (
          <fieldset
            key={item.id}
            data-testid="operator-plan-pending"
            data-pending-id={item.id}
            className="flex flex-col gap-1.5"
          >
            <legend className="pb-1.5 text-2xs text-muted-foreground">
              {item.label}
            </legend>
            <div className="grid grid-cols-3 gap-1.5">
              {item.options.map((option) => {
                const selected = answers[item.id] === option.id
                const visual = getAssistantPlanVisual(option.visual)
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    data-testid="operator-plan-option"
                    data-option-id={option.id}
                    data-selected={selected}
                    onClick={() =>
                      setAnswers((current) => ({
                        ...current,
                        [item.id]: option.id,
                      }))
                    }
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-lg border p-2.5 text-center transition-colors duration-(--duration-fast) ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      selected
                        ? 'border-primary text-primary ring-1 ring-primary ring-inset'
                        : 'border-border text-foreground hover:bg-accent',
                    )}
                  >
                    <PlanOptionVisual
                      option={option}
                      label={
                        visual
                          ? t(`planVisual.${visual.labelKey}`)
                          : option.label
                      }
                    />
                    <span className="w-full truncate text-2xs">
                      {option.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <div className="flex items-center gap-2 border-t border-border bg-muted/45 px-3 py-2">
        <span
          data-testid="operator-plan-estimate"
          className="min-w-0 flex-1 truncate font-mono text-3xs tracking-nav text-muted-foreground"
        >
          {/* ⚠ 算不出金额就**不写那一行**（⛔ 不写「约 0 credits」）—— 一个错的数
              比没有数更糟，论据与 `StudioCostPreview` 的「缺价不折进合计」同源。 */}
          {estimate.credits === undefined
            ? ''
            : t('plan.estimate', { credits: estimate.credits })}
        </span>
        <button
          type="button"
          data-testid="operator-plan-revise"
          onClick={() => onRevise?.()}
          className="shrink-0 rounded-md px-1.5 py-0.5 text-2xs text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('plan.revise')}
        </button>
        <button
          type="button"
          data-testid="operator-plan-start"
          disabled={!ready}
          onClick={() =>
            onStart(
              pending.map((item) => ({
                pendingId: item.id,
                optionId: answers[item.id] as string,
              })),
            )
          }
          className="shrink-0 rounded-md bg-primary px-2 py-1 text-2xs text-primary-foreground transition-opacity duration-(--duration-fast) ease-standard hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
        >
          {t('plan.start')}
        </button>
      </div>
    </div>
  )
}
