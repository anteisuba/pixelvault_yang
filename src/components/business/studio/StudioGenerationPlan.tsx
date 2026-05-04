'use client'

import { useTranslations } from 'next-intl'

import type { GenerationPlanResponse } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'

interface StudioGenerationPlanProps {
  plan: GenerationPlanResponse
  onConfirm: () => void
  onEditPrompt: (newPrompt: string) => void
  onCancel: () => void
}

export function StudioGenerationPlan({
  plan,
  onConfirm,
  onEditPrompt,
  onCancel,
}: StudioGenerationPlanProps) {
  const t = useTranslations('StudioGenerationPlan')
  const negativePrompt = plan.negativePrompt ?? plan.negativePromptDraft

  return (
    <Card className="border-primary/20 bg-card shadow-sm">
      <CardHeader className="gap-3">
        <CardTitle className="font-display text-base text-foreground">
          {t('title')}
        </CardTitle>
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">
            {t('recommendedModels')}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {plan.recommendedModels.map((model) => (
              <Badge key={model.modelId} variant="secondary">
                {model.modelId}
              </Badge>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">
            {t('compiledPrompt')}
          </div>
          <Textarea
            value={plan.promptDraft}
            onChange={(event) => onEditPrompt(event.target.value)}
            className="min-h-24 resize-none bg-background/70 font-serif text-sm"
          />
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">
            {t('negativePrompt')}
          </div>
          <p className="rounded-md border border-border/60 bg-background/60 px-3 py-2 font-serif text-sm text-muted-foreground">
            {negativePrompt && negativePrompt.length > 0 ? negativePrompt : '-'}
          </p>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border/60 bg-background/60 px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">
            {t('estimatedCost')}
          </span>
          <span className="text-sm font-semibold text-foreground">
            {t('requests', { count: plan.estimatedCost })}
          </span>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('cancel')}
          </Button>
          <Button type="button" onClick={onConfirm}>
            {t('confirm')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
