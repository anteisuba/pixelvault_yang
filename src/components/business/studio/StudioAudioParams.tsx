'use client'

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type ComponentType,
  type KeyboardEvent,
} from 'react'
import {
  BookOpen,
  ChevronDown,
  FileAudio2,
  HelpCircle,
  Loader2,
  MessagesSquare,
  Mic2,
  MinusCircle,
  Moon,
  Plus,
  SlidersHorizontal,
  Trash2,
  Upload,
  Wind,
  X,
  Zap,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  AUDIO_ADVANCED_TAB_IDS,
  AUDIO_FORMATS,
  AUDIO_LATENCIES,
  AUDIO_MP3_BITRATES,
  AUDIO_OPUS_BITRATES,
  AUDIO_SAMPLE_RATES,
  AUDIO_SPEAKER_VOICE_ID_MAX_LENGTH,
  AUDIO_SPEAKER_VOICE_IDS_MAX,
  isAudioAdvancedTabId,
  isAudioFormat,
  isAudioLatency,
  TTS_CHUNK_LENGTH_RANGE,
  TTS_REPETITION_PENALTY_RANGE,
  TTS_TEMPERATURE_RANGE,
  TTS_TOP_P_RANGE,
  TTS_VOLUME_RANGE,
  type AudioAdvancedTabId,
  type AudioFormat,
  type AudioLatency,
} from '@/constants/audio-options'
// Note: speaker voice IDs are normalized by the reducer
// (`SET_AUDIO_SPEAKER_VOICE_IDS`), so this component trusts incoming props
// and never re-normalizes for display.
import {
  AUDIO_PACE,
  AUDIO_PAUSE_MARKERS,
  AUDIO_STYLE,
} from '@/constants/voice-cards'
import { toast } from 'sonner'

import { uploadReferenceAudioAPI } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ParamSlider } from '@/components/ui/param-slider'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

export interface StudioAudioAdvancedSettings {
  style: string
  volume: number
  normalizeLoudness: boolean
  normalizeText: boolean
  withTimestamps: boolean
  format: AudioFormat
  sampleRate: number
  mp3Bitrate: number
  opusBitrate: number
  latency: AudioLatency
  temperature: number
  topP: number
  chunkLength: number
  repetitionPenalty: number
  speakerVoiceIds: string[]
}

interface StudioAudioParamsProps {
  voiceCardId: string | null
  pace: string
  pauseMarkers: string[]
  advanced: StudioAudioAdvancedSettings
  onChangePace: (pace: string) => void
  onChangePauseMarkers: (markers: string[]) => void
  onChangeAdvanced: (settings: Partial<StudioAudioAdvancedSettings>) => void
  onRequestSpeakerVoiceSelect: (index: number | null) => void
  isSelectingSpeakerVoice?: boolean
  activeSpeakerVoiceIndex?: number | null
  /** Public R2 URL of the uploaded ad-hoc reference clip, or null. */
  audioReferenceUrl: string | null
  /** Display-only name of the uploaded reference clip. */
  audioReferenceFileName: string | null
  /** Transcript the user wrote for the uploaded reference clip. */
  audioReferenceText: string
  /** Fires when the reference clip is uploaded or cleared. */
  onChangeAudioReferenceUpload: (
    payload: { url: string; fileName: string } | null,
  ) => void
  /** Fires on every keystroke in the reference transcript textarea. */
  onChangeAudioReferenceText: (text: string) => void
}

type AudioStyleValue = (typeof AUDIO_STYLE)[keyof typeof AUDIO_STYLE]

interface StyleOption {
  value: AudioStyleValue
  labelKey: string
  icon: ComponentType<{ className?: string }>
}

