'use client'

import { useTranslations } from 'next-intl'

import { STUDIO_OPERATOR_CONFIRM_STATUS_IDS } from '@/constants/studio-assistant-operator'
import type { ASSISTANT_OPERATOR_CONFIRM_KIND_IDS } from '@/constants/assistant-operator'
import type { StudioOperatorConfirmPrompt } from '@/types/studio-assistant-operator'

/**
 * **交给图片助手**（卡片助手 C3，画板 S11；owner 09-27 选「跳过去，话填好你来发」）。
 *
 * ⭐ 一句要对图片助手说的话 + 一行「会发生什么」+ 两颗键。点「交给图片助手」→ 跳到
 *   图片工作台、带上这个角色、打开图片助手、把话填进输入框，**由用户按发送**。
 * ⛔ 不报价：价钱在工作台上看（那边才知道用哪个模型）。
 * ⚠ 已决之后整卡收成一行「态 · 时间」（确认卡不离场）。
 */

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

export function StudioOperatorImageHandoffCard({
  prompt,
  characterName,
  assistantName,
  onAccept,
  onDismiss,
  formatTime,
}: StudioOperatorImageHandoffCardProps) {
  const t = useTranslations('StudioOperator')
  const status = prompt.status

  if (
    status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed ||
    status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.cancelled
  ) {
    const time = prompt.decidedAt ? formatTime(prompt.decidedAt) : ''
    return (
      <section
        data-testid="operator-image-handoff-card"
        data-status={status}
        className="overflow-hidden rounded-xl bg-card"
      >
        <p className="flex items-center gap-2 px-3 py-2 text-2sm text-muted-foreground">
          <span className="shrink-0 font-semibold">
            {status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed
              ? t('confirm.imageHandoff.accepted', { time })
              : t('confirm.state.cancelled', { time })}
          </span>
          <span className="min-w-0 flex-1 truncate">{characterName}</span>
        </p>
      </section>
    )
  }

  return (
    <section
      data-testid="operator-image-handoff-card"
      data-status={status}
      className="overflow-hidden rounded-xl bg-card"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-2xs uppercase tracking-nav text-muted-foreground">
          {t('confirm.imageHandoff.header', { name: assistantName })}
        </span>
      </div>
      <div className="flex flex-col gap-2.5 p-3">
        <p className="whitespace-pre-line rounded-lg bg-muted px-3 py-2 text-sm leading-relaxed text-foreground">
          {prompt.handoff.request}
        </p>
        <p className="text-2xs text-muted-foreground">
          {t('confirm.imageHandoff.hint', { name: characterName })}
        </p>
        <div className="flex items-center justify-end gap-1.5 border-t border-border pt-2.5">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md border border-border bg-card px-3 py-1 text-2sm text-muted-foreground transition-colors duration-fast ease-standard hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            {t('confirm.imageHandoff.dismiss')}
          </button>
          <button
            type="button"
            data-testid="operator-image-handoff-accept"
            onClick={onAccept}
            className="rounded-md bg-primary px-3 py-1 text-2sm text-primary-foreground transition-opacity duration-fast ease-standard hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            {t('confirm.imageHandoff.accept')}
          </button>
        </div>
      </div>
    </section>
  )
}
