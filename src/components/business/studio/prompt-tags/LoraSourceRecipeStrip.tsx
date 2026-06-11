'use client'

import { useCallback, useMemo, useState } from 'react'
import { AlertTriangle, Check, Loader2, Plus, Wand2, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { LORA_CARD_SOURCE_IMAGE_WIDTH } from '@/constants/lora'
import {
  LORA_STACK_MAX,
  useActiveLoraStack,
} from '@/hooks/use-active-lora-stack'
import { resolveCivitaiLoraAPI } from '@/lib/api-client/lora-assets'
import { rewriteCivitaiImageUrl } from '@/lib/civitai-image-url'
import { buildCivitaiRecipeGenerationPlan } from '@/lib/civitai-recipe-to-generation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  LoraSchema,
  type CivitaiImageRecipe,
  type CivitaiRecipeExtraLora,
} from '@/types'

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
  /**
   * 解法三：无配方数据但有封面/预览图时的 AI 反推入口。提供该回调即在
   * recipes 为空时渲染「AI 反推配方」按钮；产出的伪配方（source =
   * 'ai_inferred'）由父级并入 recipes，本组件负责"推测"标注。
   */
  onRequestInference?: () => void
  inferenceLoading?: boolean
  inferenceError?: string | null
}

export function LoraSourceRecipeStrip({
  assetName,
  recipes,
  disabled,
  onApplyRecipe,
  onRequestInference,
  inferenceLoading,
  inferenceError,
}: LoraSourceRecipeStripProps) {
  const t = useTranslations('LoraPromptControl.generate')
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [includeSeed, setIncludeSeed] = useState(true)

  const selected = selectedIdx !== null ? (recipes[selectedIdx] ?? null) : null
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
            <ExtraLoraList disabled={disabled} extras={plan.extraLoras} />
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

// ── 一键补挂：配方里的其它 LoRA ─────────────────────────────────────────

type ExtraMountStatus = 'loading' | 'mounted' | 'failed'

function extraLoraKey(extra: CivitaiRecipeExtraLora): string {
  return (
    extra.hash ??
    (extra.modelVersionId !== undefined ? `v${extra.modelVersionId}` : null) ??
    `n:${extra.name ?? 'unknown'}`
  )
}

function extraLoraLabel(extra: CivitaiRecipeExtraLora): string {
  return (
    extra.name ??
    (extra.modelVersionId !== undefined
      ? `#${extra.modelVersionId}`
      : (extra.hash?.slice(0, 12) ?? 'LoRA'))
  )
}

interface ExtraLoraListProps {
  extras: readonly CivitaiRecipeExtraLora[]
  disabled?: boolean
}

function ExtraLoraList({ extras, disabled }: ExtraLoraListProps) {
  const t = useTranslations('LoraPromptControl.generate')
  const loraStack = useActiveLoraStack()
  const [statusByKey, setStatusByKey] = useState<
    Record<string, ExtraMountStatus>
  >({})
  const stackFull = loraStack.items.length >= LORA_STACK_MAX

  const handleMount = useCallback(
    async (extra: CivitaiRecipeExtraLora) => {
      const key = extraLoraKey(extra)
      setStatusByKey((prev) => ({ ...prev, [key]: 'loading' }))
      const result = await resolveCivitaiLoraAPI({
        hash: extra.hash,
        modelVersionId: extra.modelVersionId,
      })
      if (!result.success || !result.data) {
        setStatusByKey((prev) => ({ ...prev, [key]: 'failed' }))
        return
      }
      const item = result.data
      const alreadyMounted = loraStack.items.some(
        (entry) => entry.asset.id === item.id,
      )
      if (!alreadyMounted) {
        // 原图权重在合法范围内时随挂载带上；越界（如负权重滑块）回落默认。
        const scale = LoraSchema.shape.scale.safeParse(extra.weight).success
          ? extra.weight
          : undefined
        loraStack.push(item, scale)
      }
      setStatusByKey((prev) => ({ ...prev, [key]: 'mounted' }))
    },
    [loraStack],
  )

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
          const resolvable =
            extra.hash !== undefined || extra.modelVersionId !== undefined
          return (
            <li
              key={key}
              className="flex items-center justify-between gap-2 text-2xs"
            >
              <span className="min-w-0 truncate font-mono text-muted-foreground">
                {extraLoraLabel(extra)}
                {extra.weight !== undefined ? ` ×${extra.weight}` : ''}
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
                    <span className="text-destructive">
                      {t('recipeExtraFailed')}
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
                    onClick={() => void handleMount(extra)}
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
