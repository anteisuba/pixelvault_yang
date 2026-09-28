'use client'

import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Wand2,
  X,
} from '@/components/icons'
import {
  LORA_CHIP_THUMBNAIL_WIDTH,
  LORA_DETAIL_IMAGE_WIDTH,
} from '@/constants/lora'
import { DURATION, EASE_STANDARD } from '@/constants/motion'
import {
  buildRecipeClipboardText,
  formatSize,
} from '@/components/business/studio/lora/LoraSourceRecipeModal'
import { civitaiDisplayImageUrl } from '@/lib/civitai-image-url'
import { extraLoraKey, extraLoraLabel } from '@/lib/lora-recipe-extra-mount'
import { cn } from '@/lib/utils'
import type { CivitaiImageRecipe, CivitaiRecipeExtraLora } from '@/types'

/** 查看器从哪一点长出来 / 缩回去（相对查看器所在容器的 px）。 */
export interface LoraRecipeViewerOrigin {
  readonly x: number
  readonly y: number
}

interface LoraRecipeViewerProps {
  open: boolean
  origin: LoraRecipeViewerOrigin
  recipes: readonly CivitaiImageRecipe[]
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
  /** 这组配方属于哪个 LoRA（查看器标题的读屏名）。 */
  assetName: string
  /** 来源模型页（「打开来源」）。 */
  sourceUrl: string
  /** 已经在挂载栈里的额外 LoRA（`extraLoraKey`）—— 那一行写「已挂载」。 */
  mountedExtraKeys: ReadonlySet<string>
  /**
   * 生成台才有「做同款」：只把配方写回装配台与输入（勾中的额外 LoRA 一起挂），
   * ⛔ 不出图。库里不给，只有复制配方。
   */
  onApplyRecipe?: (
    recipe: CivitaiImageRecipe,
    includeSeed: boolean,
    extraLoras: readonly CivitaiRecipeExtraLora[],
  ) => void
}

const EMPTY_KEYS: ReadonlySet<string> = new Set()

/**
 * 样例查看器（lora-generate.md §5 · 库 B 画板「样例大图」）：点来源图那一张，
 * 查看器**从那一张长出来**铺满舞台右侧；左边大图 + 底部一排缩略，右边 340 宽
 * 「这张的配方」。关上缩回当前那一张。
 *
 * ⚠ 它住在舞台里、不是全屏弹窗：装配列与输入框照常可用（做同款要写回它们），
 *   所以 ⛔ 不锁焦点、⛔ 不画遮罩；Esc 关、←/→ 翻页。
 * ⚠ 额外 LoRA 的取消勾选**跟着那一张图**：翻页就回到「全挂」（与旧弹窗同一条）。
 */
