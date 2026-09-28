'use client'

/**
 * **搭配卡**（lora-assistant §12，owner 2026-09-28「一张卡全包」；画板 LoRA 台 B
 * 「助手展开」那张「应用这组权重」卡的全包版）。
 *
 * ── 卡上摆什么 ──────────────────────────────────────────────────
 * 助手自己搭好的一套，一行一处变化：＋ 新挂（名字 · 权重）· 权重 a → b · － 卸下 ·
 * 参数（只写变了的那几格）。底下一行「应用后总权重」，一颗「应用这套搭配」。
 *
 * ── 三条不能软化的规矩 ──────────────────────────────────────────
 * 1. 这张卡**不出图**：应用只动装配台（左列滑杆与数字走到新值），出图仍是创作者按。
 * 2. 超预算**只提醒不动手**（§5）：读数标红 + 一句提醒，⛔ 按钮照旧可点。
 * 3. 应用之后卡**不离场**：就地收成一行「已应用 · 11:24」，有几处没应用成照实写；
 *    撤销在这一轮的过程行上（每一处一条带 `inverse` 的 step）。
 */

import { useTranslations } from 'next-intl'

import { ASSISTANT_OPERATOR_CONFIRM_KIND_IDS } from '@/constants/assistant-operator'
import { STUDIO_OPERATOR_CONFIRM_STATUS_IDS } from '@/constants/studio-assistant-operator'
import { cn } from '@/lib/utils'
import type { AssistantLoraParameters } from '@/types/assistant-operator'
import type { StudioOperatorConfirmPrompt } from '@/types/studio-assistant-operator'

export type StudioOperatorLoraSetupPrompt = Extract<
  StudioOperatorConfirmPrompt,
  { kind: typeof ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.loraSetup }
>

/** 权重读数：两位小数（画板 `0.90 → 0.75`），⛔ 不把浮点尾巴印到卡上。 */
function formatWeight(value: number): string {
  return value.toFixed(2)
}

type ParameterKey = keyof AssistantLoraParameters

/** 参数那一行里各格的顺序（与装配台「参数」弹层同一个顺序）。 */
const PARAMETER_ORDER: readonly ParameterKey[] = [
  'runnerSampler',
  'runnerScheduler',
  'steps',
  'guidanceScale',
  'runnerSeed',
]

interface StudioOperatorLoraSetupCardProps {
  prompt: StudioOperatorLoraSetupPrompt
  /** 「应用这套搭配」。 */
  onApply(): void
  /** 「先不用」—— ⛔ 什么都不动，但照样落账。 */
  onDismiss(): void
  /** 「已应用 · 11:24」里那个时刻。 */
  formatTime(iso: string): string
}

