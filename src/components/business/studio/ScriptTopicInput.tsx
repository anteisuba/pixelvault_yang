'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  VIDEO_SCRIPT_TARGET_DURATIONS,
  CONSISTENCY_MODES,
  VIDEO_SCRIPT_VIDEO_MODELS,
  deriveSceneCount,
  type VideoScriptTargetDuration,
  type ConsistencyMode,
  type VideoScriptVideoModel,
} from '@/constants/video-script'
import type { CreateVideoScriptInput } from '@/types/video-script'

interface ScriptTopicInputProps {
  isGenerating: boolean
  error: string | null
  onSubmit: (input: CreateVideoScriptInput) => void
}

export function ScriptTopicInput({
  isGenerating,
  error,
  onSubmit,
}: ScriptTopicInputProps) {
  const t = useTranslations('VideoScript')

  const [topic, setTopic] = useState('')
  const [targetDuration, setTargetDuration] =
    useState<VideoScriptTargetDuration>(30)
  const [consistencyMode, setConsistencyMode] =
    useState<ConsistencyMode>('first_frame_ref')
  const [characterCardId, setCharacterCardId] = useState<string>('')
  const [videoModelId, setVideoModelId] =
    useState<VideoScriptVideoModel>('seedance-2-fast')

  const sceneCount = deriveSceneCount(targetDuration)

  const canSubmit =
    topic.trim().length > 0 &&
    !isGenerating &&
    (consistencyMode !== 'character_card' || characterCardId.length > 0)

  const handleSubmit = () => {
    if (!canSubmit) return
    onSubmit({
      topic: topic.trim(),
      targetDuration,
      consistencyMode,
      characterCardId:
        consistencyMode === 'character_card' ? characterCardId : null,
      videoModelId,
    })
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">{t('emptyStateHint')}</p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="vs-topic">{t('topicLabel')}</Label>
        <Textarea
          id="vs-topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={t('topicPlaceholder')}
          rows={3}
          maxLength={1000}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t('durationLabel')}</Label>
        <Select
          value={String(targetDuration)}
          onValueChange={(v) =>
            setTargetDuration(Number(v) as VideoScriptTargetDuration)
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VIDEO_SCRIPT_TARGET_DURATIONS.map((d) => (
              <SelectItem key={d} value={String(d)}>
                {t(`duration${d}s` as 'duration30s')} ·{' '}
                {t('sceneCountPreview', { count: deriveSceneCount(d) })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {t('sceneCountPreview', { count: sceneCount })}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t('consistencyModeLabel')}</Label>
        <Select
          value={consistencyMode}
          onValueChange={(v) => setConsistencyMode(v as ConsistencyMode)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONSISTENCY_MODES.map((m) => (
              <SelectItem key={m} value={m}>
                {m === 'character_card'
                  ? t('consistencyCharacterCard')
                  : t('consistencyFirstFrameRef')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {consistencyMode === 'character_card' && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="vs-char">{t('characterCardLabel')}</Label>
          <input
            id="vs-char"
            type="text"
            value={characterCardId}
            onChange={(e) => setCharacterCardId(e.target.value)}
            placeholder={t('characterCardMissing')}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label>{t('videoModelLabel')}</Label>
        <Select
          value={videoModelId}
          onValueChange={(v) => setVideoModelId(v as VideoScriptVideoModel)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VIDEO_SCRIPT_VIDEO_MODELS.map((m) => (
              <SelectItem key={m} value={m}>
                {m === 'seedance-2-fast'
                  ? t('videoModelSeedance')
                  : t('videoModelKling')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button onClick={handleSubmit} disabled={!canSubmit} className="mt-1">
        {isGenerating ? t('generatingButton') : t('generateButton')}
      </Button>
    </div>
  )
}
