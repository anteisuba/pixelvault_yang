'use client'

import { useMemo, useState, useCallback } from 'react'
import { Loader2, Mic } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { getAvailableAudioModels } from '@/constants/models'
import {
  FISH_AUDIO_VOICES,
  TTS_SPEED_RANGE,
  TTS_MAX_TEXT_LENGTH,
} from '@/constants/audio-options'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

import { AudioPlayer } from '@/components/ui/audio-player'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ErrorAlert } from '@/components/ui/error-alert'
import {
  ModelSelector,
  type StudioModelOption,
} from '@/components/business/ModelSelector'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { generateAudioAPI } from '@/lib/api-client'
import {
  buildSavedModelOptions,
  mergeModelOptionsWithPreferredSavedRoutes,
} from '@/lib/model-options'
import type { ApiKeyHealthStatus } from '@/types'
import type { GenerationRecord } from '@/types'

export default function AudioGenerateForm() {
  const tStudio = useTranslations('StudioPage')
  const { keys, healthMap } = useApiKeysContext()

  // Form state
  const [text, setText] = useState('')
  const [selectedModelId, setSelectedModelId] = useState('')
  const [voiceId, setVoiceId] = useState<string>(FISH_AUDIO_VOICES[0].id)
  const [speed, setSpeed] = useState<number>(TTS_SPEED_RANGE.default)

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastGeneration, setLastGeneration] = useState<GenerationRecord | null>(
    null,
  )

  // Build model options
  const audioModels = useMemo(() => getAvailableAudioModels(), [])
  const builtInOptions: StudioModelOption[] = useMemo(
    () =>
      audioModels.map((m) => ({
        optionId: `workspace:${m.id}`,
        modelId: m.id,
        adapterType: m.adapterType,
        providerConfig: m.providerConfig,
        requestCount: 0,
        isBuiltIn: true,
        freeTier: m.freeTier,
        sourceType: 'workspace' as const,
      })),
    [audioModels],
  )

  const savedOptions = useMemo(
    () =>
      buildSavedModelOptions(
        keys.filter((k: { adapterType: string }) =>
          [AI_ADAPTER_TYPES.FISH_AUDIO, AI_ADAPTER_TYPES.FAL].includes(
            k.adapterType as AI_ADAPTER_TYPES,
          ),
        ),
      ),
    [keys],
  )

  const allOptions = useMemo(
    () =>
      mergeModelOptionsWithPreferredSavedRoutes(
        savedOptions,
        builtInOptions,
        healthMap,
      ),
    [builtInOptions, savedOptions, healthMap],
  )

  // Default to first model
  const effectiveModelId = selectedModelId || allOptions[0]?.modelId || ''
  const selectedOption = allOptions.find((o) => o.modelId === effectiveModelId)

  const handleGenerate = useCallback(async () => {
    if (!text.trim() || !effectiveModelId) return

    setIsGenerating(true)
    setError(null)

    const result = await generateAudioAPI({
      prompt: text,
      modelId: effectiveModelId,
      voiceId,
      speed,
      apiKeyId:
        selectedOption?.sourceType === 'saved'
          ? selectedOption.keyId
          : undefined,
    })

    setIsGenerating(false)

    if (!result.success) {
      setError(result.error ?? 'Generation failed')
      return
    }

    if (result.data?.generation) {
      setLastGeneration(result.data.generation)
    }
  }, [text, effectiveModelId, voiceId, speed, selectedOption])

  const charCount = text.length

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-6 px-4 pb-20 pt-8">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">
          {tStudio('audioTitle')}
        </h2>
        <p className="mt-1 font-serif text-sm text-muted-foreground">
          {tStudio('audioSubtitle')}
        </p>
      </div>

      {/* Model Selector */}
      <div className="flex flex-col gap-2">
        <label className="font-display text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {tStudio('audioModel')}
        </label>
        <ModelSelector
          value={effectiveModelId}
          onChange={setSelectedModelId}
          options={allOptions}
        />
      </div>

      {/* Voice Selector */}
      <div className="flex flex-col gap-2">
        <label className="font-display text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {tStudio('audioVoice')}
        </label>
        <select
          value={voiceId}
          onChange={(e) => setVoiceId(e.target.value)}
          className="h-12 rounded-lg border border-border bg-white px-4 font-display text-sm text-foreground transition-colors hover:border-primary focus:border-primary focus:outline-none"
        >
          {FISH_AUDIO_VOICES.map((voice) => (
            <option key={voice.id} value={voice.id}>
              {tStudio(`voices.${voice.labelKey}`)}
            </option>
          ))}
        </select>
      </div>

      {/* Text Input */}
      <div className="flex flex-col gap-2">
        <label className="font-display text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {tStudio('audioText')}
        </label>
        <div className="relative">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={tStudio('audioPlaceholder')}
            className="min-h-[160px] resize-y rounded-lg border-border bg-white font-serif text-sm leading-relaxed"
            maxLength={TTS_MAX_TEXT_LENGTH}
          />
          <span className="absolute bottom-2 right-3 font-display text-[11px] text-muted-foreground">
            {charCount.toLocaleString()} /{' '}
            {TTS_MAX_TEXT_LENGTH.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Speed Slider */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="font-display text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {tStudio('audioSpeed')}
          </label>
          <span className="font-display text-sm font-semibold text-foreground">
            {speed.toFixed(1)}&times;
          </span>
        </div>
        <input
          type="range"
          min={TTS_SPEED_RANGE.min}
          max={TTS_SPEED_RANGE.max}
          step={TTS_SPEED_RANGE.step}
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          className="h-1 w-full cursor-pointer appearance-none rounded-full bg-border accent-primary"
        />
        <div className="flex justify-between font-display text-[10px] text-muted-foreground">
          <span>{TTS_SPEED_RANGE.min}&times;</span>
          <span>{TTS_SPEED_RANGE.max}&times;</span>
        </div>
      </div>

      {/* Error */}
      {error && <ErrorAlert message={error} />}

      {/* Generate Button */}
      <Button
        onClick={handleGenerate}
        disabled={isGenerating || !text.trim()}
        className="h-[52px] gap-2 rounded-xl font-display text-[15px] font-semibold shadow-sm shadow-primary/20"
      >
        {isGenerating ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {tStudio('audioGenerating')}
          </>
        ) : (
          <>
            <Mic className="size-4" />
            {tStudio('audioGenerate')}
          </>
        )}
      </Button>

      {/* Result */}
      {lastGeneration && (
        <div className="flex flex-col gap-2">
          <span className="font-display text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {tStudio('audioResult')}
          </span>
          <AudioPlayer src={lastGeneration.url} />
        </div>
      )}
    </div>
  )
}
