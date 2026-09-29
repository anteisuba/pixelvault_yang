'use client'

/**
 * 画布图片卡提示词栏上的**规格 chip**。
 *
 * ⭐ 2026-09-18（D2 ④ 第 12 项）：它不再自己画一张 300 宽的四段弹层，而是挂共用的
 * `SpecChip` —— 与工作台图片 / 工作台视频 / 画布视频卡是**同一颗组件**。chip 上写
 * 全量摘要「比例 · 清晰度」，弹层分「比例」「尺寸 / 清晰度」两段，张数与画质收进
 * 底部「更多」折叠区（画板：提示词栏只剩 模型 chip + 规格 chip）。
 *
 * ⛔ 这里不算任何一个数：档位值域与摘要全在 `@/lib/spec-chip-model`，底部那行
 * 「W×H · 约 $x/张」的读数仍在 `image-node-model.ts`。
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { buildImageSpecChipModel } from '@/lib/spec-chip-model'
import { cn } from '@/lib/utils'
import { SpecChip } from '@/components/business/studio-shared/spec'
import { ADAPTER_CAPABILITIES } from '@/constants/provider-capabilities'
import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import { STORYBOARD_GRID_PROMPT_TEMPLATE } from '@/constants/storyboard-grid'
import type { NodeWorkflowModelOption } from '@/types/node-workflow'
import { Switch } from '@/components/ui/switch'

import {
  IMAGE_COUNT_OPTIONS,
  imageFrameReadout,
  imageQualityOptions,
} from './image-node-model'

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
  /**
   * 九宫格分镜（node-canvas-v2 §3）：开着时发送前接上分镜模板、只出一张、出完切成九格。
   * 不给回调 = 不出这一行（手机抽屉这一轮不带）。
   */
  readonly storyboardGrid?: boolean
  onStoryboardGridChange?(next: boolean): void
  readonly disabled?: boolean
}

const moreTierClass =
  'inline-flex h-11 min-w-11 items-center justify-center rounded-lg border px-2.5 text-xs transition-colors duration-fast ease-standard md:h-7.5'
const moreTierActiveClass = 'border-foreground bg-foreground text-background'
const moreTierIdleClass =
  'border-border bg-background text-foreground hover:border-foreground/40'
const moreTierBlockedClass =
  'cursor-not-allowed border-border bg-background text-muted-foreground/60 line-through'

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
  storyboardGrid = false,
  onStoryboardGridChange,
  disabled = false,
}: ImageFrameChipProps) {
  const t = useTranslations('StudioNode.v4.image')
  const tSpec = useTranslations('StudioSpecChip')
  const [templateOpen, setTemplateOpen] = useState(false)
  // 九宫格开着时只出一张：张数钉在 1，读数也按一张算。
  const effectiveCount = storyboardGrid ? 1 : count

  const adapterType =
    model && model.adapterType in ADAPTER_CAPABILITIES
      ? (model.adapterType as AI_ADAPTER_TYPES)
      : undefined
  const specModel = buildImageSpecChipModel({
    adapterType,
    modelId: model?.modelId,
    aspectRatio: aspectRatio ?? null,
    resolution: resolution ?? null,
  })
  const qualities = imageQualityOptions(model)
  const readout = imageFrameReadout(aspectRatio, modelId, {
    ...(quality ? { quality } : {}),
    ...(effectiveCount === undefined ? {} : { count: effectiveCount }),
  })

  return (
    <SpecChip
      model={specModel}
      ariaLabel={t('frame.title')}
      resolutionLabel={tSpec('imageResolutionLabel')}
      aspectRatio={aspectRatio ?? null}
      onAspectRatioChange={onAspectRatioChange}
      resolution={resolution ?? null}
      onResolutionChange={onResolutionChange}
      disabled={disabled}
      data-testid="image-frame-chip"
      triggerClassName="h-6 min-h-6 max-w-50 px-2 text-2xs"
      {...(storyboardGrid ? { summaryPrefix: t('storyboard.chipPrefix') } : {})}
      more={
        <div className="flex flex-col gap-3">
          {onStoryboardGridChange ? (
            <div className="flex min-h-11 items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-xs font-medium text-foreground">
                  {t('storyboard.toggle')}
                </span>
                <span className="text-2xs text-muted-foreground">
                  {t('storyboard.toggleHint')}
                </span>
              </div>
              <Switch
                checked={storyboardGrid}
                disabled={disabled}
                onCheckedChange={onStoryboardGridChange}
                aria-label={t('storyboard.toggle')}
                data-testid="storyboard-grid-switch"
              />
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <span className="flex items-center justify-between gap-2 text-2xs font-medium text-muted-foreground/70">
              {tSpec('moreItem.batchCount')}
              {storyboardGrid ? (
                <span className="font-normal">
                  {t('storyboard.countLocked')}
                </span>
              ) : null}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {IMAGE_COUNT_OPTIONS.map((option) => {
                const locked = disabled || storyboardGrid
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={String(effectiveCount ?? '') === option.value}
                    aria-disabled={locked}
                    onClick={() => {
                      if (locked) return
                      onCountChange(Number(option.value))
                    }}
                    className={cn(
                      moreTierClass,
                      String(effectiveCount ?? '') === option.value
                        ? moreTierActiveClass
                        : locked
                          ? moreTierBlockedClass
                          : moreTierIdleClass,
                    )}
                  >
                    {option.value}
                  </button>
                )
              })}
            </div>
          </div>
          {/* 画质是**逐模型的专属能力**（第 11 项把它从规格里搬走），所以它落在
              「更多」里而不是与比例 / 清晰度并列。不支持的档灰显划线不移除。 */}
          {qualities.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-2xs font-medium text-muted-foreground/70">
                {t('frame.quality')}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {qualities.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={quality === option.value}
                    aria-disabled={option.disabled || disabled}
                    title={
                      option.disabled
                        ? tSpec('tierUnsupported', { tier: option.value })
                        : undefined
                    }
                    onClick={() => {
                      if (option.disabled || disabled) return
                      onQualityChange(option.value)
                    }}
                    className={cn(
                      moreTierClass,
                      option.disabled
                        ? moreTierBlockedClass
                        : quality === option.value
                          ? moreTierActiveClass
                          : moreTierIdleClass,
                    )}
                  >
                    {option.value}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {/* 比例与单价都还不知道时**整行不渲染**，⛔ 不留一条空行占位。 */}
          {readout ? (
            <p
              data-image-frame-readout
              className="text-xs tabular-nums text-muted-foreground"
            >
              {readout}
            </p>
          ) : null}
          {storyboardGrid ? (
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                aria-expanded={templateOpen}
                onClick={() => setTemplateOpen((open) => !open)}
                className="self-start rounded-md text-2xs text-muted-foreground underline-offset-4 transition-colors duration-fast hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {templateOpen
                  ? t('storyboard.templateHide')
                  : t('storyboard.templateShow')}
              </button>
              {templateOpen ? (
                <p
                  data-storyboard-template
                  className="whitespace-pre-wrap rounded-lg bg-muted/60 px-2.5 py-2 font-mono text-2xs leading-4 text-foreground"
                >
                  {STORYBOARD_GRID_PROMPT_TEMPLATE.replace(
                    '{story}',
                    t('storyboard.templateStory'),
                  )}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      }
    />
  )
}
