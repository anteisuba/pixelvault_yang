'use client'

import { ArrowRight, Check, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'

interface PromptComparisonPanelProps {
  original: string
  enhanced: string
  style: string
  onUseEnhanced: (enhanced: string) => void
  onDismiss: () => void
}

export function PromptComparisonPanel({
  original,
  enhanced,
  style,
  onUseEnhanced,
  onDismiss,
}: PromptComparisonPanelProps) {
  const t = useTranslations('PromptEnhance')

  return (
    <div className="mt-3 rounded-2xl border border-primary/20 bg-primary/3 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">
          {t('comparisonTitle')}
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border/50 bg-background p-3">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            {t('originalLabel')}
          </p>
          <p className="font-serif text-sm leading-relaxed text-foreground/80">
            {original}
          </p>
        </div>

        <div className="rounded-xl border border-primary/25 bg-primary/5 p-3">
          <div className="mb-1.5 flex items-center gap-1.5">
            <p className="text-xs font-medium text-primary">
              {t('enhancedLabel')}
            </p>
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-3xs font-medium text-primary">
              {t(`styles.${style}.label`)}
            </span>
          </div>
          <p className="font-serif text-sm leading-relaxed text-foreground">
            {enhanced}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => onUseEnhanced(enhanced)}
          className="gap-1.5 rounded-full"
        >
          <Check className="size-3.5" />
          {t('useEnhanced')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          className="rounded-full text-muted-foreground"
        >
          {t('keepOriginal')}
        </Button>
      </div>
    </div>
  )
}
