'use client'

import { useTranslations } from 'next-intl'

import { getCapabilityConfig } from '@/constants/provider-capabilities'
import {
  IMAGE_BATCH_COUNTS,
  STUDIO_IMAGE_ASPECT_RATIOS,
} from '@/constants/studio'
import { useStudioForm } from '@/contexts/studio-context'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { cn } from '@/lib/utils'
import type { AdvancedParams } from '@/types'
import { studioChipActiveClass } from '@/components/business/studio-shared/primitives/tool-surface'

type ResolutionValue = NonNullable<AdvancedParams['resolution']>

function isResolutionValue(value: string): value is ResolutionValue {
  return value === 'auto' || value === '1K' || value === '2K' || value === '4K'
}

const segButtonClass =
  'inline-flex min-w-14 flex-1 items-center justify-center gap-1.5 rounded-full border border-transparent px-3 py-1.5 text-xs font-medium transition-colors duration-fast ease-standard'
const segInactiveClass =
  'border border-border/60 text-muted-foreground hover:border-primary/30 hover:text-foreground'
/** 触屏宿主（移动端 sheet）里同一组 chip 要撑到 44px 命中区。 */
const segTouchClass = 'min-h-11 text-sm'

/**
 * 比例的线框缩略图 —— 光看「4:3 / 3:4」两个数字要在脑子里换算横竖，画一个
 * 同比例的小框就不用换算了。逐行带框能让**所有候选**一眼可比。
 */
function RatioGlyph({ ratio }: { ratio: string }) {
  const [w, h] = ratio.split(':').map(Number)
  const BOX = 12
  const scale = w >= h ? BOX / w : BOX / h
  return (
    <span
      className="flex size-3.5 shrink-0 items-center justify-center"
      aria-hidden
    >
      <span
        className="rounded-[1.5px] border border-current"
        style={{ width: `${w * scale}px`, height: `${h * scale}px` }}
      />
    </span>
  )
}

interface StudioSpecFieldsProps {
  /** 触屏宿主：chip 撑到 44px（移动端规格 sheet）。 */
  touch?: boolean
}

/**
 * StudioSpecFields —— 图片「规格」三档（比例 · 清晰度 · 每模型几张）的**唯一**实现。
 *
 * 两个宿主共用它：桌面参数栏的 `StudioSpecPopover`（锚定浮层）与移动端底部的
 * `StudioMobileSpecSheet`（vaul 抽屉 + 负面提示词）。抽出来的理由与
 * `useStudioGenerateAction` 同：两处各写一遍取值域必然分叉。
 *
 * 三档的数据源一个都没有自己发明：比例 = `STUDIO_IMAGE_ASPECT_RATIOS`，清晰度 =
 * `getCapabilityConfig().resolutionOptions`（模型没有这个能力时**整组不渲染**），
 * 张数 = `IMAGE_BATCH_COUNTS`。
 */
export function StudioSpecFields({ touch }: StudioSpecFieldsProps) {
  const { state, dispatch } = useStudioForm()
  const { selectedModel } = useImageModelOptions()
  const t = useTranslations('StudioV2')

  const resolution = state.advancedParams.resolution ?? 'auto'
  const resolutionOptions = selectedModel
    ? (getCapabilityConfig(selectedModel.adapterType, selectedModel.modelId)
        ?.resolutionOptions ?? [])
    : []
  const chipClass = cn(segButtonClass, touch && segTouchClass)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-2xs font-medium text-muted-foreground/70">
          {t('aspectRatioLabel')}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {STUDIO_IMAGE_ASPECT_RATIOS.map((ratio) => (
            <button
              key={ratio}
              type="button"
              role="radio"
              aria-checked={state.aspectRatio === ratio}
              onClick={() =>
                dispatch({ type: 'SET_ASPECT_RATIO', payload: ratio })
              }
              className={cn(
                chipClass,
                state.aspectRatio === ratio
                  ? studioChipActiveClass
                  : segInactiveClass,
              )}
            >
              <RatioGlyph ratio={ratio} />
              {ratio}
            </button>
          ))}
        </div>
      </div>

      {resolutionOptions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-2xs font-medium text-muted-foreground/70">
            {t('resolutionLabel')}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {resolutionOptions.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={resolution === value}
                onClick={() => {
                  if (!isResolutionValue(value)) return
                  dispatch({
                    type: 'SET_ADVANCED_PARAMS',
                    payload: { ...state.advancedParams, resolution: value },
                  })
                }}
                className={cn(
                  chipClass,
                  resolution === value
                    ? studioChipActiveClass
                    : segInactiveClass,
                )}
              >
                {t(`resolutionOption.${value}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-2xs font-medium text-muted-foreground/70">
          {t('batchCountLabel')}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {IMAGE_BATCH_COUNTS.map((count) => (
            <button
              key={count}
              type="button"
              role="radio"
              aria-checked={state.imageBatchCount === count}
              onClick={() =>
                dispatch({ type: 'SET_IMAGE_BATCH_COUNT', payload: count })
              }
              className={cn(
                chipClass,
                state.imageBatchCount === count
                  ? studioChipActiveClass
                  : segInactiveClass,
              )}
            >
              {`×${count}`}
            </button>
          ))}
        </div>
        <p className="text-2xs text-muted-foreground">{t('batchCountHint')}</p>
      </div>
    </div>
  )
}

/**
 * 触发器上那一行摘要（`16:9 · 自动 · 每模型 1 张`）。移动端 chip 上写的是
 * 同一件事的短版（`1:1 · ×1`），所以摘要的组装也只有这一处。
 */
export function useStudioSpecSummary(): { full: string; short: string } {
  const { state } = useStudioForm()
  const { selectedModel } = useImageModelOptions()
  const t = useTranslations('StudioV2')

  const resolution = state.advancedParams.resolution ?? 'auto'
  const resolutionOptions = selectedModel
    ? (getCapabilityConfig(selectedModel.adapterType, selectedModel.modelId)
        ?.resolutionOptions ?? [])
    : []

  // ⚠ 清晰度只在**当前值确实在候选里**时才印：能力表给的是 1K/2K/4K 而默认值是
  // `auto`，不守卫就会印出一个「自动」但弹层里根本没有「自动」可点。
  const full = [
    state.aspectRatio,
    resolutionOptions.includes(resolution)
      ? t(`resolutionOption.${resolution}`)
      : null,
    t('batchCountSummary', { count: state.imageBatchCount }),
  ]
    .filter(Boolean)
    .join(' · ')

  return {
    full,
    short: `${state.aspectRatio} · ×${state.imageBatchCount}`,
  }
}
