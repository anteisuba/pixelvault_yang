'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Transition,
} from 'motion/react'
import { useFormatter, useTranslations } from 'next-intl'

import {
  ArrowUpRight,
  Check,
  ChevronLeft,
  Copy,
  Heart,
  MoreHorizontal,
  Plus,
} from '@/components/icons'
import {
  LORA_CARD_SOURCE_IMAGE_WIDTH,
  isCivitaiLoraCommerciallyUsable,
  type LoraNsfwFilter,
} from '@/constants/lora'
import { DURATION, EASE_STANDARD } from '@/constants/motion'
import {
  LoraRecipeViewer,
  type LoraRecipeViewerOrigin,
} from '@/components/business/studio/lora/LoraRecipeViewer'
import { useLoraStage } from '@/components/business/studio/lora/lora-stage-context'
import { useActiveLoraStack } from '@/hooks/use-active-lora-stack'
import { useCivitaiModelDetail } from '@/hooks/prompts/use-civitai-model-description'
import { useCivitaiMinedPrompts } from '@/hooks/prompts/use-civitai-mined-prompts'
import {
  civitaiDisplayImageUrl,
  proxyCivitaiImageUrl,
} from '@/lib/civitai-image-url'
import { formatCompactNumber } from '@/lib/format-compact-number'
import { extraLoraKey } from '@/lib/lora-recipe-extra-mount'
import { isLoraBaseModelMountCompatible } from '@/lib/lora-model-compatibility'
import { cn } from '@/lib/utils'
import type { CivitaiImageRecipe, CivitaiLoraLibraryItem } from '@/types'

/** 复制成功后那颗键写「已复制」多久（动效表：1.2 秒）。 */
const COPIED_MS = 1200

interface LoraLibraryDetailPageProps {
  /** 列表里点开的那一项（一个版本）。 */
  item: CivitaiLoraLibraryItem
  isMounted: (item: CivitaiLoraLibraryItem) => boolean
  mountingId: string | null
  onMount: (item: CivitaiLoraLibraryItem) => void
  isFavorited: (loraUrl: string) => boolean
  onToggleFavorite: (item: CivitaiLoraLibraryItem) => void
  /** 各版本封面按这一档分级限定（与列表同一档）。 */
  nsfwFilter: LoraNsfwFilter
  onClose: () => void
}

interface Sample {
  readonly url: string
  /** 这张带不带可复用的配方（没配方的只看图）。 */
  readonly hasRecipe: boolean
  readonly ratio: number | null
}

/**
 * 库 B 的详情页（lora-library.md §4）：从下面升上来盖住库（竖条留着），整页往下滚；
 * ‹ 或 Esc 回到库里原来滚到的位置（列表从没动过）。
 *
 * ⭐ 左边样例当主角（三列瀑布），右边 300 窄栏补齐判断信息；⛔ 底部通栏黑条。
 * ⭐ 版本来自同一次模型请求（`useCivitaiModelDetail`），切到哪个版本、挂的就是哪个。
 * ⚠ 复制成功只在那颗键上写「已复制」1.2 秒，⛔ toast。
 */
