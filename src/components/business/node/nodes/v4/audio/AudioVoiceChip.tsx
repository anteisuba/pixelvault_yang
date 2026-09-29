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
 * ③ **试听走 `useVoiceSamplePreview`**（与声音库面板同一份）：一次只响一条；收藏时
 *    存下的示例常是一小时就过期的签名链接，那一行按下去先现取一条新的。
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check } from '@/components/icons'

import { ParamSlider } from '@/components/ui/param-slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { TTS_SPEED_RANGE, TTS_VOLUME_RANGE } from '@/constants/audio-options'
import { useVoiceLibrary } from '@/hooks/use-voice-library'
import { useVoiceCover } from '@/hooks/use-voice-cover'
import {
  canPreviewVoiceSample,
  useVoiceSamplePreview,
} from '@/hooks/use-voice-sample-preview'
import { cn } from '@/lib/utils'
import { durableSampleUrl } from '@/lib/voice-sample-url'
import type { VoiceCardRecord } from '@/types'

import {
  VoiceAvatar,
  VoiceAvatarButton,
} from '../../../voice-library/VoiceAvatar'
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
  const preview = useVoiceSamplePreview()
  const cover = useVoiceCover(voiceId)

  // ⚠ 只在弹层开着时拉数据：这条 chip 挂在每一张选中的音频卡上，常驻拉取等于
  // 每选一张卡就打一次声音库。
  const library = useVoiceLibrary({ enabled: open })

  /**
   * 「我的音色」= 克隆的 + 已收藏（= 设为音色过）的，⛔ 不再分两段列。同一副嗓子
   * 收藏过两次只列一行（真机：「林翩翩」「弗洛洛」各出现两遍）。
   */
  const clonedIds = new Set(library.cloned.map((card) => card.id))
  const seenVoices = new Set<string>()
  const mine = [...library.cloned, ...library.favorites].filter((card) => {
    const key = card.voiceId ?? card.id
    if (seenVoices.has(key)) return false
    seenVoices.add(key)
    return true
  })

  // ⚠ 快照优先：弹层没开时 `library` 是空的（只在 `open` 时拉），拿不到名字就
  // 只剩那串 `voiceId` 哈希可显示。库里查到的名更新，所以放在快照后面兜底。
  const current =
    [...library.cloned, ...library.favorites].find(
      (card) => card.voiceId === voiceId,
    )?.name ??
    library.publicVoices.find((v) => v.voiceId === voiceId)?.title ??
    voiceName

  const pick = (voice: {
    voiceId: string
    name: string
    sampleUrl: string | null
  }) => {
    preview.stop()
    onSelectVoice(voice)
    setOpen(false)
  }

  const renderVoiceRow = ({
    id,
    name,
    subtitle,
    sampleUrl,
    voiceId: rowVoiceId,
    cover,
    active,
    onSelect,
  }: {
    id: string
    name: string
    subtitle: string | null
    sampleUrl: string | null
    voiceId: string | null
    cover: string | null
    active: boolean
    onSelect: () => void
  }) => (
    <div
      data-audio-voice-row={id}
      data-active={active ? 'true' : 'false'}
      className={cn(
        'flex min-h-11 items-center gap-2.5 rounded-lg px-1.5',
        active && 'bg-surface-fill',
      )}
    >
      {/* 头像就是试听键（与声音库面板同一种行，方向 A）。 */}
      <VoiceAvatarButton
        cover={cover}
        fallback="letter"
        name={name}
        size="row"
        playing={preview.playingId === id}
        loading={preview.loadingId === id}
        progress={preview.progress}
        disabled={
          !canPreviewVoiceSample({ url: sampleUrl, voiceId: rowVoiceId })
        }
        ariaLabel={t('preview')}
        onToggle={() =>
          preview.toggle({ id, url: sampleUrl, voiceId: rowVoiceId })
        }
        buttonProps={{ 'data-audio-voice-preview': id }}
      />
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
      {active ? (
        <Check aria-hidden className="size-4 shrink-0 text-foreground" />
      ) : null}
    </div>
  )

  const cardRow = (card: VoiceCardRecord) =>
    renderVoiceRow({
      id: card.voiceId ?? card.id,
      name: card.name,
      // ⚠ 收藏的不是「我克隆的」（真机：一整列收藏全写成了「我克隆的」）。
      subtitle: [
        voiceCardSubtitle(card),
        clonedIds.has(card.id) ? t('cloned') : t('favorited'),
      ]
        .filter(Boolean)
        .join(' · '),
      sampleUrl: card.referenceAudioUrl ?? card.sampleAudioUrl,
      voiceId: card.voiceId,
      cover: card.coverImage,
      active: Boolean(card.voiceId) && card.voiceId === voiceId,
      onSelect: () => {
        if (!card.voiceId) return
        pick({
          voiceId: card.voiceId,
          name: card.name,
          // ⚠ 调用方会把它落进空卡：签名链接一小时后就读不到，⛔ 交出去。
          sampleUrl: durableSampleUrl(card.sampleAudioUrl),
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
            // 与画布里另外几颗 chip 同一档（28 高、12 字、按下 0.96）。
            'nodrag nopan inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border pr-2.5 text-xs',
            cover ? 'pl-1.5' : 'pl-2.5',
            'transition-[border-color,color,transform] duration-fast ease-standard active:scale-96',
            'hover:border-foreground/40 hover:text-foreground',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            'disabled:pointer-events-none disabled:opacity-60',
            // 选过音色 = 深一档（画板：选中的 chip 边与字都是前景色）。
            voiceId
              ? 'border-foreground text-foreground'
              : 'border-border text-muted-foreground',
          )}
        >
          {/* 这副嗓子的封面跟着 chip 走（owner 2026-09-29「封面都带着」）。 */}
          {cover ? (
            <VoiceAvatar
              cover={cover}
              fallback="letter"
              name={current ?? ''}
              size="chip"
            />
          ) : null}
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
            mine.map((card) => <div key={card.id}>{cardRow(card)}</div>)
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
