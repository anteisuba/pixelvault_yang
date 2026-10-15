'use client'

/**
 * 画布图片卡提示词栏上的**规格 chip**。
 *
 * ⭐ 2026-09-18（D2 ④ 第 12 项）：它不再自己画一张 300 宽的四段弹层，而是挂共用的
 * `SpecChip` —— 与工作台图片 / 工作台视频 / 画布视频卡是**同一颗组件**。chip 上写
 * 全量摘要「比例 · 清晰度」；画布弹层按 mock 只出比例与张数，工作台保留完整参数。
 *
 * ⛔ 这里不算任何一个数：档位值域与摘要全在 `@/lib/spec-chip-model`，底部那行
 * 「W×H · 约 $x/张」的读数仍在 `image-node-model.ts`。
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { buildImageSpecChipModel } from '@/lib/spec-chip-model'
import { wrapImagePromptTemplate } from '@/lib/image-prompt-templates'
import { cn } from '@/lib/utils'
import { SpecChip } from '@/components/business/studio-shared/spec'
import { useStudioChipDensity } from '@/components/business/studio-shared/primitives/tool-surface'
import { ADAPTER_CAPABILITIES } from '@/constants/provider-capabilities'
import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  IMAGE_PROMPT_TEMPLATES,
  type ImagePromptTemplateId,
} from '@/constants/image-prompt-templates'
import type { NodeWorkflowModelOption } from '@/types/node-workflow'

import { IMAGE_COUNT_OPTIONS, imageFrameReadout } from './image-node-model'

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
  onResolutionChange(next: string): void
  onCountChange(next: number): void
  /**
   * 挂着的 `/` 模板（node-canvas-v2 §3）：张数按模板钉死、chip 首位写模板名、弹层
   * 底部可展开看发出去的全文。模板在正文里打 `/` 挂、退格摘，⛔ 这里没有开关。
   */
  readonly promptTemplate?: ImagePromptTemplateId
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
  onResolutionChange,
  onCountChange,
  promptTemplate,
  disabled = false,
}: ImageFrameChipProps) {
  const t = useTranslations('StudioNode.v4.image')
  const tSpec = useTranslations('StudioSpecChip')
  const compact = useStudioChipDensity() === 'compact'
  const [templateOpen, setTemplateOpen] = useState(false)
  // 挂着模板时张数由模板钉死，读数也按它算。
  const templateCount = promptTemplate
    ? IMAGE_PROMPT_TEMPLATES[promptTemplate].count
    : undefined
  const effectiveCount = templateCount ?? count

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
      triggerClassName="max-w-50"
      summaryLead={t('frame.title')}
      compactBatchCount={
        compact
          ? {
              value: effectiveCount ?? 1,
              options: IMAGE_COUNT_OPTIONS.map((option) =>
                Number(option.value),
              ),
              locked: Boolean(promptTemplate),
              lockedHint: promptTemplate
                ? t('template.countLocked')
                : undefined,
              onChange: onCountChange,
            }
          : undefined
      }
      {...(promptTemplate
        ? { summaryPrefix: t(`template.${promptTemplate}.short`) }
        : {})}
      more={
        compact ? undefined : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="flex items-center justify-between gap-2 text-2xs font-medium text-muted-foreground/70">
                {tSpec('moreItem.batchCount')}
                {promptTemplate ? (
                  <span className="font-normal">
                    {t('template.countLocked')}
                  </span>
                ) : null}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {IMAGE_COUNT_OPTIONS.map((option) => {
                  const locked = disabled || Boolean(promptTemplate)
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={
                        String(effectiveCount ?? '') === option.value
                      }
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
            {/* 比例与单价都还不知道时**整行不渲染**，⛔ 不留一条空行占位。 */}
            {readout ? (
              <p
                data-image-frame-readout
                className="text-xs tabular-nums text-muted-foreground"
              >
                {readout}
              </p>
            ) : null}
            {promptTemplate ? (
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  aria-expanded={templateOpen}
                  onClick={() => setTemplateOpen((open) => !open)}
                  className="self-start rounded-md text-2xs text-muted-foreground underline-offset-4 transition-colors duration-fast hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {templateOpen
                    ? t('template.fullTextHide')
                    : t('template.fullTextShow')}
                </button>
                {templateOpen ? (
                  <p
                    data-storyboard-template
                    className="whitespace-pre-wrap rounded-lg bg-muted/60 px-2.5 py-2 font-mono text-2xs leading-4 text-foreground"
                  >
                    {wrapImagePromptTemplate(
                      promptTemplate,
                      t('template.storyPlaceholder'),
                    )}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        )
      }
    />
  )
}
