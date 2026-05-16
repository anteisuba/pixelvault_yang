'use client'

import { memo } from 'react'
import { useTranslations } from 'next-intl'

import {
  AUDIO_EMOTION,
  AUDIO_PACE,
  AUDIO_PAUSE_MARKERS,
} from '@/constants/voice-cards'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

interface StudioAudioParamsProps {
  voiceCardId: string | null
  emotion: string
  pace: string
  pauseMarkers: string[]
  onChangeEmotion: (emotion: string) => void
  onChangePace: (pace: string) => void
  onChangePauseMarkers: (markers: string[]) => void
}

const EMOTION_OPTIONS = [
  { value: AUDIO_EMOTION.NEUTRAL, labelKey: 'emotionNeutral' },
  { value: AUDIO_EMOTION.HAPPY, labelKey: 'emotionHappy' },
  { value: AUDIO_EMOTION.SAD, labelKey: 'emotionSad' },
  { value: AUDIO_EMOTION.ANGRY, labelKey: 'emotionAngry' },
  { value: AUDIO_EMOTION.EXCITED, labelKey: 'emotionExcited' },
  { value: AUDIO_EMOTION.CALM, labelKey: 'emotionCalm' },
  { value: AUDIO_EMOTION.FEARFUL, labelKey: 'emotionFearful' },
] as const

const PACE_OPTIONS = [
  { value: AUDIO_PACE.SLOW, labelKey: 'paceSlow' },
  { value: AUDIO_PACE.NORMAL, labelKey: 'paceNormal' },
  { value: AUDIO_PACE.FAST, labelKey: 'paceFast' },
] as const

const PAUSE_OPTIONS = AUDIO_PAUSE_MARKERS.map((value, index) => ({
  value,
  labelKey: `pauseAfterSentence${index + 1}`,
}))

export const StudioAudioParams = memo(function StudioAudioParams({
  voiceCardId,
  emotion,
  pace,
  pauseMarkers,
  onChangeEmotion,
  onChangePace,
  onChangePauseMarkers,
}: StudioAudioParamsProps) {
  const t = useTranslations('audioParams')

  return (
    <div
      className="shrink-0 space-y-3 rounded-lg border border-border/60 bg-muted/10 p-3"
      data-voice-card-id={voiceCardId ?? undefined}
    >
      <div>
        <label className="mb-2 block text-2xs font-medium text-muted-foreground/70">
          {t('emotion')}
        </label>
        <ToggleGroup
          type="single"
          value={emotion}
          onValueChange={(value) => {
            if (value) onChangeEmotion(value)
          }}
          aria-label={t('emotion')}
          className="w-full flex-wrap justify-start"
        >
          {EMOTION_OPTIONS.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value}>
              {t(option.labelKey)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div>
        <label className="mb-2 block text-2xs font-medium text-muted-foreground/70">
          {t('pace')}
        </label>
        <ToggleGroup
          type="single"
          value={pace}
          onValueChange={(value) => {
            if (value) onChangePace(value)
          }}
          aria-label={t('pace')}
          className="w-full flex-wrap justify-start"
        >
          {PACE_OPTIONS.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value}>
              {t(option.labelKey)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div>
        <label className="mb-2 block text-2xs font-medium text-muted-foreground/70">
          {t('pauseMarkers')}
        </label>
        <ToggleGroup
          type="multiple"
          value={pauseMarkers}
          onValueChange={onChangePauseMarkers}
          aria-label={t('pauseMarkers')}
          className="w-full flex-wrap justify-start"
        >
          {PAUSE_OPTIONS.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value}>
              {t(option.labelKey)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </div>
  )
})