export function StudioOperatorLoraSetupCard({
  prompt,
  onApply,
  onDismiss,
  formatTime,
}: StudioOperatorLoraSetupCardProps) {
  const t = useTranslations('StudioOperator')
  const { setup, status } = prompt
  const decided =
    status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed ||
    status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.cancelled
  const submitting = status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.submitting
  const time = prompt.decidedAt ? formatTime(prompt.decidedAt) : ''

  /* ── 已应用 / 已取消：整卡收成一行「态 · 时间」（确认卡不离场）────────── */
  if (decided) {
    return (
      <section
        data-testid="operator-lora-setup-card"
        data-status={status}
        className="overflow-hidden rounded-xl bg-card"
      >
        <p
          data-testid="operator-lora-setup-state"
          className="flex items-center gap-2 px-3 py-2 text-2sm text-muted-foreground"
        >
          <span className="shrink-0 font-semibold">
            {status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.cancelled
              ? t('confirm.state.cancelled', { time })
              : prompt.failedCount
                ? t('confirm.loraSetup.appliedPartial', {
                    time,
                    count: prompt.failedCount,
                  })
                : t('confirm.loraSetup.applied', { time })}
          </span>
          <span className="min-w-0 flex-1 truncate">{setup.question}</span>
        </p>
      </section>
    )
  }

  /** 参数那一行：变了的几格按装配台的顺序串起来；宽高合成一格「尺寸」。 */
  const parameterText = (() => {
    if (!setup.parameters) return null
    const { patch, previous } = setup.parameters
    const value = (key: ParameterKey, raw: unknown) => {
      if (raw === null || raw === undefined) {
        return key === 'runnerSeed'
          ? t('confirm.loraSetup.paramRandom')
          : t('confirm.loraSetup.paramDefault')
      }
      return String(raw)
    }
    const parts: string[] = []
    for (const key of PARAMETER_ORDER) {
      if (!(key in patch)) continue
      parts.push(
        `${t(`confirm.loraSetup.param.${key}`)} ${value(key, previous[key])} → ${value(key, patch[key])}`,
      )
    }
    if ('runnerWidth' in patch || 'runnerHeight' in patch) {
      const size = (source: AssistantLoraParameters) =>
        source.runnerWidth != null && source.runnerHeight != null
          ? `${source.runnerWidth}×${source.runnerHeight}`
          : t('confirm.loraSetup.paramDefault')
      parts.push(
        `${t('confirm.loraSetup.param.size')} ${size(previous)} → ${size({
          ...previous,
          ...patch,
        })}`,
      )
    }
    return parts.join(' · ')
  })()

  const overBudget = setup.budget
    ? setup.budget.total > setup.budget.limit
    : false

  const row =
    'flex min-w-0 items-baseline justify-between gap-3 text-2sm text-foreground'
  const value = 'shrink-0 font-mono text-xs font-semibold tabular-nums'
  const sign =
    'mr-1.5 inline-block w-3 text-center font-mono text-muted-foreground'

  return (
    <section
      data-testid="operator-lora-setup-card"
      data-status={status}
      aria-label={setup.question}
      className="overflow-hidden rounded-xl bg-card"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {setup.question}
        </span>
        {/* 当前底模那一格 —— `null` = 底模未定，整格不画（⛔ 不编一个名字）。 */}
        {setup.baseFamilyLabel ? (
          <span className="shrink-0 font-mono text-2xs text-muted-foreground">
            {setup.baseFamilyLabel}
          </span>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col gap-2.5 p-3">
        <ul className="flex flex-col gap-1.5">
          {setup.mounts.map((mount) => (
            <li
              key={`mount:${mount.candidate.candidateId}`}
              data-testid="operator-lora-setup-mount"
              className={row}
            >
              <span className="min-w-0 truncate">
                <span aria-hidden className={sign}>
                  ＋
                </span>
                <span className="sr-only">
                  {t('confirm.loraSetup.mountSr')}{' '}
                </span>
                {mount.candidate.name}
              </span>
              <span className={value}>{formatWeight(mount.weight)}</span>
            </li>
          ))}
          {setup.weights.map((weight) => (
            <li
              key={`weight:${weight.loraId}`}
              data-testid="operator-lora-setup-weight"
              className={row}
            >
              <span className="min-w-0 truncate">
                <span aria-hidden className={sign} />
                {weight.name}
              </span>
              <span className={value}>
                {formatWeight(weight.from)} → {formatWeight(weight.to)}
              </span>
            </li>
          ))}
          {setup.unmounts.map((unmount) => (
            <li
              key={`unmount:${unmount.loraId}`}
              data-testid="operator-lora-setup-unmount"
              className={cn(row, 'text-muted-foreground')}
            >
              <span className="min-w-0 truncate">
                <span aria-hidden className={sign}>
                  －
                </span>
                {unmount.name}
              </span>
              <span className="shrink-0 text-xs">
                {t('confirm.loraSetup.unmount')}
              </span>
            </li>
          ))}
          {parameterText ? (
            <li
              data-testid="operator-lora-setup-parameters"
              className="flex min-w-0 items-baseline gap-3 text-2sm text-foreground"
            >
              <span className="shrink-0 text-muted-foreground">
                {t('confirm.loraSetup.parameters')}
              </span>
              <span className="min-w-0 flex-1 text-right font-mono text-xs font-semibold leading-5">
                {parameterText}
              </span>
            </li>
          ) : null}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5">
          {setup.budget ? (
            <span
              data-testid="operator-lora-setup-tally"
              data-over-budget={overBudget ? 'true' : 'false'}
              className={cn(
                'text-2sm',
                overBudget ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {t('confirm.loraSetup.tally')}{' '}
              <span className="font-mono">
                {formatWeight(setup.budget.total)} /{' '}
                {formatWeight(setup.budget.limit)}
              </span>
            </span>
          ) : (
            <span />
          )}

          <span className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              data-testid="operator-lora-setup-dismiss"
              onClick={onDismiss}
              disabled={submitting}
              className="h-7.5 rounded-full px-3 text-2sm text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 motion-reduce:transition-none"
            >
              {t('confirm.loraSetup.dismiss')}
            </button>
            <button
              type="button"
              data-testid="operator-lora-setup-apply"
              /* ⚠ 超预算**不禁用**（§5「只提醒不动手」）。 */
              disabled={submitting}
              aria-busy={submitting || undefined}
              onClick={onApply}
              className="h-7.5 rounded-full bg-foreground px-3.5 text-2sm font-semibold text-background transition-opacity duration-fast ease-standard hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
            >
              {submitting
                ? t('confirm.loraSetup.applying')
                : t('confirm.loraSetup.apply')}
            </button>
          </span>
        </div>

        {/* 超预算那一句 —— 说的是「可能糊」，⛔ 不是「不许」。 */}
        {overBudget && setup.budget ? (
          <p
            data-testid="operator-lora-setup-over-budget"
            className="text-2xs text-destructive"
          >
            {t('confirm.loraSetup.overBudget', {
              limit: formatWeight(setup.budget.limit),
            })}
          </p>
        ) : null}
      </div>
    </section>
  )
}
