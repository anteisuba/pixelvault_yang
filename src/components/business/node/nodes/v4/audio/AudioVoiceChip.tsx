'use client'

/**
 * 提示词栏上的**「音色」chip 与它的弹层**（画板 `AudioSelected.dc.html` 那张 300
 * 宽的声音库 pop）。
 *
 * 四段：**我的**（克隆）· **收藏** · **平台**（公开库前几条 + 「更多…」）·
 * **克隆我的声音…**。每条可试听、点一下就是选中；底部收 **语速**（分段）与
 * **音量**（滑杆）—— 它们不是标记而是 Fish 的 `prosody` 字段，天然与情绪标记分成
 * 两半（调研 §7.2）。
 *
 * ── 三条纪律 ────────────────────────────────────────────────────────────
 * ① **声音库的事实层复用 `useVoiceLibrary`**（收藏 / 克隆分流、公开库拉取都在那
 *    里），⛔ 不为画布另写一套检索。平台整库仍然是既有的 `FishVoiceLibraryDialog`
 *    ——弹层里塞不下分页与筛选，那张对话框是它的「看全部」，平台段只露前
 *    `PLATFORM_PREVIEW_COUNT` 条。
 * ② **一个搜索框覆盖四段**：我的与收藏在本地过，平台把词交给 `library.setSearch`
 *    （公开库是服务端检索）。⛔ 不做两个搜索框。
 * ③ **试听是本地 `<audio>`**：一次只响一条，切一条就停上一条。
 */

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Mic, Pause, Play, Search } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { ParamSlider } from '@/components/ui/param-slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { TTS_SPEED_RANGE, TTS_VOLUME_RANGE } from '@/constants/audio-options'
import { useVoiceLibrary } from '@/hooks/use-voice-library'
import { cn } from '@/lib/utils'
import type { VoiceCardRecord } from '@/types'

import { ChipPopover } from '../chrome'
import { FishVoiceLibraryDialog } from '../../../FishVoiceLibraryDialog'

/** 画板宽。 */
const VOICE_POPOVER_WIDTH = 300

