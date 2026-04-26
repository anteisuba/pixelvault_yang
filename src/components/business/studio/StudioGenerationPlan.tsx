'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'

import type { GenerationPlanResponse } from '@/types'
import { fetchGenerationPlanAPI } from '@/lib/api-client/generation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface StudioGenerationPlanProps {
  open: boolean
  prompt: string
  onGenerate: (params: {
    modelId: string | null
    compiledPrompt: string
    negativePrompt?: string
  }) => void
  onClose: () => void
}

type PlanState =
  | { status: 'loading' }
  | { status: 'loaded'; plan: GenerationPlanResponse }
  | { status: 'error' }

interface PlanContentProps {
  prompt: string
  onGenerate: StudioGenerationPlanProps['onGenerate']
  onClose: () => void
}

/**
 * PlanContent — inner component. Mounted fresh whenever the dialog opens
 * (via the `{open && <PlanContent />}` pattern), so initial state is always
 * 'loading' without needing to reset it in an effect.
 */
function PlanContent({ prompt, onGenerate, onClose }: PlanContentProps) {
  const t = useTranslations('StudioGenerationPlan')
  const [state, setState] = useState<PlanState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    fetchGenerationPlanAPI({ naturalLanguage: prompt }).then((result) => {
      if (cancelled) return
      if (result.success && result.data) {
        setState({ status: 'loaded', plan: result.data })
      } else {
        setState({ status: 'error' })
      }
    })

    return () => {
      cancelled = true
    }
  }, [prompt])

  const handleGenerate = () => {
    if (state.status === 'loaded') {
      const topModel = state.plan.recommendedModels[0]
      onGenerate({
        modelId: topModel?.modelId ?? null,
        compiledPrompt: state.plan.promptDraft,
        negativePrompt: state.plan.negativePromptDraft,
      })
    } else {
      onGenerate({ modelId: null, compiledPrompt: prompt })
    }
  }

  return (
    <>
      {state.status === 'loading' && (
        <div className="flex items-center justify-center py-8 gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{t('loading')}</span>
        </div>
      )}

      {state.status === 'error' && (
        <div className="py-4">
          <p className="text-sm text-destructive mb-4">{t('loadFailed')}</p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button onClick={handleGenerate}>{t('generateNow')}</Button>
          </div>
        </div>
      )}

      {state.status === 'loaded' && (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-1">{t('promptSection')}</p>
            <p className="text-sm text-muted-foreground">
              {state.plan.promptDraft}
            </p>
          </div>

          {state.plan.recommendedModels.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">{t('modelsSection')}</p>
              <ul className="space-y-1">
                {state.plan.recommendedModels.map((m) => (
                  <li key={m.modelId} className="text-sm">
                    <span className="font-mono">{m.modelId}</span>
                    {' — '}
                    <span className="text-muted-foreground">{m.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button onClick={handleGenerate}>{t('generateNow')}</Button>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * StudioGenerationPlan — fetches a generation plan for the given prompt and
 * lets the user confirm or dismiss. Shows recommended models, prompt draft,
 * and allows generating with the top-ranked model.
 */
export function StudioGenerationPlan({
  open,
  prompt,
  onGenerate,
  onClose,
}: StudioGenerationPlanProps) {
  const t = useTranslations('StudioGenerationPlan')

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>
        {open && (
          <PlanContent
            prompt={prompt}
            onGenerate={onGenerate}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