export function LoraRecipeViewer({
  open,
  origin,
  recipes,
  index,
  onIndexChange,
  onClose,
  assetName,
  sourceUrl,
  mountedExtraKeys,
  onApplyRecipe,
}: LoraRecipeViewerProps) {
  const t = useTranslations('LoraWorkbench')
  const reducedMotion = useReducedMotion()
  const recipe = recipes[index] ?? null
  const total = recipes.length
  const [includeSeed, setIncludeSeed] = useState(false)
  const [excluded, setExcluded] = useState<{
    index: number
    keys: ReadonlySet<string>
  }>(() => ({ index, keys: EMPTY_KEYS }))
  if (excluded.index !== index) {
    setExcluded({ index, keys: EMPTY_KEYS })
  }
  const excludedKeys = excluded.index === index ? excluded.keys : EMPTY_KEYS

  const goPrev = useCallback(() => {
    if (total > 1) onIndexChange((index - 1 + total) % total)
  }, [index, onIndexChange, total])
  const goNext = useCallback(() => {
    if (total > 1) onIndexChange((index + 1) % total)
  }, [index, onIndexChange, total])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goPrev()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        goNext()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [goNext, goPrev, onClose, open])

  const copy = async (text: string, successKey: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t(successKey))
    } catch {
      toast.error(t('tryPromptCopyFailed'))
    }
  }

  // 大图的宽 / 高：配方记了宽高就用它，否则等图加载完按原图算，都没有先按 2:3。
  const [loadedRatio, setLoadedRatio] = useState<{
    url: string
    ratio: number
  } | null>(null)
  const imageRatio =
    recipe && loadedRatio?.url === recipe.imageUrl
      ? loadedRatio.ratio
      : recipe?.width && recipe.height
        ? recipe.width / recipe.height
        : 2 / 3

  const extras = recipe?.extraLoras ?? []
  const selectedExtras = extras.filter(
    (extra) => !excludedKeys.has(extraLoraKey(extra)),
  )
  const size = recipe ? formatSize(recipe) : null
  const sampling = recipe
    ? [
        recipe.sampler ?? null,
        recipe.scheduler ?? null,
        recipe.steps !== undefined
          ? t('viewer.steps', { steps: recipe.steps })
          : null,
        recipe.cfgScale !== undefined ? `CFG ${recipe.cfgScale}` : null,
      ]
        .filter((part): part is string => Boolean(part))
        .join(' · ')
    : ''
  const sizeLine = recipe
    ? [
        size,
        recipe.seed !== undefined
          ? t('viewer.seed', { seed: String(recipe.seed) })
          : null,
      ]
        .filter((part): part is string => Boolean(part))
        .join(' · ')
    : ''

  const row = (label: string, value: ReactNode) => (
    <div className="flex gap-3 text-2sm">
      <span className="w-11 shrink-0 pt-0.5 text-muted-foreground">
        {label}
      </span>
      <div className="min-w-0 flex-1">{value}</div>
    </div>
  )
  const codeBlock = (text: string, copyKey: string) => (
    <div className="group/code relative rounded-lg bg-muted/60 px-2.5 py-2 ring-1 ring-inset ring-border/60">
      <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-foreground">
        {text}
      </p>
      <button
        type="button"
        onClick={() => void copy(text, copyKey)}
        aria-label={t('sourceRecipeCopy')}
        title={t('sourceRecipeCopy')}
        className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-md bg-card text-muted-foreground opacity-0 shadow-sm transition-opacity duration-fast hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/code:opacity-100 coarse:opacity-100"
      >
        <Copy className="size-3.5" aria-hidden />
      </button>
    </div>
  )

  return (
    <AnimatePresence>
      {open && recipe ? (
        <motion.div
          key="lora-recipe-viewer"
          role="dialog"
          aria-label={t('viewer.label', { name: assetName })}
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.3 }}
          animate={{
            opacity: 1,
            scale: 1,
            transition: reducedMotion
              ? { duration: DURATION.fast }
              : { duration: DURATION.slow, ease: EASE_STANDARD },
          }}
          exit={
            reducedMotion
              ? { opacity: 0, transition: { duration: DURATION.fast } }
              : {
                  opacity: 0,
                  scale: 0.3,
                  transition: { duration: 0.24, ease: EASE_STANDARD },
                }
          }
          style={{ transformOrigin: `${origin.x}px ${origin.y}px` }}
          data-testid="lora-recipe-viewer"
          className="absolute inset-0 z-20 flex bg-card"
        >
          <div className="relative flex min-w-0 flex-1 flex-col bg-surface-workbench">
            {/* 大图按左边剩下的地方等比放到最大（与结果区同一套 `studio-fit-*`）：
                比例取配方记下的宽高，没记就等图加载完按原图算。 */}
            <div className="flex min-h-0 flex-1 flex-col px-17.5 pb-2 pt-5.5">
              <div className="studio-fit-area flex min-h-0 flex-1 items-center justify-center">
                <div
                  style={
                    {
                      '--studio-fit-ratio': imageRatio,
                    } as CSSProperties
                  }
                  className="studio-fit-box overflow-hidden rounded-lg bg-muted shadow-overlay"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    key={recipe.imageUrl}
                    src={civitaiDisplayImageUrl(
                      recipe.imageUrl,
                      LORA_DETAIL_IMAGE_WIDTH,
                    )}
                    alt={t('viewer.imageAlt', {
                      name: assetName,
                      n: index + 1,
                    })}
                    onLoad={(event) => {
                      const { naturalWidth, naturalHeight } =
                        event.currentTarget
                      if (naturalWidth > 0 && naturalHeight > 0) {
                        setLoadedRatio({
                          url: recipe.imageUrl,
                          ratio: naturalWidth / naturalHeight,
                        })
                      }
                    }}
                    className="size-full animate-in object-cover fade-in-0 duration-base motion-reduce:animate-none"
                  />
                </div>
              </div>
            </div>
            {total > 1 ? (
              <>
                <button
                  type="button"
                  onClick={goPrev}
                  aria-label={t('sourceRecipePrev')}
                  className="absolute left-4 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-card text-foreground/75 shadow-float transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronLeft className="size-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  aria-label={t('sourceRecipeNext')}
                  className="absolute right-4 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-card text-foreground/75 shadow-float transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronRight className="size-4" aria-hidden />
                </button>
                <div className="flex shrink-0 justify-center gap-1.5 overflow-x-auto px-4 pb-3.5 pt-2.5">
                  {recipes.map((item, i) => (
                    <button
                      key={item.imageUrl}
                      type="button"
                      aria-label={t('viewer.imageAlt', {
                        name: assetName,
                        n: i + 1,
                      })}
                      aria-current={i === index ? 'true' : undefined}
                      onClick={() => onIndexChange(i)}
                      className={cn(
                        'h-11.5 w-8.5 shrink-0 overflow-hidden rounded-md bg-muted transition-[opacity,box-shadow] duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        i === index
                          ? 'opacity-100 ring-2 ring-foreground ring-offset-2 ring-offset-surface-workbench'
                          : 'opacity-55 hover:opacity-80',
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={civitaiDisplayImageUrl(
                          item.imageUrl,
                          LORA_CHIP_THUMBNAIL_WIDTH,
                        )}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>

          <aside className="flex w-85 shrink-0 flex-col gap-3.5 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <b className="text-2sm font-semibold text-foreground">
                {t('viewer.title')}
              </b>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {index + 1} / {total}
              </span>
              <button
                type="button"
                autoFocus
                onClick={onClose}
                aria-label={t('sourceRecipeClose')}
                className="ml-auto grid size-7.5 place-items-center rounded-full bg-muted text-foreground/75 transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>

            {/* 作者示例图没带生成参数时只看图：右栏一句话，⛔ 画一排空格子。 */}
            {recipe.prompt ? (
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
                {row(
                  t('viewer.prompt'),
                  codeBlock(recipe.prompt, 'sourceRecipePromptCopied'),
                )}
                {recipe.negativePrompt
                  ? row(
                      t('viewer.negative'),
                      codeBlock(
                        recipe.negativePrompt,
                        'sourceRecipeNegativeCopied',
                      ),
                    )
                  : null}
                {recipe.checkpoint
                  ? row(
                      t('viewer.base'),
                      <span className="break-all font-mono text-xs text-foreground">
                        {recipe.checkpoint}
                      </span>,
                    )
                  : null}
                {sampling
                  ? row(
                      t('viewer.sampling'),
                      <span className="font-mono text-xs text-foreground">
                        {sampling}
                      </span>,
                    )
                  : null}
                {sizeLine
                  ? row(
                      t('viewer.size'),
                      <span className="font-mono text-xs tabular-nums text-foreground">
                        {sizeLine}
                      </span>,
                    )
                  : null}

                {extras.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    <h5 className="text-xs font-semibold text-foreground/80">
                      {t('viewer.extras')}
                    </h5>
                    {extras.map((extra) => {
                      const key = extraLoraKey(extra)
                      const label = extraLoraLabel(extra)
                      const mounted = mountedExtraKeys.has(key)
                      const included = !excludedKeys.has(key)
                      return (
                        <div
                          key={key}
                          className="flex items-center gap-2 rounded-xl bg-muted/60 px-2.5 py-2 text-2sm"
                        >
                          <b
                            className={cn(
                              'min-w-0 flex-1 truncate font-semibold',
                              !mounted && onApplyRecipe && !included
                                ? 'text-muted-foreground line-through'
                                : 'text-foreground',
                            )}
                            title={label}
                          >
                            {label}
                          </b>
                          {extra.weight !== undefined ? (
                            <small className="shrink-0 font-mono text-2xs tabular-nums text-muted-foreground">
                              {extra.weight}
                            </small>
                          ) : null}
                          {mounted ? (
                            <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs text-muted-foreground">
                              <Check className="size-3" aria-hidden />
                              {t('viewer.mounted')}
                            </span>
                          ) : onApplyRecipe ? (
                            <button
                              type="button"
                              aria-pressed={included}
                              aria-label={t('sourceRecipeExtraLoraInclude', {
                                name: label,
                              })}
                              onClick={() =>
                                setExcluded((previous) => {
                                  const base =
                                    previous.index === index
                                      ? previous.keys
                                      : EMPTY_KEYS
                                  const keys = new Set(base)
                                  if (keys.has(key)) keys.delete(key)
                                  else keys.add(key)
                                  return { index, keys }
                                })
                              }
                              className={cn(
                                'inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                included
                                  ? 'border-foreground/15 bg-card text-foreground'
                                  : 'border-dashed border-border text-muted-foreground',
                              )}
                            >
                              {included ? (
                                <Check className="size-3" aria-hidden />
                              ) : null}
                              {included
                                ? t('viewer.mountTogether')
                                : t('viewer.skipMount')}
                            </button>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="min-h-0 flex-1 text-2sm leading-5 text-muted-foreground">
                {t('viewer.noRecipe')}
              </p>
            )}

            {onApplyRecipe && recipe.prompt ? (
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  title={t('sourceRecipeApplyHint')}
                  onClick={() => {
                    onApplyRecipe(recipe, includeSeed, selectedExtras)
                    onClose()
                  }}
                  className="inline-flex h-8.5 items-center gap-1.5 rounded-full bg-primary px-3.5 text-2sm font-semibold text-primary-foreground transition-[background-color,transform] duration-fast hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[.98]"
                >
                  <Wand2 className="size-3.5" aria-hidden />
                  {t('sourceRecipeRemake')}
                </button>
                {recipe.seed !== undefined ? (
                  <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={includeSeed}
                      onChange={(event) => setIncludeSeed(event.target.checked)}
                      className="size-3.5 accent-primary"
                    />
                    {t('sourceRecipeUseSeed')}
                  </label>
                ) : null}
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              {recipe.prompt ? (
                <button
                  type="button"
                  onClick={() =>
                    void copy(
                      buildRecipeClipboardText(recipe),
                      'sourceRecipeCopied',
                    )
                  }
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-xs text-foreground transition-colors duration-fast hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Copy className="size-3.5" aria-hidden />
                  {t('sourceRecipeCopyRecipe')}
                </button>
              ) : null}
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-xs text-foreground transition-colors duration-fast hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ArrowUpRight className="size-3.5" aria-hidden />
                {t('communityOpenSource')}
              </a>
            </div>
          </aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
