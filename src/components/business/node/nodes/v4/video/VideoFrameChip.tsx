'use client'

/**
 * 提示词栏上的**参数 chip 与它的弹层**（spec §5，画板 `VideoPopover.dc.html`）。
 *
 * chip 上写 `7s · 16:9`，开了声音再接「· 有声」；弹层 300 宽四段：
 * 时长（按模型档位）· 比例 · 清晰度 · **生成声音**（开关），底部一行读数与估价。
 *
 * ⛔ 这里不算任何一个数：档位值域、chip 的字、底部读数全在 `video-node-model.ts`。
 */

import { useTranslations } from 'next-intl'

import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import type { NodeV4GenerationParams } from '@/types/node-workflow'

import { ChipPopover } from '../chrome'
import {
  VIDEO_FRAME_POPOVER_WIDTH,
  formatVideoSeconds,
  videoAspectRatioOptions,
  videoDurationStepIndex,
  videoDurationSteps,
  videoFrameChipLabel,
  videoFrameReadout,
  videoResolutionOptions,
  videoSupportsGeneratedAudio,
  type VideoSpecOption,
} from './video-node-model'

export interface VideoFrameChipProps {
  readonly params: NodeV4GenerationParams | undefined
  /** 档位值域查的是它的能力表 —— 没选模型时三段都不画。 */
  readonly modelId: string | undefined
  /**
   * 推出来的模式（`videoSendMode` 的译名）。写在 chip 首位与弹层顶部「这次按 ×」
   * ——**只读**，⛔ 弹层里不给它任何一个可点的控件（spec §5「不设模式页签」）。
   */
  readonly modeLabel?: string
  readonly modeHint?: string
  /** 底部读数里每组的 `已挂 / 上限`。 */
  readonly readoutGroups?: readonly {
    readonly label: string
    readonly current: number
    readonly limit: number | null
  }[]
  /** 这个模型没有参考变体时的那句说明（⛔ 不静默丢用户挂的参考）。 */
  readonly referenceNote?: string
  onDurationChange(next: string): void
  onAspectRatioChange(next: string): void
  onResolutionChange(next: string): void
  onGenerateAudioChange(next: boolean): void
  readonly disabled?: boolean
}

