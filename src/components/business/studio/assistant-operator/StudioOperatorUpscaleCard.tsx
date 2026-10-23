'use client'

import { useTranslations } from 'next-intl'

import { STUDIO_OPERATOR_CONFIRM_STATUS_IDS } from '@/constants/studio-assistant-operator'
import type { ASSISTANT_OPERATOR_CONFIRM_KIND_IDS } from '@/constants/assistant-operator'
import type { StudioOperatorConfirmPrompt } from '@/types/studio-assistant-operator'

/**
 * 一句话 + 一行「会发生什么」+ 两颗键的提议卡（现在只有画布放大用它；交接卡第 9e 步换成了「开台」）。
 * ⚠ 已决之后整卡收成一行「态 · 时间」（确认卡不离场）。
 */

interface StudioOperatorHandoffCardProps {
  /** `data-testid` 前缀：卡是 `${testId}-card`，主键是 `${testId}-accept`。 */
  testId: string
  status: StudioOperatorConfirmPrompt['status']
  decidedAt?: string
  header: string
  /** 要带过去的那句话；没有就不画那一格。 */
  request?: string
  hint: string
  acceptLabel: string
  dismissLabel: string
  acceptedLabel(time: string): string
  /** 收起后那一行的主语。 */
  subject: string
  onAccept(): void
  onDismiss(): void
  formatTime(iso: string): string
}

function StudioOperatorHandoffCard({
  testId,
  status,
  decidedAt,
  header,
  request,
  hint,
  acceptLabel,
  dismissLabel,
  acceptedLabel,
  subject,
  onAccept,
  onDismiss,
  formatTime,
}: StudioOperatorHandoffCardProps) {
  const t = useTranslations('StudioOperator')

  if (
    status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed ||
    status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.cancelled
  ) {
    const time = decidedAt ? formatTime(decidedAt) : ''
    return (
      <section
        data-testid={`${testId}-card`}
        data-status={status}
        className="overflow-hidden rounded-xl bg-card"
      >
        <p className="flex items-center gap-2 px-3 py-2 text-2sm text-muted-foreground">
          <span className="shrink-0 font-semibold">
            {status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed
              ? acceptedLabel(time)
              : t('confirm.state.cancelled', { time })}
          </span>
          <span className="min-w-0 flex-1 truncate">{subject}</span>
        </p>
      </section>
    )
  }

  return (
    <section
      data-testid={`${testId}-card`}
      data-status={status}
      className="overflow-hidden rounded-xl bg-card"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-2xs uppercase tracking-nav text-muted-foreground">
          {header}
        </span>
      </div>
      <div className="flex flex-col gap-2.5 p-3">
        {request ? (
          <p className="whitespace-pre-line rounded-lg bg-muted px-3 py-2 text-sm leading-relaxed text-foreground">
            {request}
          </p>
        ) : null}
        <p className="text-2xs text-muted-foreground">{hint}</p>
        <div className="flex items-center justify-end gap-1.5 border-t border-border pt-2.5">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md border border-border bg-card px-3 py-1 text-2sm text-muted-foreground transition-colors duration-fast ease-standard hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            {dismissLabel}
          </button>
          <button
            type="button"
            data-testid={`${testId}-accept`}
            onClick={onAccept}
            className="rounded-md bg-primary px-3 py-1 text-2sm text-primary-foreground transition-opacity duration-fast ease-standard hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            {acceptLabel}
          </button>
        </div>
      </div>
    </section>
  )
}

type UpscalePrompt = Extract<
  StudioOperatorConfirmPrompt,
  { kind: typeof ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.upscale }
>

export interface StudioOperatorUpscaleCardProps {
  prompt: UpscalePrompt
  onAccept(): void
  onDismiss(): void
  formatTime(iso: string): string
}

/**
 * 画布上放大几张卡（P6，owner 2026-10-16「修到 4K」走放大）。同一张卡的形状：要放大的那几张
 * + 一行「会发生什么」（新版本、原图留着、你的 fal key、不扣积分）+ 两颗键。
 */
export function StudioOperatorUpscaleCard({
  prompt,
  onAccept,
  onDismiss,
  formatTime,
}: StudioOperatorUpscaleCardProps) {
  const t = useTranslations('StudioOperator')
  const names = prompt.request.nodes.map((node) => `「${node.name}」`).join('')
  return (
    <StudioOperatorHandoffCard
      testId="operator-upscale"
      status={prompt.status}
      decidedAt={prompt.decidedAt}
      header={t('confirm.upscale.header', {
        count: prompt.request.nodes.length,
      })}
      request={names}
      hint={t('confirm.upscale.hint')}
      acceptLabel={t('confirm.upscale.accept')}
      dismissLabel={t('confirm.upscale.dismiss')}
      acceptedLabel={(time) =>
        t(
          prompt.auto
            ? 'confirm.upscale.autoAccepted'
            : 'confirm.upscale.accepted',
          {
            time,
          },
        )
      }
      subject={names}
      onAccept={onAccept}
      onDismiss={onDismiss}
      formatTime={formatTime}
    />
  )
}