export function LoraLibraryDetailPage({
  item,
  isMounted,
  mountingId,
  onMount,
  isFavorited,
  onToggleFavorite,
  nsfwFilter,
  onClose,
}: LoraLibraryDetailPageProps) {
  const t = useTranslations('LoraWorkbench')
  const tb = useTranslations('LoraWorkbench.browse')
  const format = useFormatter()
  const reducedMotion = useReducedMotion()
  const stage = useLoraStage()
  const stack = useActiveLoraStack()
  const detail = useCivitaiModelDetail(item.modelId, nsfwFilter)
  const versions = detail.versions.length > 0 ? detail.versions : [item]
  const [versionId, setVersionId] = useState(item.id)
  const current =
    versions.find((version) => version.id === versionId) ??
    (versionId === item.id ? item : versions[0])
  const mined = useCivitaiMinedPrompts(current)
  const mounted = isMounted(current)
  const favorited = isFavorited(current.loraUrl)

  const pageRef = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [viewer, setViewer] = useState<{
    open: boolean
    index: number
    origin: LoraRecipeViewerOrigin
  }>({ open: false, index: 0, origin: { x: 0, y: 0 } })

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
    }
  }, [])

  // Esc：大图 / 菜单开着时它们自己收，这里只在最外层时关整页。
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== 'Escape') return
      if (viewer.open) return
      if (menuOpen) {
        setMenuOpen(false)
        return
      }
      event.preventDefault()
      onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menuOpen, onClose, viewer.open])

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      return
    }
    setCopied(key)
    if (copiedTimer.current) clearTimeout(copiedTimer.current)
    copiedTimer.current = setTimeout(() => setCopied(null), COPIED_MS)
  }

  // 样例：带配方的逐图配方优先；没配方的是作者示例图，只看图。
  const samples = useMemo<readonly Sample[]>(() => {
    if (mined.recipes.length > 0) {
      return mined.recipes.map((recipe) => ({
        url: recipe.imageUrl,
        hasRecipe: true,
        ratio:
          recipe.width && recipe.height ? recipe.width / recipe.height : null,
      }))
    }
    const previews =
      mined.previewImages.length > 0
        ? mined.previewImages.map((image) => image.imageUrl)
        : current.previewImageUrls
    return previews.map((url) => ({ url, hasRecipe: false, ratio: null }))
  }, [current.previewImageUrls, mined.previewImages, mined.recipes])
  // 查看器吃的是「配方」：没配方的样例补成只有图的一条（右栏写「这张没有公开配方」）。
  const viewerRecipes = useMemo<readonly CivitaiImageRecipe[]>(
    () =>
      mined.recipes.length > 0
        ? mined.recipes
        : samples.map((sample) => ({
            imageUrl: sample.url,
            source: 'model_version_image' as const,
            prompt: '',
          })),
    [mined.recipes, samples],
  )
  const recipeCount = mined.recipes.length

  // 查看器「这张还叠了」：挂载栈里已经有的（按 hash / 版本号认）写「已挂载」。
  const mountedExtraKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const recipe of mined.recipes) {
      for (const extra of recipe.extraLoras ?? []) {
        const hit = stack.items.some(
          (entry) =>
            (extra.hash &&
              entry.asset.fileHashAutoV3?.toLowerCase() ===
                extra.hash.toLowerCase()) ||
            (extra.modelVersionId !== undefined &&
              entry.asset.modelVersionId === extra.modelVersionId),
        )
        if (hit) keys.add(extraLoraKey(extra))
      }
    }
    return keys
  }, [mined.recipes, stack.items])

  const baseLabel = stage.baseLabel
  const compatible = stage.base
    ? isLoraBaseModelMountCompatible(current.baseModelFamily, stage.base.family)
    : null
  // 这一版装不上时，同一个模型里能装上的那一版（有就给「换到那一版 ›」）。
  const compatibleVersion =
    compatible === false && stage.base
      ? versions.find(
          (version) =>
            version.id !== current.id &&
            isLoraBaseModelMountCompatible(
              version.baseModelFamily,
              stage.base?.family ?? '',
            ),
        )
      : undefined
  const triggers = [current.triggerWord, ...current.triggerAlternates].filter(
    (word, index, all) => word.trim() && all.indexOf(word) === index,
  )
  const commercial = isCivitaiLoraCommerciallyUsable(current.allowCommercialUse)
  const publishedAt = current.createdAt ? new Date(current.createdAt) : null
  const fileSize =
    typeof current.fileSizeBytes === 'number'
      ? format.number(current.fileSizeBytes / (1024 * 1024), {
          maximumFractionDigits: 0,
        })
      : null

  const openViewer = (index: number, trigger: HTMLElement) => {
    const page = pageRef.current
    const rect = trigger.getBoundingClientRect()
    const box = page?.getBoundingClientRect()
    setViewer({
      open: true,
      index,
      origin: box
        ? {
            x: rect.left + rect.width / 2 - box.left,
            y: rect.top + rect.height / 2 - box.top,
          }
        : { x: 0, y: 0 },
    })
  }

  const enter: Transition = reducedMotion
    ? { duration: DURATION.fast, ease: 'linear' }
    : { duration: DURATION.slow, ease: EASE_STANDARD }
  const leave: Transition = reducedMotion
    ? { duration: DURATION.fast, ease: 'linear' }
    : { duration: DURATION.base, ease: EASE_STANDARD }

  const ghost =
    'inline-flex h-8.5 items-center gap-1.5 rounded-full border border-border px-3.5 text-2sm text-foreground transition-colors duration-fast ease-linear hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
  const blockTitle = 'text-xs font-semibold text-muted-foreground'
  const menuItem =
    'flex h-8.5 items-center gap-2 rounded-lg px-2.5 text-left text-2sm text-foreground transition-colors duration-fast ease-linear hover:bg-muted focus-visible:bg-muted focus-visible:outline-none'

  return (
    <motion.div
      ref={pageRef}
      role="region"
      aria-label={current.name}
      data-testid="lora-library-detail"
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 32 }}
      animate={{ opacity: 1, y: 0, transition: enter }}
      exit={
        reducedMotion
          ? { opacity: 0, transition: leave }
          : { opacity: 0, y: 32, transition: leave }
      }
      className="absolute inset-0 z-20 flex flex-col bg-card"
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-border/70 py-3 pl-3 pr-5">
        <button
          type="button"
          autoFocus
          onClick={onClose}
          aria-label={tb('back')}
          className="grid size-8.5 shrink-0 place-items-center rounded-full text-foreground/75 transition-colors duration-fast ease-linear hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="truncate text-lg font-semibold leading-5.5 text-foreground">
            {current.name}
          </h2>
          <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-foreground/80">
              {current.baseModelFamily}
            </span>
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-foreground/80">
              {t('librarySourceCivitai')}
            </span>
            <span className="truncate font-mono">
              {[
                `↓ ${formatCompactNumber(current.downloadCount)}`,
                `♥ ${formatCompactNumber(current.thumbsUpCount)}`,
                publishedAt
                  ? tb('updatedOn', {
                      date: format.dateTime(publishedAt, {
                        month: 'short',
                        day: 'numeric',
                      }),
                    })
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
        </div>
        <div className="relative ml-auto flex shrink-0 items-center gap-2">
          {mounted ? (
            <span
              aria-disabled="true"
              className={cn(ghost, 'cursor-default bg-muted text-foreground')}
            >
              <Check className="size-3.5" aria-hidden />
              {tb('mounted')}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onMount(current)}
              aria-busy={mountingId === current.id || undefined}
              className={cn(
                'inline-flex h-8.5 items-center gap-1.5 rounded-full bg-foreground px-4 text-2sm font-semibold text-background transition-opacity duration-fast ease-linear hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                mountingId === current.id && 'opacity-70',
              )}
            >
              <Plus className="size-3.5" aria-hidden />
              {tb('mount')}
            </button>
          )}
          <button
            type="button"
            aria-pressed={favorited}
            onClick={() => onToggleFavorite(current)}
            className={cn(ghost, favorited && 'border-transparent bg-muted')}
          >
            <Heart
              className={cn('size-3.5', favorited && 'fill-current')}
              aria-hidden
            />
            {favorited ? t('favorited') : t('favorite')}
          </button>
          <a
            href={current.modelPageUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={tb('openSource')}
            title={tb('openSource')}
            className="grid size-8.5 place-items-center rounded-full border border-border text-foreground/75 transition-colors duration-fast ease-linear hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowUpRight className="size-3.5" aria-hidden />
          </a>
          <button
            type="button"
            aria-label={tb('more')}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="grid size-8.5 place-items-center rounded-full border border-border text-foreground/75 transition-colors duration-fast ease-linear hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </button>
          <AnimatePresence>
            {menuOpen ? (
              <motion.div
                role="menu"
                initial={
                  reducedMotion
                    ? { opacity: 0 }
                    : { opacity: 0, scale: 0.72, filter: 'blur(4px)' }
                }
                animate={{
                  opacity: 1,
                  scale: 1,
                  filter: 'blur(0px)',
                  transition: reducedMotion
                    ? { duration: DURATION.fast }
                    : { duration: DURATION.base, ease: EASE_STANDARD },
                }}
                exit={
                  reducedMotion
                    ? { opacity: 0, transition: { duration: DURATION.fast } }
                    : {
                        opacity: 0,
                        scale: 0.72,
                        filter: 'blur(4px)',
                        transition: { duration: DURATION.fast, ease: 'linear' },
                      }
                }
                style={{ transformOrigin: 'calc(100% - 17px) 0' }}
                className="absolute right-0 top-11 z-30 flex w-47 flex-col rounded-xl bg-popover p-1.5 shadow-overlay ring-1 ring-border/70"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void copy('styleCode', current.styleCode)}
                  className={menuItem}
                >
                  <Copy
                    className="size-3.5 text-muted-foreground"
                    aria-hidden
                  />
                  {copied === 'styleCode' ? tb('copied') : tb('copyStyleCode')}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void copy('downloadLink', current.loraUrl)}
                  className={menuItem}
                >
                  <Copy
                    className="size-3.5 text-muted-foreground"
                    aria-hidden
                  />
                  {copied === 'downloadLink'
                    ? tb('copied')
                    : tb('copyDownloadLink')}
                </button>
                {favorited ? (
                  <>
                    <hr className="mx-1.5 my-1 border-0 border-t border-border" />
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false)
                        onToggleFavorite(current)
                      }}
                      className="flex h-8.5 items-center rounded-lg px-2.5 text-left text-2sm text-status-risk transition-colors duration-fast ease-linear hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    >
                      {t('unfavorite')}
                    </button>
                  </>
                ) : null}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </header>

      {/* 整页往下滚：样例与右栏一起走；切版本时两边先淡出再淡入这一版的。 */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4.5">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={current.id}
            initial={{ opacity: 0 }}
            animate={{
              opacity: 1,
              transition: { duration: DURATION.base, ease: 'linear' },
            }}
            exit={{
              opacity: 0,
              transition: { duration: DURATION.fast, ease: 'linear' },
            }}
            className="flex gap-6 pb-5"
          >
            <div className="min-w-0 flex-1">
              {mined.isLoading && samples.length === 0 ? (
                <div className="columns-3 gap-3" aria-hidden>
                  {[3 / 4, 2 / 3, 1, 4 / 5, 2 / 3, 3 / 4].map(
                    (ratio, index) => (
                      <span
                        key={index}
                        style={{ aspectRatio: ratio }}
                        className="mb-3 block w-full break-inside-avoid rounded-xl bg-muted"
                      />
                    ),
                  )}
                </div>
              ) : samples.length === 0 ? (
                <p className="py-10 text-center text-2sm text-muted-foreground">
                  {tb('samplesEmpty')}
                </p>
              ) : (
                <div className="columns-3 gap-3">
                  {samples.map((sample, index) => (
                    <button
                      key={sample.url}
                      type="button"
                      onClick={(event) =>
                        openViewer(index, event.currentTarget)
                      }
                      aria-label={t('viewer.imageAlt', {
                        name: current.name,
                        n: index + 1,
                      })}
                      style={
                        sample.ratio ? { aspectRatio: sample.ratio } : undefined
                      }
                      className="group/sample relative mb-3 block w-full cursor-zoom-in break-inside-avoid overflow-hidden rounded-xl bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={civitaiDisplayImageUrl(
                          sample.url,
                          LORA_CARD_SOURCE_IMAGE_WIDTH,
                        )}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="block size-full object-cover"
                      />
                      <span className="absolute bottom-2 left-2 h-5 rounded-md bg-foreground/55 px-1.75 font-mono text-2xs leading-5 text-background opacity-0 transition-opacity duration-fast ease-linear group-hover/sample:opacity-100 group-focus-visible/sample:opacity-100">
                        {sample.hasRecipe
                          ? tb('sampleHasRecipe')
                          : tb('sampleNoRecipe')}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <aside
              aria-label={tb('sideLabel')}
              className="flex w-75 shrink-0 flex-col gap-4.5"
            >
              <section className="flex flex-col gap-2">
                <h5 className={blockTitle}>{tb('versions')}</h5>
                <div className="flex flex-col gap-0.5">
                  {versions.map((version) => {
                    const fits = stage.base
                      ? isLoraBaseModelMountCompatible(
                          version.baseModelFamily,
                          stage.base.family,
                        )
                      : null
                    const size =
                      typeof version.fileSizeBytes === 'number'
                        ? `${format.number(
                            version.fileSizeBytes / (1024 * 1024),
                            { maximumFractionDigits: 0 },
                          )} MB`
                        : null
                    return (
                      <button
                        key={version.id}
                        type="button"
                        aria-pressed={version.id === current.id}
                        onClick={() => setVersionId(version.id)}
                        className={cn(
                          'flex h-9 items-center gap-2 rounded-lg px-2.5 text-left text-2sm transition-colors duration-fast ease-linear focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          version.id === current.id
                            ? 'bg-muted'
                            : 'hover:bg-muted/50',
                        )}
                      >
                        {fits !== null ? (
                          <span
                            aria-hidden
                            className={cn(
                              'size-1.75 shrink-0 rounded-full',
                              fits
                                ? 'bg-status-applied/60'
                                : 'bg-status-warning',
                            )}
                          />
                        ) : null}
                        <b className="min-w-0 truncate font-semibold text-foreground">
                          {version.versionName}
                        </b>
                        <span className="shrink-0 text-muted-foreground">
                          {version.baseModelFamily}
                        </span>
                        {size ? (
                          <small className="ml-auto shrink-0 font-mono text-2xs text-muted-foreground">
                            {size}
                          </small>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
                {compatible !== null && baseLabel ? (
                  <p
                    className={cn(
                      'flex items-start gap-2 text-2sm leading-4.5',
                      compatible ? 'text-foreground' : 'text-status-warning',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'mt-1.5 size-1.75 shrink-0 rounded-full',
                        compatible
                          ? 'bg-status-applied/60'
                          : 'bg-status-warning',
                      )}
                    />
                    <span>
                      {compatible
                        ? tb('compatOk', { base: baseLabel })
                        : tb('compatWarn', {
                            family: current.baseModelFamily,
                            base: baseLabel,
                          })}{' '}
                      {compatibleVersion ? (
                        <button
                          type="button"
                          onClick={() => setVersionId(compatibleVersion.id)}
                          className="whitespace-nowrap font-semibold hover:underline"
                        >
                          {tb('switchVersion', {
                            version: `${compatibleVersion.versionName} · ${compatibleVersion.baseModelFamily}`,
                          })}
                        </button>
                      ) : null}
                    </span>
                  </p>
                ) : null}
              </section>

              <section className="flex flex-col gap-2">
                <h5 className={blockTitle}>{tb('triggers')}</h5>
                {triggers.length > 0 ? (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {triggers.map((word) => (
                        <button
                          key={word}
                          type="button"
                          onClick={() => void copy(`trigger:${word}`, word)}
                          className="inline-flex h-7 max-w-full cursor-copy items-center gap-1.5 rounded-full bg-muted px-2.5 font-mono text-xs text-foreground transition-colors duration-fast ease-linear hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="truncate">
                            {copied === `trigger:${word}` ? tb('copied') : word}
                          </span>
                          <Copy
                            className="size-3 shrink-0 text-muted-foreground"
                            aria-hidden
                          />
                        </button>
                      ))}
                    </div>
                    {triggers.length > 1 ? (
                      <button
                        type="button"
                        onClick={() =>
                          void copy('triggers', triggers.join(', '))
                        }
                        className="self-start text-xs text-muted-foreground transition-colors duration-fast ease-linear hover:text-foreground"
                      >
                        {copied === 'triggers' ? tb('copied') : tb('copyAll')}
                      </button>
                    ) : null}
                  </>
                ) : (
                  <p className="text-2sm text-muted-foreground">
                    {tb('noTrigger')}
                  </p>
                )}
              </section>

              <section className="flex flex-col gap-2">
                <h5 className={blockTitle}>{tb('ratingLicense')}</h5>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-foreground/80">
                    {current.isNsfw ? tb('ratingMature') : tb('ratingSafe')}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-foreground/80">
                    {commercial
                      ? t('licenseCommercial')
                      : t('licensePersonalUse')}
                  </span>
                  {current.allowNoCredit === false ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-foreground/80">
                      {t('licenseAttributionRequired')}
                    </span>
                  ) : null}
                </div>
              </section>

              {current.creatorName ? (
                <section className="flex flex-col gap-2">
                  <h5 className={blockTitle}>{tb('author')}</h5>
                  <div className="flex items-center gap-2.5 text-2sm">
                    {current.creatorAvatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={proxyCivitaiImageUrl(current.creatorAvatarUrl)}
                        alt=""
                        className="size-7 shrink-0 rounded-full bg-muted object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="size-7 shrink-0 rounded-full bg-muted"
                      />
                    )}
                    <b className="min-w-0 truncate font-semibold text-foreground">
                      {current.creatorName}
                    </b>
                    <a
                      href={`https://civitai.com/user/${encodeURIComponent(current.creatorName)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto shrink-0 text-xs text-muted-foreground transition-colors duration-fast ease-linear hover:text-foreground"
                    >
                      {tb('authorHome')}
                    </a>
                  </div>
                </section>
              ) : null}

              {detail.descriptionText ? (
                <section className="flex flex-col gap-2">
                  <h5 className={blockTitle}>{tb('about')}</h5>
                  <p
                    className={cn(
                      'whitespace-pre-wrap break-words text-2sm leading-5 text-foreground/85',
                      !aboutOpen && 'line-clamp-4',
                    )}
                  >
                    {detail.descriptionText}
                  </p>
                  <button
                    type="button"
                    aria-expanded={aboutOpen}
                    onClick={() => setAboutOpen((open) => !open)}
                    className="self-start text-xs text-muted-foreground transition-colors duration-fast ease-linear hover:text-foreground"
                  >
                    {aboutOpen ? tb('collapse') : tb('expandAll')}
                  </button>
                </section>
              ) : null}

              <dl className="flex flex-col gap-1.5 text-xs">
                {fileSize ? (
                  <div className="flex gap-2.5">
                    <dt className="w-16 shrink-0 text-muted-foreground">
                      {tb('statFile')}
                    </dt>
                    <dd className="font-mono text-foreground">
                      {tb('statFileValue', { size: fileSize })}
                    </dd>
                  </div>
                ) : null}
                {publishedAt ? (
                  <div className="flex gap-2.5">
                    <dt className="w-16 shrink-0 text-muted-foreground">
                      {tb('statPublished')}
                    </dt>
                    <dd className="font-mono text-foreground">
                      {format.dateTime(publishedAt, { dateStyle: 'medium' })}
                    </dd>
                  </div>
                ) : null}
                {samples.length > 0 ? (
                  <div className="flex gap-2.5">
                    <dt className="w-16 shrink-0 text-muted-foreground">
                      {tb('statSamples')}
                    </dt>
                    <dd className="font-mono text-foreground">
                      {recipeCount > 0
                        ? tb('samplesWithRecipe', { count: samples.length })
                        : tb('samplesCount', { count: samples.length })}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </aside>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 样例大图：与生成台同一个查看器；库里没有「做同款」。 */}
      <LoraRecipeViewer
        open={viewer.open}
        origin={viewer.origin}
        recipes={viewerRecipes}
        index={Math.min(viewer.index, Math.max(0, viewerRecipes.length - 1))}
        onIndexChange={(index) =>
          setViewer((previous) => ({ ...previous, index }))
        }
        onClose={() => setViewer((previous) => ({ ...previous, open: false }))}
        assetName={current.name}
        sourceUrl={current.modelPageUrl}
        mountedExtraKeys={mountedExtraKeys}
      />
    </motion.div>
  )
}
