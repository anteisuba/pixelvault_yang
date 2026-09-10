'use client'

import { useTranslations } from 'next-intl'
import {
  ASSISTANT_OPERATOR_CONFIRM_CHOICES,
  type AssistantOperatorConfirmChoice,
} from '@/constants/assistant-operator'
import type { StudioOperatorConfirm } from '@/types/studio-assistant-operator'

export function StudioOperatorConfirmCard({
  confirm,
  onAnswer,
}: {
  confirm: StudioOperatorConfirm
  onAnswer(choice: AssistantOperatorConfirmChoice): void
}) {
  const t = useTranslations('StudioOperator')
  return (
    <section
      data-testid="operator-confirm-bar"
      className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3"
      aria-label={t('confirm.title')}
    >
      <p className="text-sm font-medium">{t('confirm.title')}</p>
      <div className="space-y-2 text-2sm">
        <details>
          <summary className="cursor-pointer text-muted-foreground">
            {t('confirm.current')}
          </summary>
          <p className="mt-1 max-h-36 overflow-y-auto whitespace-pre-wrap break-words">
            {confirm.have}
          </p>
        </details>
        <p className="text-muted-foreground">{t('confirm.proposed')}</p>
        <p className="max-h-52 overflow-y-auto whitespace-pre-wrap break-words">
          {confirm.proposed}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {Object.values(ASSISTANT_OPERATOR_CONFIRM_CHOICES).map((choice) => (
          <button
            key={choice}
            type="button"
            data-testid={`operator-confirm-${choice}`}
            onClick={() => onAnswer(choice)}
            className="rounded-full border border-primary/30 px-3 py-1.5 text-2sm font-medium text-primary transition-colors hover:bg-primary/10"
          >
            {t(`confirm.choice.${choice}`)}
          </button>
        ))}
      </div>
    </section>
  )
}
