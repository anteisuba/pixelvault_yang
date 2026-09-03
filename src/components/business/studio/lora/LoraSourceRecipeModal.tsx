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
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { CIVITAI_MODEL_SEARCH_URL } from '@/constants/lora'
import { proxyCivitaiImageUrl } from '@/lib/civitai-image-url'
import { toCivitaiModelSearchQuery } from '@/lib/civitai-lora-reference'
import {
  extraLoraKey,
  extraLoraLabel,
  isRecipeExtraResolvable,
} from '@/lib/lora-recipe-extra-mount'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
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
        // 窄宽自己出「返回」胶囊，所以关掉默认的 ×——一个断点只留一个关闭键。
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">{assetName}</DialogTitle>
        {/* 关闭键与封面/结果预览对齐（owner 2026-08-07）：窄宽是「‹ 返回」胶囊
            （那时弹窗几乎占满屏，读起来像一个页面，需要返回语义），桌面回到右上
            角的 ×。两者互斥显示。 */}
        <DialogClose asChild>
          <button
            type="button"
            className="absolute right-3 top-3 z-10 inline-flex h-10 items-center gap-1.5 rounded-full border border-white/15 bg-black/70 px-3 text-sm font-medium text-white shadow-lg backdrop-blur-md transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black sm:hidden"
            aria-label={t('coverPreviewBack')}
          >
            <ChevronLeft className="size-4" aria-hidden />
            <span>{t('coverPreviewBack')}</span>
          </button>
        </DialogClose>
        <DialogClose asChild>
          <button
            type="button"
            className="absolute right-4 top-4 z-10 hidden rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2 sm:inline-flex"
          >
            <X className="size-4" aria-hidden />
            <span className="sr-only">{t('sourceRecipeClose')}</span>
          </button>
        </DialogClose>
        <DialogDescription className="sr-only">
          {t('sourceRecipeDescription')}
        </DialogDescription>

        {/* 左：固定大图 + prev/next + 计数。
            ⚠ 高度必须是**确定值**，不能只靠 flex 分配。竖版来源图（Civitai 常见
            2:3，甚至 1920×3840 的竖向拼版）会把自己撑得比弹窗还高，被
            overflow-hidden 裁掉头尾（owner 2026-08-07 实拍）。
            下面那张图用 `max-h-full` 兜底，而 `max-height:100%` **要求父级高度
            确定**：
            - 桌面 `md:flex-row`：格子高度由交叉轴 stretch 给出，是确定的 ✅
            - 窄宽 `flex-col`：容器高度是 `max-h-…` 撑出来的 auto，百分比解析不
              出来 → `max-h-full` 形同虚设，图片又恢复自然高度被裁 ❌
            所以窄宽这一档写死 `h-[45vh]`（弹窗自身封顶 90vh，一半给图、一半给
            配方），桌面再交还给 flex。 */}
        <div className="relative flex h-[45vh] min-h-0 shrink-0 items-center justify-center overflow-hidden bg-muted/60 md:h-auto md:min-w-0 md:flex-1 md:shrink">
          {recipe ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={proxyCivitaiImageUrl(recipe.imageUrl)}
              alt={assetName}
              // ⚠ 不能用 `w-full` + 视口级 max-h：`w-full` 强制盒子铺满宽度，竖图
              // 的盒子高度就 = 宽度 × 高宽比，远超弹窗；而那个 max-h 又和整个弹窗
              // 一样大，等于没约束。改成贴着**父格**的 max-h/max-w，object-contain
              // 才真的能把整张图装进去。
              className="max-h-full max-w-full object-contain"
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

        {/* 右：结构化配方（桌面固定 22rem 宽）——内容独立滚动 + 做同款固定底栏
            （S6 CD 配方-modal：主动作不随内容滚走）。 */}
        <div className="flex min-h-0 flex-col border-t border-border/60 md:w-88 md:shrink-0 md:border-l md:border-t-0">
          {recipe ? (
            <>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                <div className="space-y-1">
                  <RecipeSourceBadge source={recipe.source} />
                  <h3 className="text-base font-semibold leading-tight text-foreground">
                    {assetName}
                  </h3>
                </div>

                {/* S6（CD）：前置「做同款将还原到装配台」摘要卡——先让用户看清会
                  被还原什么（LoRA / 底模 / 关键参数），再往下读完整 prompt。
                  仅 generate variant（library variant 不承担做同款）。 */}
                {variant === 'generate' && onApplyRecipe ? (
                  <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/25 p-2.5">
                    <p className="flex items-center gap-1.5 text-2xs font-medium text-foreground">
                      <Wand2 className="size-3" aria-hidden />
                      {t('sourceRecipeRestoreTitle')}
                    </p>
                    <dl className="space-y-1 text-2xs">
                      <div className="flex gap-2">
                        <dt className="w-12 shrink-0 text-muted-foreground">
                          LoRA
                        </dt>
                        <dd className="min-w-0 flex-1 truncate text-foreground">
                          {assetName}
                          {recipe.loraWeight !== undefined
                            ? ` · ${recipe.loraWeight}`
                            : null}
                        </dd>
                      </div>
                      {selectedExtraLoras.length > 0 ? (
                        <div className="flex gap-2">
                          <dt className="w-12 shrink-0 text-muted-foreground">
                            {t('sourceRecipeExtraLorasLabel')}
                          </dt>
                          <dd className="min-w-0 flex-1 text-foreground">
                            {t('sourceRecipeExtraLorasSummary', {
                              count: selectedExtraLoras.length,
                            })}
                          </dd>
                        </div>
                      ) : null}
                      <div className="flex gap-2">
                        <dt className="w-12 shrink-0 text-muted-foreground">
                          {t('sourceRecipeBaseModel')}
                        </dt>
                        <dd className="min-w-0 flex-1 truncate font-mono text-foreground">
                          {recipe.checkpoint ?? baseModelFamily}
                        </dd>
                      </div>
                      {restoreParamsLine ? (
                        <div className="flex gap-2">
                          <dt className="w-12 shrink-0 text-muted-foreground">
                            {t('sourceRecipeParamsSection')}
                          </dt>
                          <dd className="min-w-0 flex-1 font-mono text-foreground">
                            {restoreParamsLine}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  </div>
                ) : null}

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

                {/* 详情页核心：点「做同款」前先看清这张图叠了哪些额外 LoRA。
                    Library / Generate 共用 modal，两边都展示（不限做同款）。 */}
                {hasExtraLoras ? (
                  <div className="space-y-1.5">
                    <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
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
                            className="rounded-md border border-border/50 bg-muted/20 px-2.5 py-1.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              {/* 勾选=做同款时一并补挂（默认全选）。整块名字可点，
                                  命中区比 12px 的方框大得多。 */}
                              <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-1.5">
                                <input
                                  type="checkbox"
                                  checked={included}
                                  onChange={() => toggleExtra(key)}
                                  aria-label={t(
                                    'sourceRecipeExtraLoraInclude',
                                    { name: label },
                                  )}
                                  className="mt-0.5 size-3 shrink-0 accent-primary"
                                />
                                <span
                                  className={cn(
                                    'min-w-0 break-all font-mono text-2xs leading-snug',
                                    included
                                      ? 'text-foreground'
                                      : 'text-muted-foreground line-through',
                                  )}
                                >
                                  {label}
                                </span>
                              </label>
                              {extra.weight !== undefined ? (
                                <span className="shrink-0 font-mono text-2xs text-muted-foreground">
                                  {extra.weight}
                                </span>
                              ) : null}
                            </div>
                            {/* pl 对齐上一行的名字（跳过 12px 方框 + 6px 间距），
                                否则定位提示会顶到勾选框正下方，读起来像另一列。 */}
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-[1.125rem] text-2xs text-muted-foreground">
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

                {/* 次级动作留在滚动区（做同款已提到固定底栏）。 */}
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
                </div>
              </div>
              {/* S6（CD 配方-modal）：做同款固定底栏——主动作常驻可达，不随长
                prompt 滚走；附「只应用不直接生成」说明。 */}
              {variant === 'generate' && onApplyRecipe ? (
                <div className="shrink-0 space-y-1.5 border-t border-border/60 bg-card px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="transition-transform active:scale-[0.97]"
                      onClick={() => {
                        onApplyRecipe(recipe, includeSeed, selectedExtraLoras)
                        onOpenChange(false)
                      }}
                    >
                      <Wand2 className="size-3.5" aria-hidden />
                      {t('sourceRecipeRemake')}
                    </Button>
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
                  </div>
                  <p className="text-2xs leading-relaxed text-muted-foreground">
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