/** 平台段在弹层里露几条（再多进「更多…」那张对话框）。 */
const PLATFORM_PREVIEW_COUNT = 4

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

  const keyword = search.trim().toLowerCase()
  const matches = (name: string) =>
    keyword.length === 0 || name.toLowerCase().includes(keyword)

  const mine = library.cloned.filter((card) => matches(card.name))
  const favorites = library.favorites.filter((card) => matches(card.name))
  const platform = library.publicVoices.slice(0, PLATFORM_PREVIEW_COUNT)

  const current =
    [...library.cloned, ...library.favorites].find(
      (card) => card.voiceId === voiceId,
    )?.name ?? library.publicVoices.find((v) => v.voiceId === voiceId)?.title

  /** 试听：一次只响一条。`id` 只是「谁在响」的标识，与选中无关。 */
  const preview = (id: string, url: string | null) => {
    if (!url) return
    const audio = audioRef.current
    if (audio && previewId === id) {
      audio.pause()
      setPreviewId(null)
      return
    }
    audio?.pause()
    const next = new Audio(url)
    audioRef.current = next
    next.onended = () => setPreviewId(null)
    setPreviewId(id)
    void next.play().catch(() => setPreviewId(null))
  }

  const pick = (voice: {
    voiceId: string
    name: string
    sampleUrl: string | null
  }) => {
    onSelectVoice(voice)
    setOpen(false)
  }

  const renderVoiceRow = ({
    id,
    name,
    subtitle,
    sampleUrl,
    active,
    onSelect,
  }: {
    id: string
    name: string
    subtitle: string | null
    sampleUrl: string | null
    active: boolean
    onSelect: () => void
  }) => (
    <div
      data-audio-voice-row={id}
      data-active={active ? 'true' : 'false'}
      className={cn(
        'flex min-h-11 items-center gap-2 rounded-lg px-1.5',
        active && 'bg-surface-fill',
      )}
    >
      <button
        type="button"
        className="nodrag nopan min-w-0 flex-1 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onClick={onSelect}
      >
        <span className="block truncate text-2sm text-foreground">{name}</span>
        {subtitle ? (
          <span className="block truncate text-3xs text-muted-foreground">
            {subtitle}
          </span>
        ) : null}
      </button>
      <button
        type="button"
        aria-label={t('preview')}
        data-audio-voice-preview={id}
        disabled={!sampleUrl}
        onClick={() => preview(id, sampleUrl)}
        className="nodrag nopan flex size-6.5 shrink-0 items-center justify-center rounded-full bg-surface-fill text-foreground transition-colors duration-fast hover:bg-surface-fill-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40"
      >
        {previewId === id ? (
          <Pause aria-hidden className="size-3" />
        ) : (
          <Play aria-hidden className="size-3" />
        )}
      </button>
      {active ? (
        <Check aria-hidden className="size-4 shrink-0 text-foreground" />
      ) : null}
    </div>
  )

  const cardRow = (card: VoiceCardRecord, sectionLabel: string) =>
    renderVoiceRow({
      id: card.voiceId ?? card.id,
      name: card.name,
      subtitle: [voiceCardSubtitle(card), sectionLabel]
        .filter(Boolean)
        .join(' · '),
      sampleUrl: card.sampleAudioUrl ?? card.referenceAudioUrl,
      active: Boolean(card.voiceId) && card.voiceId === voiceId,
      onSelect: () => {
        if (!card.voiceId) return
        pick({
          voiceId: card.voiceId,
          name: card.name,
          sampleUrl: card.sampleAudioUrl,
        })
      },
    })

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
            {current ?? (voiceId ? voiceId : t('title'))}
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
              onChange={(event) => {
                setSearch(event.target.value)
                // 平台段是**服务端检索**（公开库有几万条），词得递下去；我的与
                // 收藏在本地过 —— 一个框覆盖四段（头注纪律 ②）。
                library.setSearch(event.target.value)
              }}
              className="h-8 border-0 px-0 text-2sm shadow-none focus-visible:ring-0"
            />
          </div>

          <div className="-mx-1 max-h-64 overflow-y-auto px-1">
            {/* ① 我的（克隆） */}
            <p
              data-audio-voice-section="mine"
              className="px-1 py-1 text-3xs tracking-node-sec text-muted-foreground"
            >
              {t('mine')}
            </p>
            {mine.length === 0 ? (
              <p
                data-audio-voice-empty="mine"
                className="px-1 py-2 text-2xs text-muted-foreground"
              >
                {library.isLoading ? t('loading') : t('empty')}
              </p>
            ) : (
              mine.map((card) => (
                <div key={card.id}>{cardRow(card, t('cloned'))}</div>
              ))
            )}

            {/* ② 收藏 */}
            <p
              data-audio-voice-section="favorites"
              className="px-1 py-1 text-3xs tracking-node-sec text-muted-foreground"
            >
              {t('favorites')}
            </p>
            {favorites.length === 0 ? (
              <p
                data-audio-voice-empty="favorites"
                className="px-1 py-2 text-2xs text-muted-foreground"
              >
                {library.isLoading ? t('loading') : t('emptyFavorites')}
              </p>
            ) : (
              favorites.map((card) => (
                <div key={card.id}>{cardRow(card, t('favorite'))}</div>
              ))
            )}

            {/* ③ 平台：公开库前几条 —— 搜索词交给服务端检索（见头注纪律 ②）。 */}
            <p
              data-audio-voice-section="platform"
              className="px-1 py-1 text-3xs tracking-node-sec text-muted-foreground"
            >
              {t('platformSection')}
            </p>
            {platform.length === 0 ? (
              <p
                data-audio-voice-empty="platform"
                className="px-1 py-2 text-2xs text-muted-foreground"
              >
                {library.isLoading ? t('loading') : t('emptyPlatform')}
              </p>
            ) : (
              platform.map((asset) => (
                <div key={asset.id}>
                  {renderVoiceRow({
                    id: asset.voiceId,
                    name: asset.title,
                    subtitle: [asset.author, t('platformTag')]
                      .filter(Boolean)
                      .join(' · '),
                    sampleUrl: asset.sampleUrl,
                    active: asset.voiceId === voiceId,
                    onSelect: () =>
                      pick({
                        voiceId: asset.voiceId,
                        name: asset.title,
                        sampleUrl: asset.sampleUrl,
                      }),
                  })}
                </div>
              ))
            )}
          </div>

          {/* 「更多…」= 平台整库那张对话框（弹层里塞不下分页与筛选）。 */}
          <button
            type="button"
            data-audio-voice-library
            onClick={() => {
              setOpen(false)
              setLibraryOpen(true)
            }}
            className="nodrag nopan flex min-h-8.5 items-center rounded-lg px-1.5 text-2sm text-muted-foreground transition-colors duration-fast hover:bg-surface-fill-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {t('more')}
          </button>

          {/* ④ 克隆我的声音… */}
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
