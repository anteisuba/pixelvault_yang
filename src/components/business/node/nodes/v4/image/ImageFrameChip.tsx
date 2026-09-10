'use client'

/**
 * 提示词栏上的**「画面」chip 与它的弹层**（spec §3，画板 `PromptBar.dc.html`）。
 *
 * 一个按钮 + 一张 300 宽的弹层：比例（分段控件）+ 底部实时读数「W×H · 约 $x/张」。
 *
 * ⚠ 画板上这张弹层还画了**质量 / 分辨率 / 张数**三段。它们在今天的数据层里
 * **一个落点都没有**：`NodeV4GenerationParams` 只有 aspectRatio / resolution /
 * duration / generateAudio / seed，而图片生成的载荷（`planV4Generation` 的 image
 * 分支）只带 `aspectRatio`。渲染出来只会是三段**按了什么都不变**的控件 —— 那比
 * 缺一段更糟（用户会以为自己选了 4K）。所以本片只落比例，其余三段等数据与服务
 * 那一层补上再开，⛔ 不先摆一个假的。
 */

import { useTranslations } from 'next-intl'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

import { ChipPopover } from '../chrome'
import {
  IMAGE_ASPECT_RATIO_OPTIONS,
  imageFrameReadout,
} from './image-node-model'

/** 画板上的两档弹层宽：参数 300 / 模型 320。 */
const FRAME_POPOVER_WIDTH = 300

export interface ImageFrameChipProps {
  readonly aspectRatio: string | undefined
  readonly modelId: string | undefined
  onAspectRatioChange(next: string): void
  readonly disabled?: boolean
}

export function ImageFrameChip({
  aspectRatio,
  modelId,
  onAspectRatioChange,
  disabled = false,
}: ImageFrameChipProps) {
  const t = useTranslations('StudioNode.v4.image')
  const readout = imageFrameReadout(aspectRatio, modelId)

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
