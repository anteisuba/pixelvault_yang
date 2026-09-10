'use client'

/**
 * 提示词栏上的**「音色」chip 与它的弹层**（画板 `AudioSelected.dc.html` 那张 300
 * 宽的声音库 pop）。
 *
 * 一列音色（我的克隆 → 收藏 → 平台入口），每条可试听、点一下就是选中；底部收
 * **语速**（分段）与**音量**（滑杆）—— 它们不是标记而是 Fish 的 `prosody` 字段，
 * 天然与情绪标记分成两半（调研 §7.2）。
 *
 * ── 两条纪律 ────────────────────────────────────────────────────────────
 * ① **声音库的事实层复用 `useVoiceLibrary`**（收藏 / 克隆分流、公开库拉取都在那
 *    里），⛔ 不为画布另写一套检索。平台整库仍然是既有的 `FishVoiceLibraryDialog`
 *    ——弹层里塞不下分页与筛选，那张对话框是它的「看全部」。
 * ② **试听是本地 `<audio>`**：一次只响一条，切一条就停上一条。
 */

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Mic, Pause, Play, Search } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { ParamSlider } from '@/components/ui/param-slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { TTS_SPEED_RANGE, TTS_VOLUME_RANGE } from '@/constants/audio-options'
import { useVoiceLibrary, isClonedVoiceCard } from '@/hooks/use-voice-library'
import { cn } from '@/lib/utils'
import type { VoiceCardRecord } from '@/types'

import { ChipPopover } from '../chrome'
import { FishVoiceLibraryDialog } from '../../../FishVoiceLibraryDialog'

/** 画板宽。 */
const VOICE_POPOVER_WIDTH = 300

/** 语速三档（画板 0.8 / 1.0 / 1.2）—— 值域仍在 `TTS_SPEED_RANGE` 之内。 */
export const VOICE_SPEED_STEPS = [0.8, TTS_SPEED_RANGE.default, 1.2] as const

export interface AudioVoiceChipProps {
  /** 当前音色（Fish 的 `reference_id`）。 */
  readonly voiceId: string | undefined
  readonly speed: number | undefined
  readonly volume: number | undefined
  onSelectVoice(voice: {
    readonly voiceId: string
    readonly name: string
    readonly sampleUrl: string | null
  }): void
  onSpeedChange(next: number): void
  onVolumeChange(next: number): void
  readonly disabled?: boolean
}

function voiceCardSubtitle(card: VoiceCardRecord): string | null {
  const parts = [...card.tone]
  return parts.length > 0 ? parts.join(' · ') : null
}

