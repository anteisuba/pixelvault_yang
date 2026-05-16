'use client'

import { memo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  AUDIO_FORMATS,
  AUDIO_LATENCIES,
  AUDIO_MP3_BITRATES,
  AUDIO_OPUS_BITRATES,
  AUDIO_SAMPLE_RATES,
  isAudioFormat,
  isAudioLatency,
  TTS_CHUNK_LENGTH_RANGE,
  TTS_REPETITION_PENALTY_RANGE,
  TTS_TEMPERATURE_RANGE,
  TTS_TOP_P_RANGE,
  TTS_VOLUME_RANGE,
  type AudioFormat,
  type AudioLatency,
} from '@/constants/audio-options'
import {
  AUDIO_PACE,
  AUDIO_PAUSE_MARKERS,
  AUDIO_STYLE,
} from '@/constants/voice-cards'
import { Input } from '@/components/ui/input'
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
}

const STYLE_OPTIONS = [
  { value: AUDIO_STYLE.NONE, labelKey: 'styleNone' },
  { value: AUDIO_STYLE.CALM, labelKey: 'styleCalm' },
  { value: AUDIO_STYLE.EXCITED, labelKey: 'styleExcited' },
  { value: AUDIO_STYLE.WHISPER, labelKey: 'styleWhisper' },
  { value: AUDIO_STYLE.NARRATION, labelKey: 'styleNarration' },
  { value: AUDIO_STYLE.DIALOGUE, labelKey: 'styleDialogue' },
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

function parseSpeakerVoiceIds(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export const StudioAudioParams = memo(function StudioAudioParams({
  voiceCardId,
  pace,
  pauseMarkers,
  advanced,
  onChangePace,
  onChangePauseMarkers,
  onChangeAdvanced,
}: StudioAudioParamsProps) {
  const t = useTranslations('audioParams')
  const [advancedOpen, setAdvancedOpen] = useState(false)

  return (
    <div className="space-y-5" data-voice-card-id={voiceCardId ?? undefined}>
      <section className="space-y-2">
        <div className="space-y-1">
          <label className="block text-2xs font-medium text-muted-foreground/70">
            {t('style')}
          </label>
          <p className="text-2xs text-muted-foreground">{t('styleHint')}</p>
        </div>
        <ToggleGroup
          type="single"
          value={advanced.style}
          onValueChange={(value) => {
            if (value) onChangeAdvanced({ style: value })
          }}
          aria-label={t('style')}
          className="!grid w-full grid-cols-2"
        >
          {STYLE_OPTIONS.map((option) => (
            <ToggleGroupItem
              key={option.value}
              value={option.value}
              className="px-2 text-center"
            >
              {t(option.labelKey)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </section>

      <section className="space-y-2">
        <div className="space-y-1">
          <label className="block text-2xs font-medium text-muted-foreground/70">
            {t('pace')}
          </label>
          <p className="text-2xs text-muted-foreground">{t('paceHint')}</p>
        </div>
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
      </section>

      <section className="space-y-2">
        <div className="space-y-1">
          <label className="block text-2xs font-medium text-muted-foreground/70">
            {t('pauseMarkers')}
          </label>
          <p className="text-2xs text-muted-foreground">
            {t('pauseMarkersHint')}
          </p>
        </div>
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
            <div className="space-y-4 pt-4">
              <div className="grid gap-2">
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
                      <SelectItem key={sampleRate} value={String(sampleRate)}>
                        {t('sampleRateValue', { sampleRate })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

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

                {advanced.format === 'mp3' && (
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
                )}

                {advanced.format === 'opus' && (
                  <Select
                    value={String(advanced.opusBitrate)}
                    onValueChange={(value) =>
                      onChangeAdvanced({ opusBitrate: Number(value) })
                    }
                  >
                    <SelectTrigger size="sm" aria-label={t('opusBitrate')}>
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
                )}
              </div>

              <div className="grid gap-2">
                <label className="flex items-center justify-between gap-3 rounded-md border border-border/50 px-3 py-2 text-xs">
                  <span>{t('normalizeLoudness')}</span>
                  <Switch
                    size="sm"
                    checked={advanced.normalizeLoudness}
                    onCheckedChange={(checked) =>
                      onChangeAdvanced({ normalizeLoudness: checked })
                    }
                  />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-md border border-border/50 px-3 py-2 text-xs">
                  <span>{t('normalizeText')}</span>
                  <Switch
                    size="sm"
                    checked={advanced.normalizeText}
                    onCheckedChange={(checked) =>
                      onChangeAdvanced({ normalizeText: checked })
                    }
                  />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-md border border-border/50 px-3 py-2 text-xs">
                  <span>{t('withTimestamps')}</span>
                  <Switch
                    size="sm"
                    checked={advanced.withTimestamps}
                    onCheckedChange={(checked) =>
                      onChangeAdvanced({ withTimestamps: checked })
                    }
                  />
                </label>
              </div>

              <ParamSlider
                label={t('volume')}
                value={advanced.volume}
                onChange={(value) => onChangeAdvanced({ volume: value })}
                min={TTS_VOLUME_RANGE.min}
                max={TTS_VOLUME_RANGE.max}
                step={TTS_VOLUME_RANGE.step}
                formatValue={(value) => `${value > 0 ? '+' : ''}${value}`}
              />
              <ParamSlider
                label={t('temperature')}
                value={advanced.temperature}
                onChange={(value) => onChangeAdvanced({ temperature: value })}
                min={TTS_TEMPERATURE_RANGE.min}
                max={TTS_TEMPERATURE_RANGE.max}
                step={TTS_TEMPERATURE_RANGE.step}
              />
              <ParamSlider
                label={t('topP')}
                value={advanced.topP}
                onChange={(value) => onChangeAdvanced({ topP: value })}
                min={TTS_TOP_P_RANGE.min}
                max={TTS_TOP_P_RANGE.max}
                step={TTS_TOP_P_RANGE.step}
              />
              <ParamSlider
                label={t('chunkLength')}
                value={advanced.chunkLength}
                onChange={(value) => onChangeAdvanced({ chunkLength: value })}
                min={TTS_CHUNK_LENGTH_RANGE.min}
                max={TTS_CHUNK_LENGTH_RANGE.max}
                step={TTS_CHUNK_LENGTH_RANGE.step}
              />
              <ParamSlider
                label={t('repetitionPenalty')}
                value={advanced.repetitionPenalty}
                onChange={(value) =>
                  onChangeAdvanced({ repetitionPenalty: value })
                }
                min={TTS_REPETITION_PENALTY_RANGE.min}
                max={TTS_REPETITION_PENALTY_RANGE.max}
                step={TTS_REPETITION_PENALTY_RANGE.step}
              />

              <div className="space-y-1">
                <label className="block text-2xs font-medium text-muted-foreground/70">
                  {t('speakerVoiceIds')}
                </label>
                <Input
                  value={advanced.speakerVoiceIds.join(', ')}
                  onChange={(event) =>
                    onChangeAdvanced({
                      speakerVoiceIds: parseSpeakerVoiceIds(event.target.value),
                    })
                  }
                  placeholder={t('speakerVoiceIdsPlaceholder')}
                  className="h-9 text-xs"
                />
                <p className="text-2xs text-muted-foreground">
                  {t('speakerVoiceIdsHint')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
})