const STYLE_OPTIONS: readonly StyleOption[] = [
  { value: AUDIO_STYLE.NONE, labelKey: 'styleNone', icon: MinusCircle },
  { value: AUDIO_STYLE.CALM, labelKey: 'styleCalm', icon: Wind },
  { value: AUDIO_STYLE.EXCITED, labelKey: 'styleExcited', icon: Zap },
  { value: AUDIO_STYLE.WHISPER, labelKey: 'styleWhisper', icon: Moon },
  {
    value: AUDIO_STYLE.NARRATION,
    labelKey: 'styleNarration',
    icon: BookOpen,
  },
  {
    value: AUDIO_STYLE.DIALOGUE,
    labelKey: 'styleDialogue',
    icon: MessagesSquare,
  },
] as const

// Hover-preview wiring for the reading-style chips. Drop ~3s demo clips into
// `public/audio/style-demos/` and add the per-style entry below to light up
// hover previews — missing files degrade silently to a no-op.
const STYLE_DEMO_BASE_PATH = '/audio/style-demos'
const STYLE_DEMO_FILES: Partial<Record<AudioStyleValue, string>> = {
  // calm: 'calm.mp3',
  // excited: 'excited.mp3',
  // whisper: 'whisper.mp3',
  // narration: 'narration.mp3',
  // dialogue: 'dialogue.mp3',
}
const STYLE_PREVIEW_HOVER_MS = 500
const STYLE_PREVIEW_VOLUME = 0.6

const PACE_OPTIONS = [
  { value: AUDIO_PACE.SLOW, labelKey: 'paceSlow' },
  { value: AUDIO_PACE.NORMAL, labelKey: 'paceNormal' },
  { value: AUDIO_PACE.FAST, labelKey: 'paceFast' },
] as const

const PAUSE_OPTIONS = AUDIO_PAUSE_MARKERS.map((value, index) => ({
  value,
  labelKey: `pauseAfterSentence${index + 1}`,
}))

const ADVANCED_TAB_OPTIONS = [
  {
    value: AUDIO_ADVANCED_TAB_IDS.OUTPUT,
    labelKey: 'tabOutput',
    icon: FileAudio2,
  },
  {
    value: AUDIO_ADVANCED_TAB_IDS.VOICE,
    labelKey: 'tabVoice',
    icon: Mic2,
  },
  {
    value: AUDIO_ADVANCED_TAB_IDS.MODEL,
    labelKey: 'tabModel',
    icon: SlidersHorizontal,
  },
] as const

interface AudioFieldHintProps {
  label: string
  hint: string
}

function AudioInfoTooltip({ label, hint }: AudioFieldHintProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`${label}: ${hint}`}
          className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground/65 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <HelpCircle className="size-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-64">
        {hint}
      </TooltipContent>
    </Tooltip>
  )
}

function AudioFieldLabel({ label, hint }: AudioFieldHintProps) {
  return (
    <span className="flex items-center gap-1.5 text-2xs font-medium text-muted-foreground/70">
      {label}
      <AudioInfoTooltip label={label} hint={hint} />
    </span>
  )
}

interface AudioSwitchRowProps extends AudioFieldHintProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

function AudioSwitchRow({
  label,
  hint,
  checked,
  onCheckedChange,
}: AudioSwitchRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border/50 px-3 py-2 text-xs">
      <AudioFieldLabel label={label} hint={hint} />
      <Switch
        size="sm"
        aria-label={label}
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
    </div>
  )
}

function parseSpeakerVoiceIds(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(
      (item) =>
        item.length > 0 && item.length <= AUDIO_SPEAKER_VOICE_ID_MAX_LENGTH,
    )
}

interface SpeakerVoiceIdsFieldProps {
  voiceIds: string[]
  isSelecting?: boolean
  activeIndex?: number | null
  onChange: (voiceIds: string[]) => void
  onRequestVoiceSelect: (index: number | null) => void
}

