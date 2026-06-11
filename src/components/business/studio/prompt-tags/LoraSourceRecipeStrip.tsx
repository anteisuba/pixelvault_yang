'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Check, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { LORA_CARD_SOURCE_IMAGE_WIDTH } from '@/constants/lora'
import { rewriteCivitaiImageUrl } from '@/lib/civitai-image-url'
import { buildCivitaiRecipeGenerationPlan } from '@/lib/civitai-recipe-to-generation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { CivitaiImageRecipe } from '@/types'

/**
 * 来源图配方条（M2c）：横滚的 Civitai 来源图，点选一张展开它的完整配方
 * （prompt / 负向 / seed / steps / cfg / 尺寸 / checkpoint），确认后
 * "一键同款"。展示层组件 — 配方→生成请求的写入由父级（LoraGenerateRow）
 * 通过 onApplyRecipe 执行，本组件只负责选中态、预览与 seed 开关。
 */

export interface ApplyRecipeOptions {
  includeSeed: boolean
}

interface LoraSourceRecipeStripProps {
  assetName: string
  recipes: readonly CivitaiImageRecipe[]
  disabled?: boolean
  onApplyRecipe: (
    recipe: CivitaiImageRecipe,
    options: ApplyRecipeOptions,
  ) => void
}

export function LoraSourceRecipeStrip({
  assetName,
  recipes,
  disabled,
  onApplyRecipe,
}: LoraSourceRecipeStripProps) {
  const t = useTranslations('LoraPromptControl.generate')
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [includeSeed, setIncludeSeed] = useState(true)

  const selected = selectedIdx !== null ? (recipes[selectedIdx] ?? null) : null
  const plan = useMemo(
    () => (selected ? buildCivitaiRecipeGenerationPlan(selected) : null),
    [selected],
  )

  if (recipes.length === 0) return null

  const paramsLine = selected
    ? [
        selected.seed !== undefined ? `seed ${selected.seed}` : null,
        selected.steps !== undefined ? `steps ${selected.steps}` : null,
        selected.cfgScale !== undefined ? `cfg ${selected.cfgScale}` : null,
        selected.sizeRaw ??
          (selected.width && selected.height
            ? `${selected.width}×${selected.height}`
            : null),
      ]
        .filter(Boolean)
        .join(' · ')
    : ''

  return (
    <div className="mt-2.5">
      <p className="text-2xs text-muted-foreground">
        {t('sourceImagesLabel', { count: recipes.length })}
      </p>
      <div className="mt-1 flex gap-1.5 overflow-x-auto pb-1">
        {recipes.map((recipe, idx) => {
          const isSelected = idx === selectedIdx
          return (
            <button
              key={recipe.imageUrl}
              type="button"
              disabled={disabled}
              onClick={() => setSelectedIdx(isSelected ? null : idx)}
              aria-pressed={isSelected}
              aria-label={t('sourceImageAlt', { name: assetName, n: idx + 1 })}
              className={cn(
                'shrink-0 overflow-hidden rounded-md border transition-shadow',
                isSelected
                  ? 'border-primary ring-2 ring-primary/50'
                  : 'border-border/60 hover:border-primary/40',
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={rewriteCivitaiImageUrl(recipe.imageUrl, {
                  width: LORA_CARD_SOURCE_IMAGE_WIDTH,
                })}
                alt=""
                loading="lazy"
                className="h-16 w-12 object-cover"
              />
            </button>
          )
        })}
      </div>

      {selected && plan ? (
        <div className="mt-1.5 space-y-2 rounded-md border border-border/60 bg-muted/20 p-2.5">
          <div className="flex items-start justify-between gap-2">
            <p className="break-words font-mono text-2xs leading-relaxed text-foreground">
              {plan.prompt}
            </p>
            <button
              type="button"
              onClick={() => setSelectedIdx(null)}
              className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={t('recipeClose')}
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>

          {selected.negativePrompt ? (
            <p className="break-words font-mono text-2xs leading-relaxed text-muted-foreground">
              {t('negativeLabel')}: {selected.negativePrompt}
            </p>
          ) : null}

          {paramsLine ? (
            <p className="font-mono text-2xs text-muted-foreground">
              {paramsLine}
              {selected.checkpoint ? ` · ${selected.checkpoint}` : ''}
            </p>
          ) : null}

          {plan.extraLoras.length > 0 ? (
            <p className="flex items-start gap-1.5 text-2xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
              {t('recipeExtraLoras', { count: plan.extraLoras.length })}
            </p>
          ) : null}

          {plan.skippedParams.length > 0 ? (
            <p className="text-2xs text-muted-foreground">
              {t('recipeSkipped', { params: plan.skippedParams.join(', ') })}
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-2">
            {plan.advancedParams?.seed !== undefined ? (
              <label className="flex cursor-pointer items-center gap-1.5 text-2xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={includeSeed}
                  onChange={(event) => setIncludeSeed(event.target.checked)}
                  className="size-3 accent-primary"
                />
                {t('recipeUseSeed')}
              </label>
            ) : (
              <span />
            )}
            <Button
              type="button"
              variant="default"
              size="xs"
              disabled={disabled}
              onClick={() => onApplyRecipe(selected, { includeSeed })}
            >
              <Check className="size-3.5" aria-hidden />
              {t('recipeApply')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
