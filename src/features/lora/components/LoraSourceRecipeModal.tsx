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
  X,
} from '@/components/icons'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  CIVITAI_MODEL_SEARCH_URL,
  LORA_DETAIL_IMAGE_WIDTH,
} from '@/constants/lora'
import { civitaiDisplayImageUrl } from '@/features/lora/lib/civitai-image-url'
import { toCivitaiModelSearchQuery } from '@/lib/civitai-lora-reference'
import {
  extraLoraKey,
  extraLoraLabel,
  isRecipeExtraResolvable,
} from '@/features/lora/lib/lora-recipe-extra-mount'
import { COPIED_ACK_MS } from '@/constants/motion'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  FeedbackButton,
  useButtonFeedback,
  type ButtonFeedback,
} from '@/components/ui/feedback-button'
import type { CivitaiImageRecipe, CivitaiRecipeExtraLora } from '@/types'

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
  /**
   * `extraLoras` = 用户在下面「额外挂载」区块里**勾中**的那些（默认全选）。
   * 做同款只补挂这批，不再无条件用 recipe.extraLoras 全量。
   */
  onApplyRecipe?: (
    recipe: CivitaiImageRecipe,
    includeSeed: boolean,
    extraLoras: readonly CivitaiRecipeExtraLora[],
  ) => void
}

export function formatSize(recipe: CivitaiImageRecipe): string | null {
  if (recipe.sizeRaw) return recipe.sizeRaw
  if (recipe.width && recipe.height) return `${recipe.width} × ${recipe.height}`
  return null
}

/** 「复制配方」的纯文本装配：只拼真实存在的字段（查看器与本弹窗共用）。 */
export function buildRecipeClipboardText(recipe: CivitaiImageRecipe): string {
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
  if (recipe.extraLoras && recipe.extraLoras.length > 0) {
    const extras = recipe.extraLoras
      .map((extra) => {
        const label = extraLoraLabel(extra)
        return extra.weight !== undefined ? `${label}:${extra.weight}` : label
      })
      .join(', ')
    lines.push(`Extra LoRAs: ${extras}`)
  }
  return lines.join('\n')
}

function hasStrongLocator(extra: CivitaiRecipeExtraLora): boolean {
  return extra.hash !== undefined || extra.modelVersionId !== undefined
}