function SpeakerVoiceIdsField({
  voiceIds,
  isSelecting,
  activeIndex,
  onChange,
  onRequestVoiceSelect,
}: SpeakerVoiceIdsFieldProps) {
  const t = useTranslations('audioParams')
  const [draft, setDraft] = useState('')
  const canAddMore = voiceIds.length < AUDIO_SPEAKER_VOICE_IDS_MAX

  const commitDraft = () => {
    const parsedVoiceIds = parseSpeakerVoiceIds(draft)
    if (parsedVoiceIds.length === 0) return

    onChange([...voiceIds, ...parsedVoiceIds])
    setDraft('')
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      commitDraft()
    }
  }

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pastedText = event.clipboardData.getData('text')
    const parsedVoiceIds = parseSpeakerVoiceIds(pastedText)
    if (parsedVoiceIds.length <= 1) return

    event.preventDefault()
    onChange([...voiceIds, ...parsedVoiceIds])
    setDraft('')
  }

  const handleRemove = (indexToRemove: number) => {
    onChange(voiceIds.filter((_, index) => index !== indexToRemove))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <AudioFieldLabel
          label={t('speakerVoiceIds')}
          hint={t('speakerVoiceIdsHint')}
        />
        <Button
          type="button"
          variant={isSelecting && activeIndex === null ? 'default' : 'outline'}
          size="sm"
          disabled={!canAddMore}
          onClick={() => onRequestVoiceSelect(null)}
          className="h-8 shrink-0 gap-1.5 px-2 text-2xs"
        >
          <Plus className="size-3" />
          {t('speakerVoiceAdd')}
        </Button>
      </div>

      <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-background/60 px-2 py-2">
        {voiceIds.map((voiceId, index) => {
          const speakerNumber = index + 1
          const isActive = activeIndex === index

          return (
            <span
              key={`${voiceId}-${index}`}
              className={cn(
                'inline-flex max-w-full items-center gap-1 rounded-full border bg-muted/30 pl-2 pr-1 text-2xs transition-colors',
                isActive
                  ? 'border-primary/50 bg-primary/10'
                  : 'border-border/60',
              )}
            >
              <button
                type="button"
                onClick={() => onRequestVoiceSelect(index)}
                aria-label={t('speakerVoiceReplace', {
                  index: speakerNumber,
                })}
                className="inline-flex min-w-0 items-center gap-1.5 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="shrink-0 font-medium text-muted-foreground">
                  {t('speakerVoiceLabel', { index: speakerNumber })}
                </span>
                <span className="max-w-36 truncate font-mono text-foreground">
                  {voiceId}
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleRemove(index)}
                aria-label={t('speakerVoiceRemove', {
                  index: speakerNumber,
                })}
                className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-3" />
              </button>
            </span>
          )
        })}

        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={commitDraft}
          disabled={!canAddMore}
          maxLength={AUDIO_SPEAKER_VOICE_ID_MAX_LENGTH}
          placeholder={
            voiceIds.length === 0
              ? t('speakerVoiceInputPlaceholder')
              : undefined
          }
          className="h-7 min-w-32 flex-1 bg-transparent px-1 text-xs outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      {voiceIds.length === 0 ? (
        <p className="text-2xs text-muted-foreground">
          {t('speakerVoiceEmpty')}
        </p>
      ) : null}
      {!canAddMore ? (
        <p className="text-2xs text-muted-foreground">
          {t('speakerVoiceLimitReached', {
            max: AUDIO_SPEAKER_VOICE_IDS_MAX,
          })}
        </p>
      ) : null}
      {isSelecting ? (
        <p className="text-2xs text-primary">{t('speakerVoicePickHint')}</p>
      ) : null}
    </div>
  )
}

const REFERENCE_AUDIO_MAX_MB = 25
const REFERENCE_AUDIO_MAX_BYTES = REFERENCE_AUDIO_MAX_MB * 1024 * 1024

interface ReferenceAudioFieldProps {
  url: string | null
  fileName: string | null
  text: string
  onChangeUpload: (payload: { url: string; fileName: string } | null) => void
  onChangeText: (text: string) => void
}

