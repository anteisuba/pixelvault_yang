'use client'

import { useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Loader2,
  Plus,
  Wand2,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  CIVITAI_MODEL_SEARCH_URL,
  LORA_CARD_SOURCE_IMAGE_WIDTH,
} from '@/constants/lora'
import { LORA_STACK_MAX } from '@/hooks/use-active-lora-stack'
import { rewriteCivitaiImageUrl } from '@/lib/civitai-image-url'
import { toCivitaiModelSearchQuery } from '@/lib/civitai-lora-reference'
import { buildCivitaiRecipeGenerationPlan } from '@/lib/civitai-recipe-to-generation'
import {
  extraLoraKey,
  extraLoraLabel,
  isRecipeExtraResolvable,
  type ExtraMountStatus,
} from '@/lib/lora-recipe-extra-mount'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import type { CivitaiImageRecipe, CivitaiRecipeExtraLora } from '@/types'

/**
 * Source image recipe strip (M2c): show Civitai source images and expand the
 * selected image's recipe. The parent owns recipe application so the external
 * CTA and expanded preview always use the same selected recipe and seed flag.
 */

export interface ApplyRecipeOptions {
  includeSeed: boolean
}

interface LoraSourceRecipeStripProps {
  assetName: string
  recipes: readonly CivitaiImageRecipe[]
  selectedImageUrl: string | null
  includeSeed: boolean
  extraMountStatusByKey: Record<string, ExtraMountStatus>
  extraStackFull: boolean
  disabled?: boolean
  onSelectedImageUrlChange: (imageUrl: string | null) => void
  onIncludeSeedChange: (includeSeed: boolean) => void
  onMountExtraLora: (extra: CivitaiRecipeExtraLora) => void
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
}

interface SourceImagePreview {
  url: string
  label: string
}