/** 「一个也没取消」的稳定空集——每次 render 新建会让下游 memo 白失效。 */
const EMPTY_KEYS: ReadonlySet<string> = new Set()

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
  // 复制的结果写在按下的那颗键上（ui-defaults §7.1）：几颗复制键共用一份结果，
  // `copyTarget` 记住是哪一颗。
  const { feedback: copyFeedback, show: showCopied } =
    useButtonFeedback(COPIED_ACK_MS)
  const [copyTarget, setCopyTarget] = useState<string | null>(null)
  const copyFeedbackFor = (successKey: string) =>
    copyTarget === successKey ? copyFeedback : null
  // owner 2026-08-07：额外 LoRA 可以逐个取消勾选，做同款只挂勾中的。存「排除集」
  // 而不是「选中集」——默认全挂是既有行为，空集就等于什么都不用初始化；而且
  // prev/next 换图时 extras 整批换掉，选中集会残留上一张的 key。
  //
  // 排除集**连着它属于哪一张图**一起存：只要翻了图就重置回「全挂」——翻走再翻
  // 回来也算，回到哪一张都是干净的，上一张的取消不会跟着走。
  // 这是 React 官方的「render 期按 props 调整 state」写法，不是 useEffect——用
  // effect 重置会级联渲染，react-hooks/set-state-in-effect 也会拦下来。
  const [excluded, setExcluded] = useState<{
    index: number
    keys: ReadonlySet<string>
  }>(() => ({ index, keys: EMPTY_KEYS }))
  if (excluded.index !== index) {
    setExcluded({ index, keys: EMPTY_KEYS })
  }
  const excludedExtraKeys =
    excluded.index === index ? excluded.keys : EMPTY_KEYS
  const toggleExtra = useCallback(
    (key: string) => {
      setExcluded((prev) => {
        const base = prev.index === index ? prev.keys : EMPTY_KEYS
        const keys = new Set(base)
        if (keys.has(key)) keys.delete(key)
        else keys.add(key)
        return { index, keys }
      })
    },
    [index],
  )

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
  // S6（CD 配方-modal）：还原摘要卡的关键参数一行——只拼真实存在的字段。
  const restoreParamsLine = recipe
    ? [
        recipe.steps !== undefined ? `Steps ${recipe.steps}` : null,
        recipe.cfgScale !== undefined ? `CFG ${recipe.cfgScale}` : null,
        recipe.sampler ?? null,
      ]
        .filter(Boolean)
        .join(' · ') || null
    : null
  // 该图叠加的其它 LoRA——做同款前必须可见（Library 详情与 Generate 共用）。
  const extraLoras = recipe?.extraLoras ?? []
  const hasExtraLoras = extraLoras.length > 0
  // 做同款实际会补挂的那批 = 勾中的。摘要行按它计数，全不勾时整行不出——
  // 不做「还将尝试挂载 0 个」这种假承诺。
  const selectedExtraLoras = extraLoras.filter(
    (extra) => !excludedExtraKeys.has(extraLoraKey(extra)),
  )
  const hasNameOnlyExtras = extraLoras.some(
    (extra) => isRecipeExtraResolvable(extra) && !hasStrongLocator(extra),
  )

  const handleCopy = useCallback(
    async (text: string, successKey: string) => {
      try {
        await navigator.clipboard.writeText(text)
        setCopyTarget(successKey)
        showCopied({ label: t(successKey) })
      } catch {
        toast.error(t('tryPromptCopyFailed'))
      }
    },
    [showCopied, t],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t('sourceRecipeClose')}
        className="lora-recipe-modal inset-x-0 top-auto bottom-0 left-0 flex translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-t-3xl rounded-b-none border-0 bg-bubble p-0 dark:bg-background md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:flex-row md:rounded-2xl md:bg-card"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">{assetName}</DialogTitle>
        <DialogDescription className="sr-only">
          {t('sourceRecipeDescription')}
        </DialogDescription>

        {/* 手机顶栏：独立 48px 磨砂条，左标题 + 计数、右圆形 ×，彻底杜绝浮层按钮互压。 */}
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/50 bg-card/95 px-3.5 backdrop-blur-md md:hidden">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {recipe ? <RecipeSourceBadge source={recipe.source} /> : null}
            <span className="min-w-0 truncate text-sm font-semibold text-foreground">
              {assetName}
            </span>
          </div>
          {hasMultiple ? (
            <span className="shrink-0 font-mono text-2xs tabular-nums text-muted-foreground">
              {index + 1} / {total}
            </span>
          ) : null}
          <DialogClose asChild>
            <button
              type="button"
              aria-label={t('sourceRecipeClose')}
              className="touch-target grid size-8 shrink-0 place-items-center rounded-full bg-muted text-foreground/80 transition-colors duration-fast active:bg-fill-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" aria-hidden />
            </button>
          </DialogClose>
        </div>

        {/* 桌面右上角 ×：用 cn 合并保证 hidden 不被 buttonVariants 的 inline-flex 压掉。 */}
        <DialogClose asChild>
          <button
            type="button"
            className={cn(
              buttonVariants({ variant: 'secondary', size: 'icon-sm' }),
              'absolute top-3 right-3 z-10 hidden md:inline-flex',
            )}
          >
            <X className="size-4" aria-hidden />
            <span className="sr-only">{t('sourceRecipeClose')}</span>
          </button>
        </DialogClose>

        {/* 左/上：来源图展示舞台。手机固定适中高度，避免横图上下大片留白；桌面交给 flex 撑满。 */}
        <div className="relative flex h-64 min-h-0 shrink-0 items-center justify-center overflow-hidden bg-foreground/5 dark:bg-black/35 md:h-auto md:min-w-0 md:flex-1 md:shrink md:bg-muted/60">
          {recipe ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={civitaiDisplayImageUrl(
                recipe.imageUrl,
                LORA_DETAIL_IMAGE_WIDTH,
              )}
              alt={assetName}
              className="max-h-full max-w-full object-contain"
            />
          ) : null}
          {hasMultiple ? (
            <>
              <button
                type="button"
                onClick={goPrev}
                aria-label={t('sourceRecipePrev')}
                className="touch-target absolute left-2.5 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white backdrop-blur-md transition-colors hover:tint-hover focus-visible:outline-none focus-visible:shadow-focus md:left-3"
              >
                <ChevronLeft className="size-5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={goNext}
                aria-label={t('sourceRecipeNext')}
                className="touch-target absolute right-2.5 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white backdrop-blur-md transition-colors hover:tint-hover focus-visible:outline-none focus-visible:shadow-focus md:right-3"
              >
                <ChevronRight className="size-5" aria-hidden />
              </button>
              <span className="absolute bottom-2.5 left-1/2 hidden -translate-x-1/2 rounded-full bg-black/55 px-2.5 py-0.5 font-mono text-2xs tabular-nums text-white backdrop-blur-md md:inline-block">
                {index + 1} / {total}
              </span>
            </>
          ) : null}
        </div>

        {/* 右/下：结构化配方（手机暖石底 + 纯白分组白卡，桌面固定 22rem 宽白栏）。 */}
        <div className="flex min-h-0 flex-1 flex-col md:w-88 md:flex-none md:shrink-0 md:border-l md:border-border/60 md:bg-card">
          {recipe ? (
            <>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 md:space-y-4 md:p-4">
                <div className="hidden space-y-1 md:block">
                  <RecipeSourceBadge source={recipe.source} />
                  <h3 className="text-md font-semibold leading-tight text-foreground">
                    {assetName}
                  </h3>
                </div>

                {/* S6（CD）：前置「做同款将还原到装配台」摘要卡——手机为 Apple 纯白圆角分组卡。 */}
                {variant === 'generate' && onApplyRecipe ? (
                  <div className="space-y-2 rounded-2xl bg-card p-3.5 shadow-ring md:space-y-1.5 md:rounded-lg md:border md:border-border/60 md:bg-muted/25 md:p-2.5 md:shadow-none">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground md:text-2xs md:font-medium">
                      <Wand2 className="size-3.5 md:size-3" aria-hidden />
                      {t('sourceRecipeRestoreTitle')}
                    </p>
                    <dl className="divide-y divide-border/50 text-xs md:divide-y-0 md:space-y-1 md:text-2xs">
                      <div className="flex items-baseline justify-between gap-3 py-1.5 first:pt-0 last:pb-0 md:justify-start md:gap-2 md:py-0">
                        <dt className="shrink-0 text-muted-foreground md:w-12">
                          LoRA
                        </dt>
                        <dd className="min-w-0 truncate text-right font-medium text-foreground md:flex-1 md:text-left md:font-normal">
                          {assetName}
                          {recipe.loraWeight !== undefined
                            ? ` · ${recipe.loraWeight}`
                            : null}
                        </dd>
                      </div>
                      {selectedExtraLoras.length > 0 ? (
                        <div className="flex items-baseline justify-between gap-3 py-1.5 last:pb-0 md:justify-start md:gap-2 md:py-0">
                          <dt className="shrink-0 text-muted-foreground md:w-12">
                            {t('sourceRecipeExtraLorasLabel')}
                          </dt>
                          <dd className="min-w-0 text-right text-foreground md:flex-1 md:text-left">
                            {t('sourceRecipeExtraLorasSummary', {
                              count: selectedExtraLoras.length,
                            })}
                          </dd>
                        </div>
                      ) : null}
                      <div className="flex items-baseline justify-between gap-3 py-1.5 last:pb-0 md:justify-start md:gap-2 md:py-0">
                        <dt className="shrink-0 text-muted-foreground md:w-12">
                          {t('sourceRecipeBaseModel')}
                        </dt>
                        <dd className="min-w-0 truncate text-right font-mono text-foreground md:flex-1 md:text-left">
                          {recipe.checkpoint ?? baseModelFamily}
                        </dd>
                      </div>
                      {restoreParamsLine ? (
                        <div className="flex items-baseline justify-between gap-3 py-1.5 last:pb-0 md:justify-start md:gap-2 md:py-0">
                          <dt className="shrink-0 text-muted-foreground md:w-12">
                            {t('sourceRecipeParamsSection')}
                          </dt>
                          <dd className="min-w-0 text-right font-mono text-foreground md:flex-1 md:text-left">
                            {restoreParamsLine}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  </div>
                ) : null}

                <div className="space-y-3 rounded-2xl bg-card p-3.5 shadow-ring md:space-y-4 md:rounded-none md:bg-transparent md:p-0 md:shadow-none">
                  <RecipeField
                    label={t('sourceRecipePromptLabel')}
                    onCopy={() =>
                      void handleCopy(recipe.prompt, 'sourceRecipePromptCopied')
                    }
                    copyFeedback={copyFeedbackFor('sourceRecipePromptCopied')}
                    copyLabel={t('sourceRecipeCopy')}
                  >
                    <p className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground md:text-2xs">
                      {recipe.prompt}
                    </p>
                  </RecipeField>

                  {recipe.negativePrompt ? (
                    <div className="border-t border-border/50 pt-3 md:border-t-0 md:pt-0">
                      <RecipeField
                        label={t('sourceRecipeNegativeLabel')}
                        onCopy={() =>
                          void handleCopy(
                            recipe.negativePrompt ?? '',
                            'sourceRecipeNegativeCopied',
                          )
                        }
                        copyFeedback={copyFeedbackFor(
                          'sourceRecipeNegativeCopied',
                        )}
                        copyLabel={t('sourceRecipeCopy')}
                      >
                        <p className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-muted-foreground md:text-2xs">
                          {recipe.negativePrompt}
                        </p>
                      </RecipeField>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-3 rounded-2xl bg-card p-3.5 shadow-ring md:space-y-4 md:rounded-none md:bg-transparent md:p-0 md:shadow-none">
                  <div className="space-y-1.5">
                    <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground md:font-normal">
                      {t('sourceRecipeModelSection')}
                    </p>
                    <dl className="divide-y divide-border/50 text-xs md:divide-y-0 md:space-y-1 md:text-2xs">
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

                  <div className="space-y-1.5 border-t border-border/50 pt-3 md:border-t-0 md:pt-0">
                    <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground md:font-normal">
                      {t('sourceRecipeParamsSection')}
                    </p>
                    <dl className="divide-y divide-border/50 text-xs md:divide-y-0 md:space-y-1 md:text-2xs">
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
                </div>

                {/* 额外挂载 LoRA：手机用圆角白卡承载。 */}
                {hasExtraLoras ? (
                  <div className="space-y-2 rounded-2xl bg-card p-3.5 shadow-ring md:space-y-1.5 md:rounded-none md:bg-transparent md:p-0 md:shadow-none">
                    <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground md:font-normal">
                      {t('sourceRecipeExtraLorasSection', {
                        count: extraLoras.length,
                      })}
                    </p>
                    <ul className="space-y-1.5">
                      {extraLoras.map((extra) => {
                        const label = extraLoraLabel(extra)
                        const strong = hasStrongLocator(extra)
                        const key = extraLoraKey(extra)
                        const included = !excludedExtraKeys.has(key)
                        return (
                          <li
                            key={key}
                            className="rounded-xl bg-muted/60 px-3 py-2 md:rounded-md md:border md:border-border/50 md:bg-muted/20 md:px-2.5 md:py-1.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2">
                                <input
                                  type="checkbox"
                                  checked={included}
                                  onChange={() => toggleExtra(key)}
                                  aria-label={t(
                                    'sourceRecipeExtraLoraInclude',
                                    { name: label },
                                  )}
                                  className="mt-0.5 size-3.5 shrink-0 accent-primary md:size-3"
                                />
                                <span
                                  className={cn(
                                    'min-w-0 break-all font-mono text-xs leading-snug md:text-2xs',
                                    included
                                      ? 'text-foreground'
                                      : 'text-muted-foreground line-through',
                                  )}
                                >
                                  {label}
                                </span>
                              </label>
                              {extra.weight !== undefined ? (
                                <span className="shrink-0 font-mono text-2xs tabular-nums text-muted-foreground">
                                  {extra.weight}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-5.5 text-2xs text-muted-foreground">
                              <span>
                                {strong
                                  ? t('sourceRecipeExtraLoraLocateStrong')
                                  : t('sourceRecipeExtraLoraLocateNameOnly')}
                              </span>
                              {!strong && isRecipeExtraResolvable(extra) ? (
                                <a
                                  href={`${CIVITAI_MODEL_SEARCH_URL}?query=${encodeURIComponent(
                                    toCivitaiModelSearchQuery(label),
                                  )}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline underline-offset-2 hover:text-foreground"
                                >
                                  {t('sourceRecipeExtraLoraSearchLink')}
                                </a>
                              ) : null}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                    {hasNameOnlyExtras ? (
                      <p className="text-2xs leading-relaxed text-muted-foreground">
                        {t('sourceRecipeExtraLoraNameOnlyHint')}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {tags && tags.length > 0 ? (
                  <div className="space-y-1.5 rounded-2xl bg-card p-3.5 shadow-ring md:rounded-none md:bg-transparent md:p-0 md:shadow-none">
                    <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground md:font-normal">
                      {t('sourceRecipeTags')}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {tags.slice(0, 8).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-muted px-2.5 py-0.5 text-2xs text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {variant === 'generate' && onApplyRecipe ? (
                  <p className="rounded-xl bg-status-warning-surface px-3 py-2 text-2xs leading-relaxed text-status-warning md:rounded-lg md:border md:border-status-warning/40 md:px-2.5">
                    {t('sourceRecipeRemakeHint')}
                  </p>
                ) : null}

                {/* 次级动作留在滚动区（做同款已提到固定底栏）。 */}
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <FeedbackButton
                    feedback={copyFeedbackFor('sourceRecipeCopied')}
                    className={cn(
                      buttonVariants({ variant: 'secondary', size: 'sm' }),
                      'rounded-full border-0 bg-card shadow-ring active:scale-97 md:border md:border-border md:bg-secondary md:shadow-none',
                    )}
                    onClick={() =>
                      void handleCopy(
                        buildRecipeClipboardText(recipe),
                        'sourceRecipeCopied',
                      )
                    }
                  >
                    <Copy className="size-3.5" aria-hidden />
                    {t('sourceRecipeCopyRecipe')}
                  </FeedbackButton>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    asChild
                    className="rounded-full transition-transform active:scale-97"
                  >
                    <a href={sourceUrl} target="_blank" rel="noreferrer">
                      <ArrowUpRight className="size-3.5" aria-hidden />
                      {t('communityOpenSource')}
                    </a>
                  </Button>
                </div>
              </div>
              {/* S6（CD 配方-modal）：磨砂常驻底栏——手机端主动作撑宽 + 胶囊式 seed 勾选。 */}
              {variant === 'generate' && onApplyRecipe ? (
                <div className="shrink-0 space-y-1.5 border-t border-border/50 bg-card/95 px-4 pt-3 pb-safe-bottom backdrop-blur-md md:bg-card md:py-3">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="h-10 flex-1 rounded-full font-semibold transition-transform active:scale-98 md:h-8 md:flex-none"
                      onClick={() => {
                        onApplyRecipe(recipe, includeSeed, selectedExtraLoras)
                        onOpenChange(false)
                      }}
                    >
                      <Wand2 className="size-3.5" aria-hidden />
                      {t('sourceRecipeRemake')}
                    </Button>
                    {recipe.seed !== undefined ? (
                      <label className="touch-target-y inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-muted px-3 text-xs text-foreground transition-colors active:bg-fill-strong md:h-auto md:bg-transparent md:px-0 md:text-2xs md:text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={includeSeed}
                          onChange={(event) =>
                            setIncludeSeed(event.target.checked)
                          }
                          className="size-3.5 accent-primary md:size-3"
                        />
                        {t('sourceRecipeUseSeed')}
                      </label>
                    ) : null}
                  </div>
                  <p className="text-2xs leading-relaxed text-muted-foreground/85">
                    {t('sourceRecipeApplyHint')}
                  </p>
                </div>
              ) : null}
            </>
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
      <span className="inline-flex items-center gap-1 rounded-full bg-status-warning-surface px-1.5 py-0.5 text-2xs text-status-warning">
        <Wand2 className="size-2.5" aria-hidden />
        {t('sourceRecipeInferredBadge')}
      </span>
    )
  }
  if (source === 'community_image') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground">
        <Users className="size-2.5" aria-hidden />
        {t('sourceRecipeCommunityBadge')}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-status-applied-surface px-1.5 py-0.5 text-2xs text-status-applied">
      <Sparkles className="size-2.5" aria-hidden />
      {t('sourceRecipeModelBadge')}
    </span>
  )
}

function RecipeField({
  label,
  copyLabel,
  onCopy,
  copyFeedback,
  children,
}: {
  label: string
  copyLabel: string
  onCopy: () => void
  /** 复制好了写在这颗键上（ui-defaults §7.1）。 */
  copyFeedback: ButtonFeedback | null
  children: ReactNode
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-2xs uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <FeedbackButton
          feedback={copyFeedback}
          onClick={onCopy}
          className="inline-flex items-center gap-1 rounded-full text-2xs text-muted-foreground hover:text-foreground"
        >
          <Copy className="size-3" aria-hidden />
          {copyLabel}
        </FeedbackButton>
      </div>
      {children}
    </div>
  )
}

function RecipeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 first:pt-0 last:pb-0 md:py-0">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={cn('min-w-0 break-words text-right text-foreground')}>
        {value}
      </dd>
    </div>
  )
}
