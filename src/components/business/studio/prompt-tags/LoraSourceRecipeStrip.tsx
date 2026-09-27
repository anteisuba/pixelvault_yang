'use client'

import { useState } from 'react'
import { Wand2 } from '@/components/icons'
import { useTranslations } from 'next-intl'

import { LORA_CARD_SOURCE_IMAGE_WIDTH } from '@/constants/lora'
import { civitaiDisplayImageUrl } from '@/lib/civitai-image-url'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { LoraSourceRecipeModal } from '@/components/business/studio/lora/LoraSourceRecipeModal'
import type { CivitaiImageRecipe, CivitaiRecipeExtraLora } from '@/types'

/**
 * Source image band (G3b · references/pages/lora-generate.md §3.1)：只呈现
 * LoRA 的效果证据缩略带——「来源图 N」+ 缩略图行 + 单击查看提示。点缩略图开
 * 共享来源配方 modal（左大图 + 右侧参数库 + 做同款），完整配方 / 参数 / 额外
 * 挂载都在 modal 里，主台不再常驻内联配方面板（退役布局 B 的 M2c 内联块 +
 * per-extra 挂载列 → 做同款一键还原时由 parent 的 handleApplyRecipe 自动挂）。
 */

export interface ApplyRecipeOptions {
  includeSeed: boolean
  /**
   * 做同款要补挂的额外 LoRA——modal 的「额外挂载」区块里勾中的那批（默认全选）。
   * 由 modal 决定而不是由 parent 从 recipe 里全量取，用户才能逐个取消。
   */
  extraLoras: readonly CivitaiRecipeExtraLora[]
}

interface LoraSourceRecipeStripProps {
  assetName: string
  /** 共享来源配方 modal 需要的底模家族与来源页 URL。 */
  baseModelFamily: string
  sourceUrl: string
  recipes: readonly CivitaiImageRecipe[]
  disabled?: boolean
  onApplyRecipe: (
    recipe: CivitaiImageRecipe,
    options: ApplyRecipeOptions,
  ) => void
  /**
   * AI inference fallback: when no Civitai recipe exists but a cover/preview
   * image does, this renders the inference action. The parent appends the
   * inferred recipe and this strip only displays the inferred badge.
   */
  onRequestInference?: () => void
  inferenceLoading?: boolean
  inferenceError?: string | null
  /**
   * `strip` = 手机结果流里那一条（带「来源图 N」标题）；`band` = 桌面生成台 B 的
   * 来源图带（标题与提示在带子自己的头上，这里只排大缩略图）。
   */
  size?: 'strip' | 'band'
  /**
   * 给了就不开自带的弹窗：点一张交给宿主开舞台里的样例查看器（桌面生成台 B，
   * 从点的那张长出来 —— 所以把那张缩略图的元素一起交出去）。
   */
  onOpenViewer?: (index: number, trigger: HTMLElement) => void
}

export function LoraSourceRecipeStrip({
  assetName,
  baseModelFamily,
  sourceUrl,
  recipes,
  disabled,
  onApplyRecipe,
  onRequestInference,
  inferenceLoading,
  inferenceError,
  size = 'strip',
  onOpenViewer,
}: LoraSourceRecipeStripProps) {
  const band = size === 'band'
  const t = useTranslations('LoraPromptControl.generate')
  // 点来源图开共享来源配方 modal（左大图 + 右侧参数库 + 做同款）。
  // modalIndex 非空 = 打开并定位到该逐图配方下标。
  const [modalIndex, setModalIndex] = useState<number | null>(null)

  if (recipes.length === 0) {
    if (!onRequestInference) return null
    return (
      <div className="rounded-md border border-dashed border-border/70 p-2.5">
        <p className="text-2xs leading-relaxed text-muted-foreground">
          {t('recipeInferHint')}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={disabled || inferenceLoading}
            onClick={onRequestInference}
          >
            <Wand2 className="size-3.5" aria-hidden />
            {inferenceLoading ? t('recipeInferring') : t('recipeInferButton')}
          </Button>
          {inferenceError ? (
            <span className="text-2xs text-destructive">{inferenceError}</span>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div>
      {band ? null : (
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-2xs text-muted-foreground">
            {t('sourceImagesLabel', { count: recipes.length })}
          </p>
          <p className="shrink-0 text-2xs text-muted-foreground/70">
            {t('sourceImagesModalHint')}
          </p>
        </div>
      )}
      <div
        className={cn(
          'lora-scrollbar-hide flex overflow-x-auto',
          band ? 'gap-2.5' : 'mt-1 gap-1.5 pb-1',
        )}
      >
        {recipes.map((recipe, idx) => {
          const previewLabel = t('sourceImagePreviewLabel', {
            name: assetName,
            n: idx + 1,
          })
          return (
            <button
              key={recipe.imageUrl}
              type="button"
              disabled={disabled}
              onClick={(event) =>
                onOpenViewer
                  ? onOpenViewer(idx, event.currentTarget)
                  : setModalIndex(idx)
              }
              data-recipe-thumb={idx}
              aria-label={previewLabel}
              className={cn(
                'shrink-0 cursor-zoom-in overflow-hidden outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                band
                  ? 'rounded-lg bg-muted hover:ring-2 hover:ring-foreground/15'
                  : 'rounded-md border border-border/60 hover:border-primary/40',
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={civitaiDisplayImageUrl(
                  recipe.imageUrl,
                  LORA_CARD_SOURCE_IMAGE_WIDTH,
                )}
                alt=""
                loading="lazy"
                className={cn(
                  'object-cover',
                  band ? 'h-22 w-16.5' : 'h-24 w-20',
                )}
              />
            </button>
          )
        })}
      </div>

      {/* 共享来源配方 modal（generate variant + 做同款）——做同款按 modal 内
          「用原图 seed」勾选应用真实配方并关门，不直接生成（parent 的
          handleApplyRecipe 决定后续，已有输入进搭配提醒 + 挂额外 LoRA）。 */}
      <LoraSourceRecipeModal
        open={!onOpenViewer && modalIndex !== null}
        onOpenChange={(open) => {
          if (!open) setModalIndex(null)
        }}
        recipes={recipes}
        index={modalIndex ?? 0}
        onIndexChange={setModalIndex}
        variant="generate"
        assetName={assetName}
        baseModelFamily={baseModelFamily}
        sourceUrl={sourceUrl}
        onApplyRecipe={(recipe, includeSeed, extraLoras) =>
          onApplyRecipe(recipe, { includeSeed, extraLoras })
        }
      />
    </div>
  )
}
