'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { LayoutGrid, Palette, Sun, ThumbsUp, User } from '@/components/icons'

import type { GenerationEvaluation } from '@/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

/**
 * 「满意」= 请 AI 给这张打分（`evaluateGenerationAPI`）。宿主把这一单走到哪告诉条子，
 * 条子说出来：⛔ 点了没动静（11-19 真机走查）。
 */
export type StudioSatisfiedStatus = 'idle' | 'evaluating' | 'failed'

interface StudioResultFeedbackProps {
  generationId: string
  evaluation: GenerationEvaluation | null
  onFeedback: (tags: string[]) => void
  satisfiedStatus?: StudioSatisfiedStatus
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
  satisfiedStatus = 'idle',
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
      const currentTags =
        selection.generationId === generationId ? selection.tags : []
      const next = getNextTags(currentTags, tag)
      setSelection({ generationId, tags: next })
      onFeedback(next)
    },
    [generationId, onFeedback, selection],
  )

  return (
    <div className="mt-2 flex flex-col gap-2" data-generation-id={generationId}>
      {evaluation !== null && (
        <div className="rounded-md border border-border/60 bg-background/60 px-3 py-2">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-2xs text-muted-foreground">
              {t('overallScore')}
            </span>
            <span className="text-2sm font-semibold text-foreground">
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
            // 选中 = 实心黑药丸（主钮那一档），⛔ 原来的 10% 底色在浅色面上几乎看不出变化。
            <Button
              key={tag}
              type="button"
              variant={active ? 'default' : 'secondary'}
              size="sm"
              aria-pressed={active}
              data-active={active}
              onClick={() => handleToggle(tag)}
              className={cn('h-8 px-3', !active && 'shadow-none')}
            >
              <Icon className="size-3" />
              {t(labelKey)}
            </Button>
          )
        })}
      </div>

      {selectedTags.includes('satisfied') && satisfiedStatus !== 'idle' ? (
        <p
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 text-2xs text-muted-foreground"
        >
          {satisfiedStatus === 'evaluating' ? (
            <Spinner size="sm" aria-hidden />
          ) : null}
          <span>
            {satisfiedStatus === 'evaluating'
              ? t('evaluating')
              : t('evalFailed')}
          </span>
          {satisfiedStatus === 'failed' ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => onFeedback(selectedTags)}
            >
              {t('evalRetry')}
            </Button>
          ) : null}
        </p>
      ) : null}
    </div>
  )
}
