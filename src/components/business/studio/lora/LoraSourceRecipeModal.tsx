'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Copy,
  Sparkles,
  Users,
  Wand2,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { proxyCivitaiImageUrl } from '@/lib/civitai-image-url'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import type { CivitaiImageRecipe } from '@/types'

// R2 共享来源配方 modal（docs/references/pages/lora-generate.md §4 +
// lora-library.md §3）：Library 样例图与 Generate 来源图共用同一个 dialog——
// 左侧固定大图（可 prev/next），右侧独立滚动的结构化配方（提示词/负面/底模与
// 执行/参数/标签 + 复制）。Esc / 遮罩 / 关闭退出，关闭后焦点回到触发图片
// （Radix Dialog 默认恢复上一个焦点，未覆盖 onCloseAutoFocus）。
//
// - Library variant：只查看 + 复制 + 打开来源，不承担「做同款」。
// - Generate variant：追加「做同款」——只把真实可用配方应用到主台并关闭
//   modal，不直接付费生成（由 onApplyRecipe 决定后续，已有输入进搭配提醒）。
//
// 复用现有 `CivitaiImageRecipe` 数据，不新建配方 API。

export type LoraSourceRecipeModalVariant = 'library' | 'generate'

interface LoraSourceRecipeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  recipes: readonly CivitaiImageRecipe[]
  index: number
  onIndexChange: (index: number) => void
  variant: LoraSourceRecipeModalVariant
  /** 触发该配方的 LoRA 名称（modal 标题 / 上下文）。 */
  assetName: string
  /** LoRA 家族/底模（右侧「基础模型」行）。 */
  baseModelFamily: string
  /** 来源模型页 URL（「打开来源」外链）。 */
  sourceUrl: string
  /** 可选标签（来自 LoRA 资产，非逐图配方；无则不渲染标签区）。 */
  tags?: readonly string[]
  /**
   * Generate variant「做同款」：应用真实可用配方到主台，不直接生成。
   * G3b-seed：includeSeed = 是否锁原图 seed（modal 内「用原图 seed」勾选）。
   */
  onApplyRecipe?: (recipe: CivitaiImageRecipe, includeSeed: boolean) => void
}

function formatSize(recipe: CivitaiImageRecipe): string | null {
  if (recipe.sizeRaw) return recipe.sizeRaw
  if (recipe.width && recipe.height) return `${recipe.width} × ${recipe.height}`
  return null
}

/** 「复制配方」的纯文本装配：只拼真实存在的字段。 */
function buildRecipeClipboardText(recipe: CivitaiImageRecipe): string {
  const lines: string[] = [recipe.prompt]
  if (recipe.negativePrompt) {
    lines.push(`Negative prompt: ${recipe.negativePrompt}`)
  }
  const params: string[] = []
  if (recipe.steps !== undefined) params.push(`Steps: ${recipe.steps}`)
  if (recipe.sampler) params.push(`Sampler: ${recipe.sampler}`)
  if (recipe.scheduler) params.push(`Scheduler: ${recipe.scheduler}`)
  if (recipe.cfgScale !== undefined)
    params.push(`CFG scale: ${recipe.cfgScale}`)
  if (recipe.seed !== undefined) params.push(`Seed: ${recipe.seed}`)
  const size = formatSize(recipe)
  if (size) params.push(`Size: ${size}`)
  if (recipe.checkpoint) params.push(`Model: ${recipe.checkpoint}`)
  if (params.length > 0) lines.push(params.join(', '))
  return lines.join('\n')
}