export function AudioVoiceChip({
  voiceId,
  speed,
  volume,
  onSelectVoice,
  onSpeedChange,
  onVolumeChange,
  disabled = false,
}: AudioVoiceChipProps) {
  const t = useTranslations('StudioNode.v4.audio.voice')
  const [open, setOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [previewId, setPreviewId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // ⚠ 只在弹层开着时拉数据：这条 chip 挂在每一张选中的音频卡上，常驻拉取等于
  // 每选一张卡就打一次声音库。
  const library = useVoiceLibrary({ enabled: open })

  const cards = [...library.cloned, ...library.favorites].filter((card) => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return true
    return card.name.toLowerCase().includes(keyword)
  })

  const current = cards.find((card) => card.voiceId === voiceId)

  const preview = (card: VoiceCardRecord) => {
    const url = card.sampleAudioUrl ?? card.referenceAudioUrl
    if (!url) return
    const audio = audioRef.current
    if (audio && previewId === card.id) {
      audio.pause()
      setPreviewId(null)
      return
    }
    audio?.pause()
    const next = new Audio(url)
    audioRef.current = next
    next.onended = () => setPreviewId(null)
    setPreviewId(card.id)
    void next.play().catch(() => setPreviewId(null))
  }

  return (
    <>
      <ChipPopover
        open={open}
        onOpenChange={setOpen}
        ariaLabel={t('title')}
        width={VOICE_POPOVER_WIDTH}
        trigger={
          <button
            type="button"
            disabled={disabled}
            data-audio-voice-chip
            aria-label={t('title')}
            className={cn(
              'nodrag nopan inline-flex min-h-6 shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-2xs',
              'transition-colors duration-fast ease-standard',
              'hover:border-foreground/40 hover:text-foreground',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              'disabled:pointer-events-none disabled:opacity-60',
              // 选过音色 = 深一档（画板：选中的 chip 边与字都是前景色）。
              voiceId
                ? 'border-foreground text-foreground'
                : 'border-border text-muted-foreground',
            )}
          >
            {current?.name ?? (voiceId ? voiceId : t('title'))}
          </button>
        }
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Search
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground"
            />
            <Input
              value={search}
              data-audio-voice-search
              aria-label={t('searchLabel')}
              placeholder={t('searchPlaceholder')}
              onChange={(event) => setSearch(event.target.value)}
              className="h-8 border-0 px-0 text-2sm shadow-none focus-visible:ring-0"
            />
          </div>

          <div className="-mx-1 max-h-64 overflow-y-auto px-1">
            <p className="px-1 py-1 text-3xs tracking-node-sec text-muted-foreground">
              {t('mine')}
            </p>
            {cards.length === 0 ? (
              <p
                data-audio-voice-empty
                className="px-1 py-2 text-2xs text-muted-foreground"
              >
                {library.isLoading ? t('loading') : t('empty')}
              </p>
            ) : (
              cards.map((card) => {
                const active = Boolean(card.voiceId) && card.voiceId === voiceId
                const subtitle = voiceCardSubtitle(card)
                return (
                  <div
                    key={card.id}
                    data-audio-voice-row={card.voiceId ?? card.id}
                    data-active={active ? 'true' : 'false'}
                    className={cn(
                      'flex min-h-11 items-center gap-2 rounded-lg px-1.5',
                      active && 'bg-surface-fill',
                    )}
                  >
                    <button
                      type="button"
                      className="nodrag nopan min-w-0 flex-1 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      onClick={() => {
                        if (!card.voiceId) return
                        onSelectVoice({
                          voiceId: card.voiceId,
                          name: card.name,
                          sampleUrl: card.sampleAudioUrl,
                        })
                        setOpen(false)
                      }}
                    >
                      <span className="block truncate text-2sm text-foreground">
                        {card.name}
                      </span>
                      <span className="block truncate text-3xs text-muted-foreground">
                        {[
                          subtitle,
                          isClonedVoiceCard(card) ? t('cloned') : t('favorite'),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={t('preview')}
                      data-audio-voice-preview={card.id}
                      disabled={!card.sampleAudioUrl && !card.referenceAudioUrl}
                      onClick={() => preview(card)}
                      className="nodrag nopan flex size-6.5 shrink-0 items-center justify-center rounded-full bg-surface-fill text-foreground transition-colors duration-fast hover:bg-surface-fill-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40"
                    >
                      {previewId === card.id ? (
                        <Pause aria-hidden className="size-3" />
                      ) : (
                        <Play aria-hidden className="size-3" />
                      )}
                    </button>
                    {active ? (
                      <Check
                        aria-hidden
                        className="size-4 shrink-0 text-foreground"
                      />
                    ) : null}
                  </div>
                )
              })
            )}
          </div>

          <button
            type="button"
            data-audio-voice-clone
            onClick={() => {
              setOpen(false)
              setLibraryOpen(true)
            }}
            className="nodrag nopan flex min-h-8.5 items-center gap-2 rounded-lg px-1.5 text-2sm text-muted-foreground transition-colors duration-fast hover:bg-surface-fill-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Mic aria-hidden className="size-4" />
            {t('clone')}
          </button>
          <button
            type="button"
            data-audio-voice-library
            onClick={() => {
              setOpen(false)
              setLibraryOpen(true)
            }}
            className="nodrag nopan flex min-h-8.5 items-center rounded-lg px-1.5 text-2sm text-muted-foreground transition-colors duration-fast hover:bg-surface-fill-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {t('platform')}
          </button>

          {/* ── prosody：语速 + 音量（⛔ 不是标记，见文件头注）───────────── */}
          <div className="flex flex-col gap-2 border-t border-border pt-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-3xs tracking-node-sec text-muted-foreground">
                {t('speed')}
              </span>
              <ToggleGroup
                type="single"
                variant="segmented"
                aria-label={t('speed')}
                value={String(speed ?? TTS_SPEED_RANGE.default)}
                onValueChange={(next) => {
                  if (next) onSpeedChange(Number(next))
                }}
              >
                {VOICE_SPEED_STEPS.map((step) => (
                  <ToggleGroupItem
                    key={step}
                    value={String(step)}
                    data-audio-voice-speed={step}
                  >
                    {`${step.toFixed(1)}×`}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <ParamSlider
              label={t('volume')}
              value={volume ?? TTS_VOLUME_RANGE.default}
              min={TTS_VOLUME_RANGE.min}
              max={TTS_VOLUME_RANGE.max}
              step={TTS_VOLUME_RANGE.step}
              formatValue={(value) => `${value > 0 ? '+' : ''}${value}`}
              onChange={onVolumeChange}
            />
          </div>
        </div>
      </ChipPopover>

      <FishVoiceLibraryDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        selectedVoiceId={voiceId ?? null}
        onSelectVoiceId={(voice) =>
          onSelectVoice({
            voiceId: voice.voiceId,
            name: voice.name,
            sampleUrl: voice.sampleUrl,
          })
        }
        onVoiceSelectComplete={() => setLibraryOpen(false)}
      />
    </>
  )
}
