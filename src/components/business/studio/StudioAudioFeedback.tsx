'use client'

import { useCallback, useState, type ComponentType } from 'react'
import { useTranslations } from 'next-intl'
import {
  AudioLines,
  Gauge,
  MessageCircleWarning,
  Music2,
  RotateCw,
  SmilePlus,
  Volume2,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { AudioFeedbackTag } from '@/lib/studio/audio-feedback-mapping'

interface StudioAudioFeedbackProps {
  generationId: string
  onFeedback: (tags: AudioFeedbackTag[]) => void
  onRetry?: (tags: AudioFeedbackTag[]) => void
  isRetrying?: boolean
}

const AUDIO_FEEDBACK_OPTIONS: Array<{
  tag: AudioFeedbackTag
  labelKey: string
  icon: ComponentType<{ className?: string }>
}> = [
  { tag: 'voice_mismatch', labelKey: 'voiceMismatch', icon: AudioLines },
  { tag: 'emotion_wrong', labelKey: 'emotionWrong', icon: SmilePlus },
  { tag: 'pace_wrong', labelKey: 'paceWrong', icon: Gauge },
  {
    tag: 'pronunciation_error',
    labelKey: 'pronunciationError',
    icon: MessageCircleWarning,
  },
  { tag: 'pause_unnatural', labelKey: 'pauseUnnatural', icon: Music2 },
  { tag: 'audio_quality', labelKey: 'audioQuality', icon: Volume2 },
]

function getNextTags(
  current: AudioFeedbackTag[],
  tag: AudioFeedbackTag,
): AudioFeedbackTag[] {
  if (current.includes(tag)) {
    return current.filter((item) => item !== tag)
  }

  return [...current, tag]
}

export function StudioAudioFeedback({
  generationId,
  onFeedback,
  onRetry,
  isRetrying,
}: StudioAudioFeedbackProps) {
  const t = useTranslations('audioFeedback')
  const [selection, setSelection] = useState<{
    generationId: string
    tags: AudioFeedbackTag[]
  }>({ generationId, tags: [] })
  const selectedTags =
    selection.generationId === generationId ? selection.tags : []

  const handleToggle = useCallback(
    (tag: AudioFeedbackTag) => {
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

  const handleRetry = useCallback(() => {
    if (!onRetry || selectedTags.length === 0 || isRetrying) return
    onRetry(selectedTags)
  }, [onRetry, selectedTags, isRetrying])

  const canRetry = Boolean(onRetry) && selectedTags.length > 0 && !isRetrying

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {AUDIO_FEEDBACK_OPTIONS.map(({ tag, labelKey, icon: Icon }) => {
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

      {onRetry && selectedTags.length > 0 ? (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            disabled={!canRetry}
            onClick={handleRetry}
            className="h-8 gap-1.5 rounded-full px-3 text-xs"
          >
            <RotateCw className={cn('size-3', isRetrying && 'animate-spin')} />
            {t('retryWithFixes')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