export function LoraSourceRecipeStrip({
  assetName,
  recipes,
  selectedImageUrl,
  includeSeed,
  extraMountStatusByKey,
  extraStackFull,
  disabled,
  onSelectedImageUrlChange,
  onIncludeSeedChange,
  onMountExtraLora,
  onApplyRecipe,
  onRequestInference,
  inferenceLoading,
  inferenceError,
}: LoraSourceRecipeStripProps) {
  const t = useTranslations('LoraPromptControl.generate')
  const [preview, setPreview] = useState<SourceImagePreview | null>(null)
  const previewTriggerRef = useRef<HTMLButtonElement | null>(null)

  const selected = selectedImageUrl
    ? (recipes.find((recipe) => recipe.imageUrl === selectedImageUrl) ?? null)
    : null
  const plan = useMemo(
    () => (selected ? buildCivitaiRecipeGenerationPlan(selected) : null),
    [selected],
  )

  if (recipes.length === 0) {
    if (!onRequestInference) return null
    return (
      <div className="mt-2.5 rounded-md border border-dashed border-border/70 p-2.5">
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

  const paramsLine = selected
    ? [
        selected.seed !== undefined ? `seed ${selected.seed}` : null,
        selected.steps !== undefined ? `steps ${selected.steps}` : null,
        selected.cfgScale !== undefined ? `cfg ${selected.cfgScale}` : null,
        selected.sizeRaw ??
          (selected.width && selected.height
            ? `${selected.width}x${selected.height}`
            : null),
      ]
        .filter(Boolean)
        .join(' | ')
    : ''

  return (
    <div className="mt-2.5">
      <p className="text-2xs text-muted-foreground">
        {t('sourceImagesLabel', { count: recipes.length })}
      </p>
      <div className="mt-1 flex gap-1.5 overflow-x-auto pb-1">
        {recipes.map((recipe, idx) => {
          const isSelected = recipe.imageUrl === selectedImageUrl
          const imageLabel = t('sourceImageAlt', {
            name: assetName,
            n: idx + 1,
          })
          const previewLabel = t('sourceImagePreviewLabel', {
            name: assetName,
            n: idx + 1,
          })
          return (
            <button
              key={recipe.imageUrl}
              type="button"
              disabled={disabled}
              onClick={(event) => {
                previewTriggerRef.current = event.currentTarget
                onSelectedImageUrlChange(recipe.imageUrl)
                setPreview({ url: recipe.imageUrl, label: imageLabel })
              }}
              aria-pressed={isSelected}
              aria-label={previewLabel}
              className={cn(
                'shrink-0 cursor-zoom-in overflow-hidden rounded-md border outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
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
          {selected.source === 'ai_inferred' ? (
            <p className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-2xs font-medium text-amber-700 dark:text-amber-300">
              <Wand2 className="size-2.5" aria-hidden />
              {t('recipeInferredBadge')}
            </p>
          ) : null}
          <div className="flex items-start justify-between gap-2">
            <p className="break-words font-mono text-2xs leading-relaxed text-foreground">
              {plan.prompt}
            </p>
            <button
              type="button"
              onClick={() => onSelectedImageUrlChange(null)}
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
              {selected.checkpoint ? ` | ${selected.checkpoint}` : ''}
            </p>
          ) : null}

          {plan.extraLoras.length > 0 ? (
            <ExtraLoraList
              disabled={disabled}
              extras={plan.extraLoras}
              statusByKey={extraMountStatusByKey}
              stackFull={extraStackFull}
              onMountExtraLora={onMountExtraLora}
            />
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
                  onChange={(event) =>
                    onIncludeSeedChange(event.target.checked)
                  }
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

      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null)
        }}
      >
        <DialogContent
          closeLabel={t('sourceImagePreviewClose')}
          // 画中框：不再撑满视口（h-dvh/w-dvw）——那样会让内容本身盖住整个
          // 遮罩，Radix 默认的"点击外部关闭"就点不到了。收成贴合图片的卡片，
          // 四周露出真正可点击的 DialogOverlay，点空白处关闭是 Radix 免费
          // 自带的行为，不用额外接逻辑。
          className="w-auto max-w-[min(92vw,720px)] gap-0 rounded-2xl border-border/60 bg-background/95 p-3 shadow-2xl backdrop-blur-md sm:max-w-[min(92vw,720px)]"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            previewTriggerRef.current?.focus()
          }}
        >
          <DialogTitle className="sr-only">{preview?.label ?? ''}</DialogTitle>
          <DialogDescription className="sr-only">
            {t('sourceImagePreviewDescription')}
          </DialogDescription>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.url}
              alt={preview.label}
              className="max-h-[75vh] max-w-full rounded-lg object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Extra LoRA mount controls for stacked source-image recipes.

interface ExtraLoraListProps {
  extras: readonly CivitaiRecipeExtraLora[]
  statusByKey: Record<string, ExtraMountStatus>
  stackFull: boolean
  disabled?: boolean
  onMountExtraLora: (extra: CivitaiRecipeExtraLora) => void
}

function ExtraLoraList({
  extras,
  statusByKey,
  stackFull,
  disabled,
  onMountExtraLora,
}: ExtraLoraListProps) {
  const t = useTranslations('LoraPromptControl.generate')

  return (
    <div className="space-y-1">
      <p className="flex items-start gap-1.5 text-2xs text-amber-700 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
        {t('recipeExtraLoras', { count: extras.length })}
      </p>
      <ul className="space-y-1">
        {extras.map((extra) => {
          const key = extraLoraKey(extra)
          const status = statusByKey[key]
          const resolvable = isRecipeExtraResolvable(extra)
          return (
            <li
              key={key}
              className="flex items-center justify-between gap-2 text-2xs"
            >
              <span className="min-w-0 truncate font-mono text-muted-foreground">
                {extraLoraLabel(extra)}
                {extra.weight !== undefined ? ` x${extra.weight}` : ''}
              </span>
              {!resolvable ? (
                <span className="shrink-0 text-muted-foreground/70">
                  {t('recipeExtraUnresolvable')}
                </span>
              ) : status === 'mounted' ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-emerald-700 dark:text-emerald-300">
                  <Check className="size-3" aria-hidden />
                  {t('recipeExtraMounted')}
                </span>
              ) : (
                <span className="inline-flex shrink-0 items-center gap-1.5">
                  {status === 'failed' ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-destructive">
                        {t('recipeExtraFailed')}
                      </span>
                      {extra.name ? (
                        <a
                          href={`${CIVITAI_MODEL_SEARCH_URL}?query=${encodeURIComponent(
                            toCivitaiModelSearchQuery(extra.name),
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 text-muted-foreground underline hover:text-foreground"
                        >
                          {t('recipeExtraSearchLink')}
                          <ExternalLink className="size-2.5" aria-hidden />
                        </a>
                      ) : null}
                    </span>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={disabled || status === 'loading' || stackFull}
                    title={
                      stackFull
                        ? t('recipeExtraStackFull', { max: LORA_STACK_MAX })
                        : undefined
                    }
                    onClick={() => onMountExtraLora(extra)}
                  >
                    {status === 'loading' ? (
                      <Loader2 className="size-3 animate-spin" aria-hidden />
                    ) : (
                      <Plus className="size-3" aria-hidden />
                    )}
                    {status === 'loading'
                      ? t('recipeExtraResolving')
                      : t('recipeExtraMount')}
                  </Button>
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {stackFull ? (
        <p className="text-2xs text-muted-foreground">
          {t('recipeExtraStackFull', { max: LORA_STACK_MAX })}
        </p>
      ) : null}
    </div>
  )
}