/** 一段分段控件。⚠ 空值域 = 整段不画（组级不可用），⛔ 不画一段全灰的。 */
function SpecSection({
  label,
  options,
  value,
  suffix,
  onChange,
}: {
  readonly label: string
  readonly options: readonly VideoSpecOption[]
  readonly value: string
  readonly suffix?: string
  onChange(next: string): void
}) {
  if (options.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-3xs tracking-node-sec text-muted-foreground">
        {label}
      </span>
      <ToggleGroup
        type="single"
        variant="segmented"
        value={value}
        onValueChange={(next) => {
          if (next) onChange(next)
        }}
        aria-label={label}
        className="flex-wrap"
      >
        {options.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            aria-label={`${option.value}${suffix ?? ''}`}
            disabled={option.disabled}
          >
            {option.value}
            {suffix}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

export function VideoFrameChip({
  params,
  modelId,
  modeLabel,
  modeHint,
  readoutGroups = [],
  referenceNote,
  onDurationChange,
  onAspectRatioChange,
  onResolutionChange,
  onGenerateAudioChange,
  disabled = false,
}: VideoFrameChipProps) {
  const t = useTranslations('StudioNode.v4.video')
  const label = videoFrameChipLabel(params, {
    ...(modeLabel ? { modeLabel } : {}),
    audioLabel: t('frame.audioSuffix'),
    // 没模型时 chip 写「选模型」（画板），⛔ 不写一个空的「画面」。
    fallback: modelId ? t('frame.title') : t('frame.pickModel'),
  })
  const readout = videoFrameReadout(modelId, params, readoutGroups)
  const audioSupported = videoSupportsGeneratedAudio(modelId)
  const durations = videoDurationSteps(modelId)
  const durationIndex = videoDurationStepIndex(durations, params?.duration)
  const durationMin = durations[0]
  const durationMax = durations[durations.length - 1]

  return (
    <ChipPopover
      ariaLabel={t('frame.title')}
      width={VIDEO_FRAME_POPOVER_WIDTH}
      trigger={
        <button
          type="button"
          disabled={disabled}
          data-video-frame-chip
          aria-label={t('frame.title')}
          className={cn(
            // 与模型 chip 同一条：可被压缩、超了省略（⛔ 不横向滚动）。
            'nodrag nopan inline-flex min-h-6 min-w-0 max-w-50 items-center gap-1 rounded-md border px-2 py-0.5 text-2xs',
            'border-border text-muted-foreground transition-colors duration-fast ease-standard',
            'hover:border-foreground/40 hover:text-foreground',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            'disabled:pointer-events-none disabled:opacity-60',
          )}
        >
          <span className="truncate">{label}</span>
        </button>
      }
    >
      <div className="flex flex-col gap-3">
        {/* 顶部「这次按 ×」——只读读数（画板 `VideoRefs` 弹层首行）。 */}
        {modeLabel ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-3">
              <span className="text-3xs tracking-node-sec text-muted-foreground">
                {t('frame.modeLabel')}
              </span>
              <span data-video-frame-mode className="text-2sm font-semibold">
                {modeLabel}
              </span>
            </div>
            {modeHint ? (
              <p className="text-3xs text-muted-foreground">{modeHint}</p>
            ) : null}
          </div>
        ) : null}

        {/* 时长 = 滑杆，吸附到模型档位（画板 2026-09-10 改稿；⛔ 不做分段控件）。 */}
        {durations.length > 0 &&
        durationMin !== undefined &&
        durationMax !== undefined ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-3xs tracking-node-sec text-muted-foreground">
                {t('frame.duration')}
              </span>
              <span
                data-video-duration-value
                className="text-2sm font-semibold tabular-nums"
              >
                {formatVideoSeconds(durations[durationIndex] as number)}
              </span>
            </div>
            <Slider
              data-video-duration-slider
              aria-label={t('frame.duration')}
              min={0}
              max={durations.length - 1}
              step={1}
              value={[durationIndex]}
              onValueChange={(next) => {
                const step = durations[next[0] ?? 0]
                if (step !== undefined) onDurationChange(String(step))
              }}
            />
            <div className="flex justify-between text-3xs text-muted-foreground tabular-nums">
              <span>{formatVideoSeconds(durationMin)}</span>
              <span>{formatVideoSeconds(durationMax)}</span>
            </div>
          </div>
        ) : null}
        <SpecSection
          label={t('frame.aspectRatio')}
          options={videoAspectRatioOptions(modelId)}
          value={params?.aspectRatio ?? ''}
          onChange={onAspectRatioChange}
        />
        <SpecSection
          label={t('frame.resolution')}
          options={videoResolutionOptions(modelId)}
          value={params?.resolution ?? ''}
          onChange={onResolutionChange}
        />
        {/* 生成声音是**开关**不是 chip（画板原话：「生成声音是弹层里的开关」）。
            ⚠ 模型发不出这个字段时**禁用不隐藏**（Hard Rule 8）：用户看得见
            「这个模型不带音轨」，而不是弹层莫名少一行。 */}
        <div className="flex items-center justify-between gap-3">
          <span className="flex flex-col gap-0.5">
            <span className="text-2sm">{t('frame.generateAudio')}</span>
            <span className="text-3xs text-muted-foreground">
              {t('frame.generateAudioHint')}
            </span>
          </span>
          <Switch
            data-video-generate-audio
            aria-label={t('frame.generateAudio')}
            disabled={!audioSupported}
            checked={Boolean(params?.generateAudio)}
            onCheckedChange={onGenerateAudioChange}
          />
        </div>
        {referenceNote ? (
          <p
            data-video-reference-note
            className="text-3xs text-muted-foreground"
          >
            {referenceNote}
          </p>
        ) : null}
        {readout ? (
          <p
            data-video-frame-readout
            className="text-xs tabular-nums text-muted-foreground"
          >
            {readout}
          </p>
        ) : null}
      </div>
    </ChipPopover>
  )
}
