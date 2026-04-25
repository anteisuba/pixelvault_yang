'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { ThumbsUp, User, Palette, LayoutGrid, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStudioForm } from '@/contexts/studio-context'
import { evaluateGenerationAPI } from '@/lib/api-client/generation'
import type { GenerationRecord, GenerationEvaluation } from '@/types'

interface StudioResultFeedbackProps {
  generation: GenerationRecord
}

type FeedbackTag =
  | 'satisfied'
  | 'subjectMismatch'
  | 'styleMismatch'
  | 'compositionMismatch'
  | 'lightingMismatch'

const FEEDBACK_BUTTONS: Array<{
  tag: FeedbackTag
  icon: React.ComponentType<{ className?: string }>
}> = [
  { tag: 'satisfied', icon: ThumbsUp },
  { tag: 'subjectMismatch', icon: User },
  { tag: 'styleMismatch', icon: Palette },
  { tag: 'compositionMismatch', icon: LayoutGrid },
  { tag: 'lightingMismatch', icon: Sun },
]

export function StudioResultFeedback({
  generation,
}: StudioResultFeedbackProps) {
  const { dispatch } = useStudioForm()
  const t = useTranslations('StudioResultFeedback')

  const [evaluating, setEvaluating] = useState(false)
  const [evaluation, setEvaluation] = useState<GenerationEvaluation | null>(
    null,
  )
  const [evalError, setEvalError] = useState(false)

  const handleSatisfied = useCallback(async () => {
    if (evaluating) return
    setEvaluating(true)
    setEvalError(false)
    const result = await evaluateGenerationAPI(generation.id)
    setEvaluating(false)
    if (result.success && result.data) {
      setEvaluation(result.data)
    } else {
      setEvalError(true)
    }
  }, [generation.id, evaluating])

  const handleMismatch = useCallback(() => {
    dispatch({ type: 'OPEN_PANEL', payload: 'keepChange' })
  }, [dispatch])

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {FEEDBACK_BUTTONS.map(({ tag, icon: Icon }) => (
          <button
            key={tag}
            type="button"
            onClick={
              tag === 'satisfied'
                ? () => void handleSatisfied()
                : handleMismatch
            }
            disabled={evaluating}
            className={cn(
              'border-border/40 bg-background/80 flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs transition-all',
              'hover:border-primary/30 hover:text-primary active:scale-95',
              evaluating && 'cursor-not-allowed opacity-50',
            )}
          >
            <Icon className="size-3" />
            {t(tag)}
          </button>
        ))}
      </div>

      {evaluating && (
        <p className="text-muted-foreground animate-pulse font-serif text-xs">
          {t('evaluating')}
        </p>
      )}

      {evaluation && !evaluating && (
        <div className="border-border/40 bg-background/60 rounded-lg border px-3 py-2">
          <p className="text-foreground text-xs font-medium">
            {t('scoreLabel', { score: Math.round(evaluation.overall * 100) })}
          </p>
          {evaluation.suggestedFixes.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {evaluation.suggestedFixes.slice(0, 2).map((fix, i) => (
                <li
                  key={i}
                  className="text-muted-foreground font-serif text-xs"
                >
                  • {fix}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {evalError && !evaluating && (
        <p className="text-muted-foreground font-serif text-xs">
          {t('evalFailed')}
        </p>
      )}
    </div>
  )
}
