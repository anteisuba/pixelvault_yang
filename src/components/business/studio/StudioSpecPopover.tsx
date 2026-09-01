'use client'

import { useRef } from 'react'
import { ChevronDown } from 'lucide-react'
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
import {
  StudioToolPopoverContent,
  StudioToolSurface,
  StudioToolSurfaceTrigger,
  studioChipActiveClass,
} from '@/components/business/studio-shared/primitives/tool-surface'

interface StudioSpecPopoverProps {
  disabled?: boolean
}

type ResolutionValue = NonNullable<AdvancedParams['resolution']>

function isResolutionValue(value: string): value is ResolutionValue {
  return value === 'auto' || value === '1K' || value === '2K' || value === '4K'
}

const segButtonClass =
  'inline-flex min-w-14 flex-1 items-center justify-center gap-1.5 rounded-full border border-transparent px-3 py-1.5 text-xs font-medium transition-colors duration-fast ease-standard'
const segInactiveClass =
  'border border-border/60 text-muted-foreground hover:border-primary/30 hover:text-foreground'

/**
 * 比例的线框缩略图 —— 光看「4:3 / 3:4」两个数字要在脑子里换算横竖，画一个
 * 同比例的小框就不用换算了。旧的 `StudioAspectRatioPopover` 是在旁边单摆一个
 * 96px 大预览（只显示当前选中那个）；逐行带框能让**所有候选**一眼可比。
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

/**
 * StudioSpecPopover —— 参数栏专用的「规格」单一触发器：比例 · 清晰度 · 每模型几张
 * 收进一个下拉，触发器上写全（`16:9 · 自动 · 每模型 1 张`）。
 *
 * 对标 LibTV 把生成数量做成与比例、分辨率同级的常规参数、压在一个下拉里；
 * owner 2026-08-14 拍板照此做。
 *
 * ⚠ **不替代** dock 里那三颗独立的 chip（`StudioAspectRatioPopover` /
 * `StudioResolutionPopover` / `StudioBatchCountPopover`）—— 视频 / 音频仍走 dock，
 * 那边一行只放得下小丸，且清晰度对它们是另一套能力。这里只服务图片参数栏。
 *
 * 三档的数据源一个都没有自己发明：比例 = `STUDIO_IMAGE_ASPECT_RATIOS`，清晰度 =
 * `getCapabilityConfig().resolutionOptions`（模型没有这个能力时**整组不渲染**，
 * 与 `StudioResolutionPopover` 的契约一致），张数 = `IMAGE_BATCH_COUNTS`。
 */
export function StudioSpecPopover({ disabled }: StudioSpecPopoverProps) {
  const { state, dispatch } = useStudioForm()
  const { selectedModel } = useImageModelOptions()
  const t = useTranslations('StudioV2')

  const triggerRef = useRef<HTMLButtonElement>(null)
  const open = state.panels.spec
  const resolution = state.advancedParams.resolution ?? 'auto'
  const resolutionOptions = selectedModel
    ? (getCapabilityConfig(selectedModel.adapterType, selectedModel.modelId)
        ?.resolutionOptions ?? [])
    : []

  // 触发器写全三档 —— 收起状态下也不用点开才知道下一版长什么样。
  // ⚠ 清晰度只在**当前值确实在候选里**时才印（照 `StudioResolutionPopover` 的
  // 既有守卫）：能力表给的是 1K/2K/4K 而默认值是 `auto`，不守卫就会印出一个
  // 「自动」但弹层里根本没有「自动」可点 —— 显示了一个回不去的值。
  const summary = [
    state.aspectRatio,
    resolutionOptions.includes(resolution)
      ? t(`resolutionOption.${resolution}`)
      : null,
    t('batchCountSummary', { count: state.imageBatchCount }),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <StudioToolSurface
      open={open}
      onOpenChange={(nextOpen) =>
        dispatch({
          type: nextOpen ? 'OPEN_PANEL' : 'CLOSE_PANEL',
          payload: 'spec',
        })
      }
    >
      <StudioToolSurfaceTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          aria-label={t('specLabel')}
          className={cn(
            'flex h-9 w-full items-center gap-2 rounded-lg border border-border/60 bg-background px-3 text-xs font-medium text-foreground',
            'transition-colors duration-fast ease-standard hover:border-primary/25',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
            'disabled:pointer-events-none disabled:opacity-50',
            open && 'border-primary/30 bg-muted/45',
          )}
        >
          <span className="truncate">{summary}</span>
          <ChevronDown
            className={cn(
              'ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform duration-base ease-standard',
              open && 'rotate-180',
            )}
          />
        </button>
      </StudioToolSurfaceTrigger>
      <StudioToolPopoverContent
        size="small"
        className="w-64"
        side="bottom"
        align="start"
        label={t('specLabel')}
      >
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
                    segButtonClass,
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
                      segButtonClass,
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
                    segButtonClass,
                    state.imageBatchCount === count
                      ? studioChipActiveClass
                      : segInactiveClass,
                  )}
                >
                  {`×${count}`}
                </button>
              ))}
            </div>
            <p className="text-2xs text-muted-foreground">
              {t('batchCountHint')}
            </p>
          </div>
        </div>
      </StudioToolPopoverContent>
    </StudioToolSurface>
  )
}
