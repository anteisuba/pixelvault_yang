'use client'

/**
 * 提示词栏上的**「画面」chip 与它的弹层**（spec §3，画板 `PromptBar.dc.html`）。
 *
 * 一个按钮 + 一张 300 宽的弹层：比例（分段控件）+ 底部实时读数「W×H · 约 $x/张」。
 *
 * S3b 起弹层是四段：比例 + **质量 / 分辨率 / 张数**。三段的值域来自**能力表**，
 * 不支持的档**灰掉不隐藏**（Hard Rule 8）—— 换模型时弹层不会莫名变矮一截，用户
 * 看得见「这个模型没有 4K」。能力表整段没声明的（例如某家不给分辨率档）才整段
 * 不画：那是组级不可用，与「某一档灰掉」是两件事。
 *
 * ⛔ 依旧**没有 21:9**：`IMAGE_SIZES` 里没有这一档，能力表里也没有任何模型声明
 * 它。摆上去就是在卡上写一个服务端根本收不到的尺寸。
 */

import { useTranslations } from 'next-intl'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

import type { NodeWorkflowModelOption } from '@/types/node-workflow'

import { ChipPopover } from '../chrome'
import {
  IMAGE_ASPECT_RATIO_OPTIONS,
  IMAGE_COUNT_OPTIONS,
  imageFrameReadout,
  imageQualityOptions,
  imageResolutionOptions,
  type ImageSpecOption,
} from './image-node-model'

/** 画板上的两档弹层宽：参数 300 / 模型 320。 */
const FRAME_POPOVER_WIDTH = 300

export interface ImageFrameChipProps {
  readonly aspectRatio: string | undefined
  readonly modelId: string | undefined
  /** 档位值域查的是它的能力表 —— 没选模型时三段都不画。 */
  readonly model:
    | Pick<NodeWorkflowModelOption, 'adapterType' | 'modelId'>
    | undefined
  readonly quality: string | undefined
  readonly resolution: string | undefined
  readonly count: number | undefined
  onAspectRatioChange(next: string): void
  onQualityChange(next: string): void
  onResolutionChange(next: string): void
  onCountChange(next: number): void
  readonly disabled?: boolean
}

/** 一段分段控件。⚠ 空值域 = 整段不画（组级不可用），⛔ 不画一段全灰的。 */
function SpecSection({
  label,
  options,
  value,
  onChange,
}: {
  readonly label: string
  readonly options: readonly ImageSpecOption[]
  readonly value: string
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
            aria-label={option.value}
            disabled={option.disabled}
          >
            {option.value}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

export function ImageFrameChip({
  aspectRatio,
  modelId,
  model,
  quality,
  resolution,
  count,
  onAspectRatioChange,
  onQualityChange,
  onResolutionChange,
  onCountChange,
  disabled = false,
}: ImageFrameChipProps) {
  const t = useTranslations('StudioNode.v4.image')
  const readout = imageFrameReadout(aspectRatio, modelId, {
    ...(quality ? { quality } : {}),
    ...(count === undefined ? {} : { count }),
  })

  return (
    <ChipPopover
      ariaLabel={t('frame.title')}
      width={FRAME_POPOVER_WIDTH}
      trigger={
        <button
          type="button"
          disabled={disabled}
          data-image-frame-chip
          aria-label={t('frame.title')}
          className={cn(
            'nodrag nopan inline-flex min-h-6 shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-2xs',
            'border-border text-muted-foreground transition-colors duration-fast ease-standard',
            'hover:border-foreground/40 hover:text-foreground',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            'disabled:pointer-events-none disabled:opacity-60',
          )}
        >
          {aspectRatio ?? t('frame.title')}
        </button>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-3xs tracking-node-sec text-muted-foreground">
            {t('frame.aspectRatio')}
          </span>
          <ToggleGroup
            type="single"
            variant="segmented"
            value={aspectRatio ?? ''}
            onValueChange={(next) => {
              // 分段控件点当前格会回空串 —— 比例不允许「没有」，忽略掉。
              if (next) onAspectRatioChange(next)
            }}
            aria-label={t('frame.aspectRatio')}
            className="flex-wrap"
          >
            {IMAGE_ASPECT_RATIO_OPTIONS.map((ratio) => (
              <ToggleGroupItem key={ratio} value={ratio} aria-label={ratio}>
                {ratio}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <SpecSection
          label={t('frame.quality')}
          options={imageQualityOptions(model)}
          value={quality ?? ''}
          onChange={onQualityChange}
        />
        <SpecSection
          label={t('frame.resolution')}
          options={imageResolutionOptions(model)}
          value={resolution ?? ''}
          onChange={onResolutionChange}
        />
        <SpecSection
          label={t('frame.count')}
          options={IMAGE_COUNT_OPTIONS}
          value={count === undefined ? '' : String(count)}
          onChange={(next) => onCountChange(Number(next))}
        />
        {/* 比例与单价都还不知道时**整行不渲染**，⛔ 不留一条空行占位：
            弹层底下多出一条谁也解释不了的空白，比少一行更难懂。 */}
        {readout ? (
          <p
            data-image-frame-readout
            className="text-xs tabular-nums text-muted-foreground"
          >
            {readout}
          </p>
        ) : null}
      </div>
    </ChipPopover>
  )
}
