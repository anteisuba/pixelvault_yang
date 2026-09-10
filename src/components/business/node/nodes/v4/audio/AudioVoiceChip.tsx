'use client'

/**
 * 提示词栏上的**「音色」chip 与它的弹层**（v3 spec §4 v2，画板 `AudioLibrary.dc.html`
 * 最后一句：「音色 chip 弹层保留但缩短」）。
 *
 * 缩短后只剩三段：**我的音色**（克隆的 + 已收藏/设为音色的）· 底部 **语速 / 音量**
 * · **「更多…」→ 声音库面板**。
 *
 * ── 三条纪律 ────────────────────────────────────────────────────────────
 * ① **平台整库不在这颗 chip 里**（S5c 起）：那是 640 宽声音库面板的「平台样本」
 *    页签的事。弹层里塞不下五个页签与试听行，⛔ 不在这里做第二个缩水版。
 * ② **事实层复用 `useVoiceLibrary`**（收藏 / 克隆分流），⛔ 不为画布另写一套检索。
 * ③ **试听是本地 `<audio>`**：一次只响一条，切一条就停上一条。
 */

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Pause, Play } from 'lucide-react'

import { ParamSlider } from '@/components/ui/param-slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { TTS_SPEED_RANGE, TTS_VOLUME_RANGE } from '@/constants/audio-options'
import { useVoiceLibrary } from '@/hooks/use-voice-library'
import { cn } from '@/lib/utils'
import type { VoiceCardRecord } from '@/types'

import { ChipPopover } from '../chrome'

/** 画板宽。 */
const VOICE_POPOVER_WIDTH = 300

/** 语速三档（画板 0.8 / 1.0 / 1.2）—— 值域仍在 `TTS_SPEED_RANGE` 之内。 */
export const VOICE_SPEED_STEPS = [0.8, TTS_SPEED_RANGE.default, 1.2] as const

export interface AudioVoiceChipProps {
  /** 当前音色（Fish 的 `reference_id`）。 */
  readonly voiceId: string | undefined
  /** 选中那副嗓子的名字快照 —— chip 收起时**唯一**读得到名字的来源。 */
  readonly voiceName: string | undefined
  readonly speed: number | undefined
  readonly volume: number | undefined
  onSelectVoice(voice: {
    readonly voiceId: string
    readonly name: string
    readonly sampleUrl: string | null
  }): void
  onSpeedChange(next: number): void
  onVolumeChange(next: number): void
  /** 「更多…」——交给宿主开那张 640 的声音库面板。 */
  onOpenLibrary(): void
  readonly disabled?: boolean
}

function voiceCardSubtitle(card: VoiceCardRecord): string | null {
  const parts = [...card.tone]
  return parts.length > 0 ? parts.join(' · ') : null
}

export function AudioVoiceChip({
  voiceId,
  voiceName,
  speed,
  volume,
  onSelectVoice,
  onSpeedChange,
  onVolumeChange,
  onOpenLibrary,
  disabled = false,
}: AudioVoiceChipProps) {
  const t = useTranslations('StudioNode.v4.audio.voice')
  const [open, setOpen] = useState(false)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // ⚠ 只在弹层开着时拉数据：这条 chip 挂在每一张选中的音频卡上，常驻拉取等于
  // 每选一张卡就打一次声音库。
  const library = useVoiceLibrary({ enabled: open })

  /** 「我的音色」= 克隆的 + 已收藏（= 设为音色过）的，⛔ 不再分两段列。 */
  const mine = [...library.cloned, ...library.favorites]

  // ⚠ 快照优先：弹层没开时 `library` 是空的（只在 `open` 时拉），拿不到名字就
  // 只剩那串 `voiceId` 哈希可显示。库里查到的名更新，所以放在快照后面兜底。
  const current =
    [...library.cloned, ...library.favorites].find(
      (card) => card.voiceId === voiceId,
    )?.name ??
    library.publicVoices.find((v) => v.voiceId === voiceId)?.title ??
    voiceName

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
        <div className="-mx-1 max-h-64 overflow-y-auto px-1">
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
        </div>

        {/* 「更多…」= 640 的声音库面板（五个页签在那边，见头注纪律 ①）。 */}
        <button
          type="button"
          data-audio-voice-library
          onClick={() => {
            setOpen(false)
            onOpenLibrary()
          }}
          className="nodrag nopan flex min-h-8.5 items-center rounded-lg px-1.5 text-2sm text-muted-foreground transition-colors duration-fast hover:bg-surface-fill-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {t('more')}
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
  )
}
