'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { LayoutGrid, Palette, Sun, ThumbsUp, User } from 'lucide-react'

import type { GenerationEvaluation } from '@/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface StudioResultFeedbackProps {
  generationId: string
  evaluation: GenerationEvaluation | null
  onFeedback: (tags: string[]) => void
}

type FeedbackTag =
  | 'subject_mismatch'
  | 'style_mismatch'
  | 'composition_mismatch'
  | 'lighting_issue'
  | 'satisfied'

const FEEDBACK_OPTIONS: Array<{
  tag: FeedbackTag
  labelKey: string
  icon: React.ComponentType<{ className?: string }>
}> = [
  { tag: 'subject_mismatch', labelKey: 'subjectMismatch', icon: User },
  { tag: 'style_mismatch', labelKey: 'styleMismatch', icon: Palette },
  {
    tag: 'composition_mismatch',
    labelKey: 'compositionMismatch',
    icon: LayoutGrid,
  },
  { tag: 'lighting_issue', labelKey: 'lightingIssue', icon: Sun },
  { tag: 'satisfied', labelKey: 'satisfied', icon: ThumbsUp },
]

function getNextTags(current: FeedbackTag[], tag: FeedbackTag): FeedbackTag[] {
  if (current.includes(tag)) {
    return current.filter((item) => item !== tag)
  }

  if (tag === 'satisfied') {
    return ['satisfied']
  }

  return [...current.filter((item) => item !== 'satisfied'), tag]
}

export function StudioResultFeedback({
  generationId,
  evaluation,
  onFeedback,
}: StudioResultFeedbackProps) {
  const t = useTranslations('StudioResultFeedback')
  const [selection, setSelection] = useState<{
    generationId: string
    tags: FeedbackTag[]
  }>({ generationId, tags: [] })
  const selectedTags =
    selection.generationId === generationId ? selection.tags : []
  const scorePercent =
    evaluation === null
      ? 0
      : Math.max(0, Math.min(100, evaluation.overall * 10))

  const handleToggle = useCallback(
    (tag: FeedbackTag) => {
      setSelection((current) => {
        const currentTags =
          current.generationId === generationId ? current.tags : []
        const next = getNextTags(currentTags, tag)
        onFeedback(next)
        return { generationId, tags: next }
      })
    },
    [generationId, onFeedback],
  )

  return (
    <div className="mt-2 flex flex-col gap-2" data-generation-id={generationId}>
      {evaluation !== null && (
        <div className="rounded-md border border-border/60 bg-background/60 px-3 py-2">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-muted-foreground">
              {t('overallScore')}
            </span>
            <span className="text-xs font-semibold text-foreground">
              {evaluation.overall.toFixed(1)}/10
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${scorePercent}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {FEEDBACK_OPTIONS.map(({ tag, labelKey, icon: Icon }) => {
          const active = selectedTags.includes(tag)

          return (
            <Button
              key={tag}
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={active}
              data-active={active}
              onClick={() => handleToggle(tag)}
              className={cn(
                'h-8 rounded-full border-border/60 bg-background/70 px-3 text-xs shadow-none',
                'hover:border-primary/30 hover:text-primary',
                active &&
                  'border-primary/40 bg-primary/10 text-primary hover:bg-primary/10',
              )}
            >
              <Icon className="size-3" />
              {t(labelKey)}
            </Button>
          )
        })}
      </div>
    </div>
  )
}
