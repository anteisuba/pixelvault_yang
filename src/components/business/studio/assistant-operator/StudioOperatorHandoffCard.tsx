'use client'

import { useTranslations } from 'next-intl'

import { STUDIO_OPERATOR_CONFIRM_STATUS_IDS } from '@/constants/studio-assistant-operator'
import type { ASSISTANT_OPERATOR_CONFIRM_KIND_IDS } from '@/constants/assistant-operator'
import type { StudioOperatorConfirmPrompt } from '@/types/studio-assistant-operator'

/**
 * **把这件事交到另一处去**的卡 —— 一句要带过去的话 + 一行「会发生什么」+ 两颗键。
 *
 * 两种用法共用这一张（同一个形状，⛔ 不各画一套）：
 *  · 交给图片助手（卡片助手 C3，画板 S11；owner 09-27 选「跳过去，话填好你来发」）；
 *  · 换到另一台图片工作台（自然语言台 ↔ 标签台，owner 2026-10-04）。
 * 点下去都是**跳过去、把话填进那边的输入框，由用户按发送**。⛔ 不报价、不替用户发。
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
  /** 收起后那一行的主语（角色名 / 模型名）。 */
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

type ImageHandoffPrompt = Extract<
  StudioOperatorConfirmPrompt,
  { kind: typeof ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.imageHandoff }
>

export interface StudioOperatorImageHandoffCardProps {
  prompt: ImageHandoffPrompt
  characterName: string
  assistantName: string
  onAccept(): void
  onDismiss(): void
  formatTime(iso: string): string
}

/** 交给图片助手（卡片助手 C3）。 */
export function StudioOperatorImageHandoffCard({
  prompt,
  characterName,
  assistantName,
  onAccept,
  onDismiss,
  formatTime,
}: StudioOperatorImageHandoffCardProps) {
  const t = useTranslations('StudioOperator')
  return (
    <StudioOperatorHandoffCard
      testId="operator-image-handoff"
      status={prompt.status}
      decidedAt={prompt.decidedAt}
      header={t('confirm.imageHandoff.header', { name: assistantName })}
      request={prompt.handoff.request}
      hint={t('confirm.imageHandoff.hint', { name: characterName })}
      acceptLabel={t('confirm.imageHandoff.accept')}
      dismissLabel={t('confirm.imageHandoff.dismiss')}
      acceptedLabel={(time) => t('confirm.imageHandoff.accepted', { time })}
      subject={characterName}
      onAccept={onAccept}
      onDismiss={onDismiss}
      formatTime={formatTime}
    />
  )
}

type WorkbenchHandoffPrompt = Extract<
  StudioOperatorConfirmPrompt,
  { kind: typeof ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.workbenchHandoff }
>

export interface StudioOperatorWorkbenchHandoffCardProps {
  prompt: WorkbenchHandoffPrompt
  onAccept(): void
  onDismiss(): void
  formatTime(iso: string): string
}

/** 换到另一台图片工作台（自然语言台 ↔ 标签台）。 */
export function StudioOperatorWorkbenchHandoffCard({
  prompt,
  onAccept,
  onDismiss,
  formatTime,
}: StudioOperatorWorkbenchHandoffCardProps) {
  const t = useTranslations('StudioOperator')
  const bench = t(
    prompt.handoff.workspace === 'image-tags'
      ? 'confirm.workbenchHandoff.tags'
      : 'confirm.workbenchHandoff.natural',
  )
  return (
    <StudioOperatorHandoffCard
      testId="operator-workbench-handoff"
      status={prompt.status}
      decidedAt={prompt.decidedAt}
      header={t('confirm.workbenchHandoff.header', {
        bench,
        model: prompt.handoff.label,
      })}
      request={prompt.handoff.request}
      hint={t('confirm.workbenchHandoff.hint', { bench })}
      acceptLabel={t('confirm.workbenchHandoff.accept')}
      dismissLabel={t('confirm.workbenchHandoff.dismiss')}
      acceptedLabel={(time) =>
        t('confirm.workbenchHandoff.accepted', { bench, time })
      }
      subject={prompt.handoff.label}
      onAccept={onAccept}
      onDismiss={onDismiss}
      formatTime={formatTime}
    />
  )
}