function ReferenceAudioField({
  url,
  fileName,
  text,
  onChangeUpload,
  onChangeText,
}: ReferenceAudioFieldProps) {
  const t = useTranslations('audioParams')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)

  const handlePick = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const selected = event.target.files?.[0] ?? null
      event.target.value = ''
      if (!selected) return

      if (selected.size > REFERENCE_AUDIO_MAX_BYTES) {
        toast.error(
          t('referenceErrorTooLarge', { max: `${REFERENCE_AUDIO_MAX_MB} MB` }),
        )
        return
      }
      if (!selected.type.startsWith('audio/')) {
        toast.error(t('referenceErrorNotAudio'))
        return
      }

      setIsUploading(true)
      const result = await uploadReferenceAudioAPI(selected)
      setIsUploading(false)

      if (!result.success || !result.data) {
        toast.error(result.error ?? t('referenceErrorFailed'))
        return
      }

      onChangeUpload({
        url: result.data.url,
        fileName: result.data.fileName || selected.name,
      })
      toast.success(t('referenceUploadSuccess'))
    },
    [onChangeUpload, t],
  )

  const handleClear = useCallback(() => {
    if (isUploading) return
    onChangeUpload(null)
  }, [isUploading, onChangeUpload])

  return (
    <div className="space-y-2">
      <AudioFieldLabel
        label={t('referenceAudio')}
        hint={t('referenceAudioHint')}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        onChange={handlePick}
        className="sr-only"
        aria-label={t('referenceAudio')}
      />

      {url ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2 text-xs">
          <div className="flex min-w-0 items-center gap-1.5">
            <FileAudio2 className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate text-foreground">
              {fileName ?? t('referenceFallbackName')}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={isUploading}
            aria-label={t('referenceRemove')}
            className="h-6 w-6 shrink-0 p-0"
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 bg-background/50 px-3 py-3 text-2xs text-muted-foreground transition-colors',
            'hover:border-primary/40 hover:bg-muted/30 hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            isUploading && 'cursor-wait opacity-70',
          )}
        >
          {isUploading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Upload className="size-3.5" />
          )}
          <span>
            {isUploading
              ? t('referenceUploading')
              : t('referencePick', { max: `${REFERENCE_AUDIO_MAX_MB} MB` })}
          </span>
        </button>
      )}

      <Textarea
        value={text}
        onChange={(event) => onChangeText(event.target.value)}
        placeholder={t('referenceTextPlaceholder')}
        rows={3}
        aria-label={t('referenceText')}
        className="text-xs"
        disabled={!url && text.length === 0 ? false : isUploading}
      />
      <p
        className={cn(
          'text-2xs',
          url && text.trim().length === 0
            ? 'text-destructive'
            : 'text-muted-foreground',
        )}
      >
        {url && text.trim().length === 0
          ? t('referenceTextRequired')
          : t('referenceTextHint')}
      </p>
    </div>
  )
}

