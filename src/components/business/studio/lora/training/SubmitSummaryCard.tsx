'use client'

import { Clock, Coins, ImageIcon, Layers } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { LORA_TRAINING } from '@/constants/config'
import {
  LORA_TRAINING_BASE_MODELS,
  type LoraTrainingBaseModel,
} from '@/constants/lora'
import { cn } from '@/lib/utils'

export interface SubmitSummaryCardProps {
  imageCount: number
  baseModel: LoraTrainingBaseModel
  presetName?: string | null
  className?: string
}

/**
 * "About to spend money" card. Appears just above the Submit button once
 * the gate is open (per plan: hidden when disabled). Surfaces the four
 * facts the user is committing to: image count, base model, estimated
 * cost, estimated time. The visual is the "cost moment" called out in
 * the design review — drag attention to the commit, not the form.
 */
export function SubmitSummaryCard({
  imageCount,
  baseModel,
  presetName,
  className,
}: SubmitSummaryCardProps) {
  const t = useTranslations('LoraTraining')
  const baseLabel =
    LORA_TRAINING_BASE_MODELS.find((m) => m.id === baseModel)?.label ??
    baseModel

  return (
    <section
      aria-label={t('submitSummaryAriaLabel')}
      className={cn(
        'rounded-xl border border-primary/30 bg-primary/5 p-4 shadow-sm',
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2">
        <p className="font-display text-sm font-semibold text-foreground">
          {t('submitSummaryTitle')}
        </p>
        {presetName ? (
          <span className="rounded-full border border-primary/30 bg-background px-2 py-0.5 text-[10px] font-medium text-primary">
            {presetName}
          </span>
        ) : null}
      </header>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCell
          icon={<ImageIcon className="size-3.5" aria-hidden />}
          label={t('summaryImages')}
          value={String(imageCount)}
        />
        <SummaryCell
          icon={<Layers className="size-3.5" aria-hidden />}
          label={t('summaryBaseModel')}
          value={baseLabel}
        />
        <SummaryCell
          icon={<Coins className="size-3.5" aria-hidden />}
          label={t('summaryCost')}
          value={LORA_TRAINING.ESTIMATED_COST_USD}
        />
        <SummaryCell
          icon={<Clock className="size-3.5" aria-hidden />}
          label={t('summaryTime')}
          value={t('summaryTimeValue', {
            min: LORA_TRAINING.ESTIMATED_TIME_MIN,
          })}
        />
      </div>
    </section>
  )
}

interface SummaryCellProps {
  icon: React.ReactNode
  label: string
  value: string
}

function SummaryCell({ icon, label, value }: SummaryCellProps) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-background/60 p-2.5">
      <span className="mt-0.5 text-primary">{icon}</span>
      <div className="min-w-0 space-y-0.5">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  )
}
