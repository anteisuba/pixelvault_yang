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

import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import type { NodeV4GenerationParams } from '@/types/node-workflow'

import { ChipPopover } from '../chrome'
import {
  VIDEO_FRAME_POPOVER_WIDTH,
  videoAspectRatioOptions,
  videoDurationOptions,
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
  onDurationChange,
  onAspectRatioChange,
  onResolutionChange,
  onGenerateAudioChange,
  disabled = false,
}: VideoFrameChipProps) {
  const t = useTranslations('StudioNode.v4.video')
  const label = videoFrameChipLabel(params, {
    audioLabel: t('frame.audioSuffix'),
    fallback: t('frame.title'),
  })
  const readout = videoFrameReadout(modelId, params)
  const audioSupported = videoSupportsGeneratedAudio(modelId)

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
            'nodrag nopan inline-flex min-h-6 shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-2xs',
            'border-border text-muted-foreground transition-colors duration-fast ease-standard',
            'hover:border-foreground/40 hover:text-foreground',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            'disabled:pointer-events-none disabled:opacity-60',
          )}
        >
          {label}
        </button>
      }
    >
      <div className="flex flex-col gap-3">
        <SpecSection
          label={t('frame.duration')}
          options={videoDurationOptions(modelId)}
          value={params?.duration ?? ''}
          suffix="s"
          onChange={onDurationChange}
        />
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