export function LoraSourceRecipeModal({
  open,
  onOpenChange,
  recipes,
  index,
  onIndexChange,
  variant,
  assetName,
  baseModelFamily,
  sourceUrl,
  tags,
  onApplyRecipe,
}: LoraSourceRecipeModalProps) {
  const t = useTranslations('LoraWorkbench')
  const recipe = recipes[index] ?? null
  const total = recipes.length
  const hasMultiple = total > 1
  // G3b-seed：做同款是否锁原图 seed（仅当当前配方带 seed 时才有意义）。
  const [includeSeed, setIncludeSeed] = useState(false)

  const goPrev = useCallback(() => {
    if (total <= 1) return
    onIndexChange((index - 1 + total) % total)
  }, [index, total, onIndexChange])
  const goNext = useCallback(() => {
    if (total <= 1) return
    onIndexChange((index + 1) % total)
  }, [index, total, onIndexChange])

  // 键盘左右切图（modal 打开且有多张时）。
  useEffect(() => {
    if (!open || !hasMultiple) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goPrev()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        goNext()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, hasMultiple, goPrev, goNext])

  const size = recipe ? formatSize(recipe) : null

  const handleCopy = useCallback(
    async (text: string, successKey: string) => {
      try {
        await navigator.clipboard.writeText(text)
        toast.success(t(successKey))
      } catch {
        toast.error(t('tryPromptCopyFailed'))
      }
    },
    [t],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t('sourceRecipeClose')}
        className="flex max-h-[min(90vh,48rem)] w-[min(96vw,64rem)] max-w-[min(96vw,64rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,64rem)] md:flex-row"
      >
        <DialogTitle className="sr-only">{assetName}</DialogTitle>
        <DialogDescription className="sr-only">
          {t('sourceRecipeDescription')}
        </DialogDescription>

        {/* 左：固定大图 + prev/next + 计数 */}
        <div className="relative flex min-h-64 items-center justify-center bg-muted/60 md:min-h-0 md:min-w-0 md:flex-1">
          {recipe ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={proxyCivitaiImageUrl(recipe.imageUrl)}
              alt={assetName}
              className="max-h-[min(90vh,48rem)] w-full object-contain"
            />
          ) : null}
          {hasMultiple ? (
            <>
              <button
                type="button"
                onClick={goPrev}
                aria-label={t('sourceRecipePrev')}
                className="absolute left-3 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white backdrop-blur-md transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              >
                <ChevronLeft className="size-5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={goNext}
                aria-label={t('sourceRecipeNext')}
                className="absolute right-3 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white backdrop-blur-md transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              >
                <ChevronRight className="size-5" aria-hidden />
              </button>
              <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2.5 py-0.5 text-xs font-medium text-white backdrop-blur-md">
                {index + 1} / {total}
              </span>
            </>
          ) : null}
        </div>

        {/* 右：独立滚动的结构化配方（桌面固定 22rem 宽、独立滚动） */}
        <div className="flex min-h-0 flex-col overflow-y-auto border-t border-border/60 md:w-88 md:shrink-0 md:border-l md:border-t-0">
          {recipe ? (
            <div className="space-y-4 p-4">
              <div className="space-y-1">
                <RecipeSourceBadge source={recipe.source} />
                <h3 className="font-display text-base font-semibold leading-tight text-foreground">
                  {assetName}
                </h3>
              </div>

              <RecipeField
                label={t('sourceRecipePromptLabel')}
                onCopy={() =>
                  void handleCopy(recipe.prompt, 'sourceRecipePromptCopied')
                }
                copyLabel={t('sourceRecipeCopy')}
              >
                <p className="whitespace-pre-wrap break-words font-mono text-2xs leading-relaxed text-foreground">
                  {recipe.prompt}
                </p>
              </RecipeField>

              {recipe.negativePrompt ? (
                <RecipeField
                  label={t('sourceRecipeNegativeLabel')}
                  onCopy={() =>
                    void handleCopy(
                      recipe.negativePrompt ?? '',
                      'sourceRecipeNegativeCopied',
                    )
                  }
                  copyLabel={t('sourceRecipeCopy')}
                >
                  <p className="whitespace-pre-wrap break-words font-mono text-2xs leading-relaxed text-muted-foreground">
                    {recipe.negativePrompt}
                  </p>
                </RecipeField>
              ) : null}

              <div className="space-y-1.5">
                <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('sourceRecipeModelSection')}
                </p>
                <dl className="space-y-1 text-xs">
                  <RecipeRow
                    label={t('sourceRecipeBaseModel')}
                    value={baseModelFamily}
                  />
                  {recipe.checkpoint ? (
                    <RecipeRow
                      label={t('sourceRecipeCheckpoint')}
                      value={recipe.checkpoint}
                    />
                  ) : null}
                </dl>
              </div>

              <div className="space-y-1.5">
                <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('sourceRecipeParamsSection')}
                </p>
                <dl className="space-y-1 text-xs">
                  {size ? (
                    <RecipeRow label={t('sourceRecipeSize')} value={size} />
                  ) : null}
                  {recipe.sampler ? (
                    <RecipeRow
                      label={t('sourceRecipeSampler')}
                      value={recipe.sampler}
                    />
                  ) : null}
                  {recipe.scheduler ? (
                    <RecipeRow
                      label={t('sourceRecipeScheduler')}
                      value={recipe.scheduler}
                    />
                  ) : null}
                  {recipe.steps !== undefined ? (
                    <RecipeRow
                      label={t('sourceRecipeSteps')}
                      value={String(recipe.steps)}
                    />
                  ) : null}
                  {recipe.cfgScale !== undefined ? (
                    <RecipeRow
                      label={t('sourceRecipeCfg')}
                      value={String(recipe.cfgScale)}
                    />
                  ) : null}
                  {recipe.seed !== undefined ? (
                    <RecipeRow
                      label={t('sourceRecipeSeed')}
                      value={String(recipe.seed)}
                    />
                  ) : null}
                </dl>
              </div>

              {tags && tags.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('sourceRecipeTags')}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.slice(0, 8).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-muted px-2 py-0.5 text-2xs text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* R3 close-review（owner 2026-07-20「明示不匹配/不支持」）：做同款
                  的还原边界——底模引用会尽量还原，但 runner 不支持 hires 等，
                  效果可能与源图有差。仅 generate variant 显示。 */}
              {variant === 'generate' && onApplyRecipe ? (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-2xs leading-relaxed text-amber-700 dark:text-amber-300">
                  {t('sourceRecipeRemakeHint')}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="transition-transform active:scale-[0.97]"
                  onClick={() =>
                    void handleCopy(
                      buildRecipeClipboardText(recipe),
                      'sourceRecipeCopied',
                    )
                  }
                >
                  <Copy className="size-3.5" aria-hidden />
                  {t('sourceRecipeCopyRecipe')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  asChild
                  className="transition-transform active:scale-[0.97]"
                >
                  <a href={sourceUrl} target="_blank" rel="noreferrer">
                    <ArrowUpRight className="size-3.5" aria-hidden />
                    {t('communityOpenSource')}
                  </a>
                </Button>
                {variant === 'generate' && onApplyRecipe ? (
                  <>
                    {/* G3b-seed：仅当配方带 seed 时给「用原图 seed」勾选——
                        锁原图 seed 可精确复刻同一张，默认关=只还原风格。 */}
                    {recipe.seed !== undefined ? (
                      <label className="flex cursor-pointer items-center gap-1.5 text-2xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={includeSeed}
                          onChange={(event) =>
                            setIncludeSeed(event.target.checked)
                          }
                          className="size-3 accent-primary"
                        />
                        {t('sourceRecipeUseSeed')}
                      </label>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      className="transition-transform active:scale-[0.97]"
                      onClick={() => {
                        onApplyRecipe(recipe, includeSeed)
                        onOpenChange(false)
                      }}
                    >
                      <Wand2 className="size-3.5" aria-hidden />
                      {t('sourceRecipeRemake')}
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function RecipeSourceBadge({
  source,
}: {
  source: CivitaiImageRecipe['source']
}) {
  const t = useTranslations('LoraWorkbench')
  if (source === 'ai_inferred') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-2xs font-medium text-amber-700 dark:text-amber-300">
        <Wand2 className="size-2.5" aria-hidden />
        {t('sourceRecipeInferredBadge')}
      </span>
    )
  }
  if (source === 'community_image') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-1.5 py-0.5 text-2xs font-medium text-sky-700 dark:text-sky-300">
        <Users className="size-2.5" aria-hidden />
        {t('sourceRecipeCommunityBadge')}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-2xs font-medium text-emerald-700 dark:text-emerald-300">
      <Sparkles className="size-2.5" aria-hidden />
      {t('sourceRecipeModelBadge')}
    </span>
  )
}

function RecipeField({
  label,
  copyLabel,
  onCopy,
  children,
}: {
  label: string
  copyLabel: string
  onCopy: () => void
  children: ReactNode
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1 text-2xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Copy className="size-3" aria-hidden />
          {copyLabel}
        </button>
      </div>
      {children}
    </div>
  )
}

function RecipeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={cn('min-w-0 break-words text-right text-foreground')}>
        {value}
      </dd>
    </div>
  )
}