export const StudioAudioParams = memo(function StudioAudioParams({
  voiceCardId,
  pace,
  pauseMarkers,
  advanced,
  onChangePace,
  onChangePauseMarkers,
  onChangeAdvanced,
  onRequestSpeakerVoiceSelect,
  isSelectingSpeakerVoice,
  activeSpeakerVoiceIndex,
  audioReferenceUrl,
  audioReferenceFileName,
  audioReferenceText,
  onChangeAudioReferenceUpload,
  onChangeAudioReferenceText,
}: StudioAudioParamsProps) {
  const t = useTranslations('audioParams')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [advancedTab, setAdvancedTab] = useState<AudioAdvancedTabId>(
    AUDIO_ADVANCED_TAB_IDS.OUTPUT,
  )
  // Collapse style/pace/pause sections on phone-portrait so the voice list
  // above keeps usable height. `useIsMobile()` would return `false` on first
  // render (its useEffect hasn't run yet), so useState would lock in the
  // desktop default. Instead, read window.innerWidth synchronously — this
  // component only mounts inside a portal'd dialog, so SSR isn't a concern.
  const getInitialSectionOpen = () =>
    typeof window === 'undefined' ? true : window.innerWidth >= 768
  const [styleOpen, setStyleOpen] = useState(getInitialSectionOpen)
  const [paceOpen, setPaceOpen] = useState(getInitialSectionOpen)
  const [pauseOpen, setPauseOpen] = useState(getInitialSectionOpen)

  const selectedStyleLabel = (() => {
    const option = STYLE_OPTIONS.find((o) => o.value === advanced.style)
    return option ? t(option.labelKey) : ''
  })()
  const selectedPaceLabel = (() => {
    const option = PACE_OPTIONS.find((o) => o.value === pace)
    return option ? t(option.labelKey) : ''
  })()
  const selectedPauseLabel =
    pauseMarkers.length === 0
      ? t('pauseMarkersNone')
      : pauseMarkers
          .map((value) => {
            const option = PAUSE_OPTIONS.find((o) => o.value === value)
            return option ? t(option.labelKey) : ''
          })
          .filter(Boolean)
          .join(' · ')
  const stylePreviewAudioRef = useRef<HTMLAudioElement | null>(null)
  const stylePreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )

  const stopStylePreview = useCallback(() => {
    if (stylePreviewTimerRef.current) {
      clearTimeout(stylePreviewTimerRef.current)
      stylePreviewTimerRef.current = null
    }
    const audio = stylePreviewAudioRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
  }, [])

  const startStylePreview = useCallback(
    (style: AudioStyleValue) => {
      const file = STYLE_DEMO_FILES[style]
      if (!file) return
      stopStylePreview()
      stylePreviewTimerRef.current = setTimeout(() => {
        const audio = stylePreviewAudioRef.current ?? new Audio()
        stylePreviewAudioRef.current = audio
        audio.src = `${STYLE_DEMO_BASE_PATH}/${file}`
        audio.volume = STYLE_PREVIEW_VOLUME
        // Demo files may be absent in dev — swallow play() rejections so a
        // 404 doesn't bubble up to the user.
        void audio.play().catch(() => {})
      }, STYLE_PREVIEW_HOVER_MS)
    },
    [stopStylePreview],
  )

  useEffect(() => stopStylePreview, [stopStylePreview])

  return (
    <div className="space-y-5" data-voice-card-id={voiceCardId ?? undefined}>
      <section className="space-y-2">
        <button
          type="button"
          onClick={() => setStyleOpen((o) => !o)}
          aria-expanded={styleOpen}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span className="min-w-0 space-y-0.5">
            <span className="block text-2xs font-medium text-muted-foreground/70">
              {t('style')}
            </span>
            {styleOpen ? null : (
              <span className="block truncate text-2xs text-foreground">
                {selectedStyleLabel}
              </span>
            )}
          </span>
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform',
              styleOpen && 'rotate-180',
            )}
          />
        </button>
        <div
          className={cn(
            'grid transition-[grid-template-rows] duration-200 ease-out',
            styleOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          )}
        >
          <div className="overflow-hidden">
            <p className="pb-2 text-2xs text-muted-foreground">
              {t('styleHint')}
            </p>
            <ToggleGroup
              type="single"
              value={advanced.style}
              onValueChange={(value) => {
                if (value) onChangeAdvanced({ style: value })
              }}
              aria-label={t('style')}
              className="!grid w-full grid-cols-2"
            >
              {STYLE_OPTIONS.map((option) => {
                const Icon = option.icon
                return (
                  <ToggleGroupItem
                    key={option.value}
                    value={option.value}
                    onMouseEnter={() => startStylePreview(option.value)}
                    onMouseLeave={stopStylePreview}
                    onFocus={() => startStylePreview(option.value)}
                    onBlur={stopStylePreview}
                    className="flex items-center justify-center gap-1.5 px-2 text-center"
                  >
                    <Icon className="size-3 shrink-0 opacity-70" />
                    <span className="truncate">{t(option.labelKey)}</span>
                  </ToggleGroupItem>
                )
              })}
            </ToggleGroup>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <button
          type="button"
          onClick={() => setPaceOpen((o) => !o)}
          aria-expanded={paceOpen}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span className="min-w-0 space-y-0.5">
            <span className="block text-2xs font-medium text-muted-foreground/70">
              {t('pace')}
            </span>
            {paceOpen ? null : (
              <span className="block truncate text-2xs text-foreground">
                {selectedPaceLabel}
              </span>
            )}
          </span>
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform',
              paceOpen && 'rotate-180',
            )}
          />
        </button>
        <div
          className={cn(
            'grid transition-[grid-template-rows] duration-200 ease-out',
            paceOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          )}
        >
          <div className="overflow-hidden">
            <p className="pb-2 text-2xs text-muted-foreground">
              {t('paceHint')}
            </p>
            <ToggleGroup
              type="single"
              value={pace}
              onValueChange={(value) => {
                if (value) onChangePace(value)
              }}
              aria-label={t('pace')}
              className="!grid w-full grid-cols-3"
            >
              {PACE_OPTIONS.map((option) => (
                <ToggleGroupItem
                  key={option.value}
                  value={option.value}
                  className="px-2 text-center"
                >
                  {t(option.labelKey)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <button
          type="button"
          onClick={() => setPauseOpen((o) => !o)}
          aria-expanded={pauseOpen}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span className="min-w-0 space-y-0.5">
            <span className="block text-2xs font-medium text-muted-foreground/70">
              {t('pauseMarkers')}
            </span>
            {pauseOpen ? null : (
              <span className="block truncate text-2xs text-foreground">
                {selectedPauseLabel}
              </span>
            )}
          </span>
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform',
              pauseOpen && 'rotate-180',
            )}
          />
        </button>
        <div
          className={cn(
            'grid transition-[grid-template-rows] duration-200 ease-out',
            pauseOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          )}
        >
          <div className="overflow-hidden">
            <p className="pb-2 text-2xs text-muted-foreground">
              {t('pauseMarkersHint')}
            </p>
            <ToggleGroup
              type="multiple"
              value={pauseMarkers}
              onValueChange={onChangePauseMarkers}
              aria-label={t('pauseMarkers')}
              className="!grid w-full grid-cols-3"
            >
              {PAUSE_OPTIONS.map((option) => (
                <ToggleGroupItem
                  key={option.value}
                  value={option.value}
                  className="px-2 text-center"
                >
                  {t(option.labelKey)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>
      </section>

      <section className="border-t border-border/60 pt-4">
        <button
          type="button"
          onClick={() => setAdvancedOpen((current) => !current)}
          aria-expanded={advancedOpen}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span className="space-y-1">
            <span className="block text-2xs font-medium text-muted-foreground/70">
              {t('advanced')}
            </span>
            <span className="block text-2xs text-muted-foreground">
              {t('advancedHint')}
            </span>
          </span>
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform',
              advancedOpen && 'rotate-180',
            )}
          />
        </button>

        <div
          className={cn(
            'grid transition-[grid-template-rows] duration-200 ease-out',
            advancedOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          )}
        >
          <div className="overflow-hidden">
            <TooltipProvider delayDuration={250}>
              <Tabs
                value={advancedTab}
                onValueChange={(value) => {
                  if (isAudioAdvancedTabId(value)) {
                    setAdvancedTab(value)
                  }
                }}
                className="pt-4"
              >
                <TabsList className="grid h-auto w-full grid-cols-3">
                  {ADVANCED_TAB_OPTIONS.map((option) => {
                    const Icon = option.icon
                    return (
                      <TabsTrigger
                        key={option.value}
                        value={option.value}
                        onClick={() => setAdvancedTab(option.value)}
                        className="h-8 gap-1 text-2xs"
                      >
                        <Icon className="size-3" />
                        {t(option.labelKey)}
                      </TabsTrigger>
                    )
                  })}
                </TabsList>

                <TabsContent
                  value={AUDIO_ADVANCED_TAB_IDS.OUTPUT}
                  className="mt-4 space-y-3"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <AudioFieldLabel
                        label={t('format')}
                        hint={t('formatHint')}
                      />
                      <Select
                        value={advanced.format}
                        onValueChange={(value) => {
                          if (isAudioFormat(value)) {
                            onChangeAdvanced({ format: value })
                          }
                        }}
                      >
                        <SelectTrigger size="sm" aria-label={t('format')}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {AUDIO_FORMATS.map((format) => (
                            <SelectItem key={format} value={format}>
                              {t(`format${format.toUpperCase()}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <AudioFieldLabel
                        label={t('sampleRate')}
                        hint={t('sampleRateHint')}
                      />
                      <Select
                        value={String(advanced.sampleRate)}
                        onValueChange={(value) =>
                          onChangeAdvanced({ sampleRate: Number(value) })
                        }
                      >
                        <SelectTrigger size="sm" aria-label={t('sampleRate')}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {AUDIO_SAMPLE_RATES.map((sampleRate) => (
                            <SelectItem
                              key={sampleRate}
                              value={String(sampleRate)}
                            >
                              {t('sampleRateValue', { sampleRate })}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <AudioFieldLabel
                        label={t('latency')}
                        hint={t('latencyHint')}
                      />
                      <Select
                        value={advanced.latency}
                        onValueChange={(value) => {
                          if (isAudioLatency(value)) {
                            onChangeAdvanced({ latency: value })
                          }
                        }}
                      >
                        <SelectTrigger size="sm" aria-label={t('latency')}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {AUDIO_LATENCIES.map((latency) => (
                            <SelectItem key={latency} value={latency}>
                              {t(
                                `latency${latency.charAt(0).toUpperCase()}${latency.slice(1)}`,
                              )}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {advanced.format === 'mp3' && (
                      <div className="space-y-1.5">
                        <AudioFieldLabel
                          label={t('mp3Bitrate')}
                          hint={t('mp3BitrateHint')}
                        />
                        <Select
                          value={String(advanced.mp3Bitrate)}
                          onValueChange={(value) =>
                            onChangeAdvanced({ mp3Bitrate: Number(value) })
                          }
                        >
                          <SelectTrigger size="sm" aria-label={t('mp3Bitrate')}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {AUDIO_MP3_BITRATES.map((bitrate) => (
                              <SelectItem key={bitrate} value={String(bitrate)}>
                                {t('mp3BitrateValue', { bitrate })}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {advanced.format === 'opus' && (
                      <div className="space-y-1.5">
                        <AudioFieldLabel
                          label={t('opusBitrate')}
                          hint={t('opusBitrateHint')}
                        />
                        <Select
                          value={String(advanced.opusBitrate)}
                          onValueChange={(value) =>
                            onChangeAdvanced({ opusBitrate: Number(value) })
                          }
                        >
                          <SelectTrigger
                            size="sm"
                            aria-label={t('opusBitrate')}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {AUDIO_OPUS_BITRATES.map((bitrate) => (
                              <SelectItem key={bitrate} value={String(bitrate)}>
                                {bitrate === -1000
                                  ? t('opusBitrateAuto')
                                  : t('opusBitrateValue', {
                                      bitrate: bitrate / 1000,
                                    })}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent
                  value={AUDIO_ADVANCED_TAB_IDS.VOICE}
                  className="mt-4 space-y-4"
                >
                  <ReferenceAudioField
                    url={audioReferenceUrl}
                    fileName={audioReferenceFileName}
                    text={audioReferenceText}
                    onChangeUpload={onChangeAudioReferenceUpload}
                    onChangeText={onChangeAudioReferenceText}
                  />

                  <div className="grid gap-2">
                    <AudioSwitchRow
                      label={t('normalizeLoudness')}
                      hint={t('normalizeLoudnessHint')}
                      checked={advanced.normalizeLoudness}
                      onCheckedChange={(checked) =>
                        onChangeAdvanced({ normalizeLoudness: checked })
                      }
                    />
                  </div>

                  <ParamSlider
                    label={t('volume')}
                    labelAccessory={
                      <AudioInfoTooltip
                        label={t('volume')}
                        hint={t('volumeHint')}
                      />
                    }
                    value={advanced.volume}
                    onChange={(value) => onChangeAdvanced({ volume: value })}
                    min={TTS_VOLUME_RANGE.min}
                    max={TTS_VOLUME_RANGE.max}
                    step={TTS_VOLUME_RANGE.step}
                    formatValue={(value) => `${value > 0 ? '+' : ''}${value}`}
                  />

                  <SpeakerVoiceIdsField
                    voiceIds={advanced.speakerVoiceIds}
                    isSelecting={isSelectingSpeakerVoice}
                    activeIndex={activeSpeakerVoiceIndex}
                    onChange={(speakerVoiceIds) =>
                      onChangeAdvanced({ speakerVoiceIds })
                    }
                    onRequestVoiceSelect={onRequestSpeakerVoiceSelect}
                  />
                </TabsContent>

                <TabsContent
                  value={AUDIO_ADVANCED_TAB_IDS.MODEL}
                  className="mt-4 space-y-4"
                >
                  <div className="grid gap-2">
                    <AudioSwitchRow
                      label={t('normalizeText')}
                      hint={t('normalizeTextHint')}
                      checked={advanced.normalizeText}
                      onCheckedChange={(checked) =>
                        onChangeAdvanced({ normalizeText: checked })
                      }
                    />
                    <AudioSwitchRow
                      label={t('withTimestamps')}
                      hint={t('withTimestampsHint')}
                      checked={advanced.withTimestamps}
                      onCheckedChange={(checked) =>
                        onChangeAdvanced({ withTimestamps: checked })
                      }
                    />
                  </div>

                  <ParamSlider
                    label={t('temperature')}
                    labelAccessory={
                      <AudioInfoTooltip
                        label={t('temperature')}
                        hint={t('temperatureHint')}
                      />
                    }
                    value={advanced.temperature}
                    onChange={(value) =>
                      onChangeAdvanced({ temperature: value })
                    }
                    min={TTS_TEMPERATURE_RANGE.min}
                    max={TTS_TEMPERATURE_RANGE.max}
                    step={TTS_TEMPERATURE_RANGE.step}
                  />
                  <ParamSlider
                    label={t('topP')}
                    labelAccessory={
                      <AudioInfoTooltip
                        label={t('topP')}
                        hint={t('topPHint')}
                      />
                    }
                    value={advanced.topP}
                    onChange={(value) => onChangeAdvanced({ topP: value })}
                    min={TTS_TOP_P_RANGE.min}
                    max={TTS_TOP_P_RANGE.max}
                    step={TTS_TOP_P_RANGE.step}
                  />
                  <ParamSlider
                    label={t('chunkLength')}
                    labelAccessory={
                      <AudioInfoTooltip
                        label={t('chunkLength')}
                        hint={t('chunkLengthHint')}
                      />
                    }
                    value={advanced.chunkLength}
                    onChange={(value) =>
                      onChangeAdvanced({ chunkLength: value })
                    }
                    min={TTS_CHUNK_LENGTH_RANGE.min}
                    max={TTS_CHUNK_LENGTH_RANGE.max}
                    step={TTS_CHUNK_LENGTH_RANGE.step}
                  />
                  <ParamSlider
                    label={t('repetitionPenalty')}
                    labelAccessory={
                      <AudioInfoTooltip
                        label={t('repetitionPenalty')}
                        hint={t('repetitionPenaltyHint')}
                      />
                    }
                    value={advanced.repetitionPenalty}
                    onChange={(value) =>
                      onChangeAdvanced({ repetitionPenalty: value })
                    }
                    min={TTS_REPETITION_PENALTY_RANGE.min}
                    max={TTS_REPETITION_PENALTY_RANGE.max}
                    step={TTS_REPETITION_PENALTY_RANGE.step}
                  />
                </TabsContent>
              </Tabs>
            </TooltipProvider>
          </div>
        </div>
      </section>
    </div>
  )
})
