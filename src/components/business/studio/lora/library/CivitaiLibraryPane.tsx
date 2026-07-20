'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '@clerk/nextjs'
import { useSearchParams } from 'next/navigation'
import {
  AlertCircle,
  History,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  CIVITAI_LORA_SORT_OPTIONS,
  DEFAULT_LORA_CONTENT_TYPE,
  DEFAULT_LORA_NSFW_FILTER,
  LORA_CONTENT_TYPE_VALUES_BY_SOURCE,
  LORA_LIBRARY_FAMILY_PARAM,
  LORA_LIBRARY_FAMILY_VALUES_BY_SOURCE,
  LORA_LIBRARY_NSFW_PARAM,
  LORA_LIBRARY_SEARCH_PARAM,
  LORA_LIBRARY_SORT_PARAM,
  LORA_LIBRARY_SOURCES,
  LORA_LIBRARY_TYPE_PARAM,
  LORA_NSFW_FILTER_VALUES,
  LORA_TOAST_DURATION_MS,
  LORA_WORKBENCH_SEARCH_PARAM,
  LORA_WORKBENCH_SECTIONS,
  civitaiBaseModelToFamilySlug,
  familySlugToCivitaiBaseModel,
  getLoraContentTypeDefinition,
  isCivitaiBaseModelGeneratable,
  isCivitaiLoraSort,
  isLoraNsfwFilter,
  parseLoraLibraryFamilyParam,
  parseLoraLibraryTypeParam,
  type CivitaiLoraBaseModel,
  type LoraNsfwFilter,
} from '@/constants/lora'
import { ROUTES } from '@/constants/routes'
import { usePathname, useRouter } from '@/i18n/navigation'
import type { CivitaiLoraLibraryItem, LoraAssetRecord } from '@/types'
import { useActiveLoraStack } from '@/hooks/use-active-lora-stack'
import { useCivitaiLoraLibrary } from '@/hooks/use-civitai-lora-library'
import { useCivitaiMinedPrompts } from '@/hooks/prompts/use-civitai-mined-prompts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import {
  clearSearchHistory,
  readSearchHistory,
  recordSearchTerm,
} from '@/lib/civitai-search-history'
import { proxyCivitaiImageUrl } from '@/lib/civitai-image-url'
import { deferEffectTask } from '@/lib/defer-effect-task'
import { cn } from '@/lib/utils'
import { LoraSourceRecipeModal } from '@/components/business/studio/lora/LoraSourceRecipeModal'
import { LoraCoverPreviewDialog } from './LoraCoverPreviewDialog'
import { LoraLibraryDetailReveal } from './LoraLibraryDetailReveal'
import { LoraLibraryFilterCombobox } from './LoraLibraryFilterCombobox'
import { LoraLibraryPagination } from './LoraLibraryPagination'
import { LoraLibraryRow } from './LoraLibraryRow'
import {
  LoraLibraryRowDetail,
  type LoraLibrarySampleImage,
} from './LoraLibraryRowDetail'
import {
  LoraLibraryTypeEmptyState,
  LoraLibraryTypeSparseCard,
} from './LoraLibraryTypeStates'
import {
  LORA_CONTENT_TYPE_LABEL_KEYS,
  LORA_LIBRARY_FAMILY_LABEL_KEYS,
} from './lora-library-filter-labels'

export interface CivitaiCommunityBranchProps {
  onFavorite: (item: CivitaiLoraLibraryItem) => Promise<LoraAssetRecord | null>
  onUnfavoriteByUrl: (loraUrl: string) => Promise<boolean>
  isFavorited: (loraUrl: string) => boolean
}

// R1 顶栏槽是 LoraLibraryTabs 传入的内部实现细节（搜索/控件 portal target），
// 不进 CivitaiCommunityBranchProps——那个类型被 CommunitySourceBranchProps
// extends，混进去会逼外部调用方也要传它。
interface CivitaiCommunityBranchOwnProps extends CivitaiCommunityBranchProps {
  searchSlotNode: HTMLDivElement | null
  controlsSlotNode: HTMLDivElement | null
}

const NSFW_FILTER_LABEL_KEYS: Record<LoraNsfwFilter, string> = {
  unrestricted: 'nsfwFilterUnrestricted',
  nsfwOnly: 'nsfwFilterNsfwOnly',
  safe: 'nsfwFilterSafe',
}

export function CivitaiCommunityBranch({
  onFavorite,
  onUnfavoriteByUrl,
  isFavorited,
  searchSlotNode,
  controlsSlotNode,
}: CivitaiCommunityBranchOwnProps) {
  const t = useTranslations('LoraWorkbench')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const stack = useActiveLoraStack()
  const initialFamilySlug = parseLoraLibraryFamilyParam(
    searchParams.get(LORA_LIBRARY_FAMILY_PARAM),
  )
  const initialSortParam = searchParams.get(LORA_LIBRARY_SORT_PARAM)
  const initialNsfwParam = searchParams.get(LORA_LIBRARY_NSFW_PARAM)
  const initialContentType = parseLoraLibraryTypeParam(
    searchParams.get(LORA_LIBRARY_TYPE_PARAM),
  )
  const library = useCivitaiLoraLibrary({
    initialBaseModel:
      initialFamilySlug === 'all'
        ? undefined
        : familySlugToCivitaiBaseModel(initialFamilySlug),
    initialSort:
      initialSortParam && isCivitaiLoraSort(initialSortParam)
        ? initialSortParam
        : undefined,
    initialSearch:
      searchParams.get(LORA_LIBRARY_SEARCH_PARAM)?.trim() || undefined,
    initialNsfwFilter:
      initialNsfwParam && isLoraNsfwFilter(initialNsfwParam)
        ? initialNsfwParam
        : undefined,
    initialContentType:
      initialContentType === 'all' ? undefined : initialContentType,
  })

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    if (library.baseModel === 'all') {
      params.delete(LORA_LIBRARY_FAMILY_PARAM)
    } else {
      params.set(
        LORA_LIBRARY_FAMILY_PARAM,
        civitaiBaseModelToFamilySlug(library.baseModel),
      )
    }
    if (library.debouncedSearch) {
      params.set(LORA_LIBRARY_SEARCH_PARAM, library.debouncedSearch)
    } else {
      params.delete(LORA_LIBRARY_SEARCH_PARAM)
    }
    if (library.sort === 'Highest Rated') {
      params.delete(LORA_LIBRARY_SORT_PARAM)
    } else {
      params.set(LORA_LIBRARY_SORT_PARAM, library.sort)
    }
    if (library.nsfwFilter === DEFAULT_LORA_NSFW_FILTER) {
      params.delete(LORA_LIBRARY_NSFW_PARAM)
    } else {
      params.set(LORA_LIBRARY_NSFW_PARAM, library.nsfwFilter)
    }
    if (library.contentType === DEFAULT_LORA_CONTENT_TYPE) {
      params.delete(LORA_LIBRARY_TYPE_PARAM)
    } else {
      params.set(LORA_LIBRARY_TYPE_PARAM, library.contentType)
    }
    const query = params.toString()
    const nextUrl = query ? `${pathname}?${query}` : pathname
    const currentQuery = searchParams.toString()
    const currentUrl = currentQuery ? `${pathname}?${currentQuery}` : pathname
    if (nextUrl === currentUrl) return
    router.replace(nextUrl, { scroll: false })
  }, [
    library.baseModel,
    library.sort,
    library.debouncedSearch,
    library.nsfwFilter,
    library.contentType,
    pathname,
    router,
    searchParams,
  ])

  // Phase-2 enrichment: mine the activation prompt / source-image recipes for
  // the currently-selected LoRA — feeds the expanded detail's 样例带.
  const minedPrompts = useCivitaiMinedPrompts(library.selectedItem)
  const [coverPreview, setCoverPreview] = useState<{
    url: string
    name: string
  } | null>(null)
  // R2 共享来源配方 modal：非空 = 打开并定位到该逐图配方下标（走
  // minedPrompts.recipes）；prev/next 更新它，关闭置 null。
  const [recipeModalIndex, setRecipeModalIndex] = useState<number | null>(null)
  const [history, setHistory] = useState<string[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  // R1 库聚焦浏览：详情从按需抽屉改成「原位置展开」——detailOpen 标记选中项
  // 是否在列表里就地展开（LoraLibraryRowDetail）。单展开：只有 selectedItem
  // 的详情渲染，点另一行即切换。
  const [detailOpen, setDetailOpen] = useState(false)
  const searchWrapperRef = useRef<HTMLDivElement>(null)
  const { isLoaded, userId } = useAuth()
  const activeClerkId: string | null = isLoaded ? userId : null

  useEffect(() => {
    return deferEffectTask(() => {
      setHistory(readSearchHistory(activeClerkId))
    })
  }, [activeClerkId])

  useEffect(() => {
    const trimmed = library.search.trim()
    if (trimmed.length < 2) return
    const id = setTimeout(() => {
      setHistory(recordSearchTerm(trimmed, activeClerkId))
    }, 800)
    return () => clearTimeout(id)
  }, [activeClerkId, library.search])

  useEffect(() => {
    if (!historyOpen) return
    const handler = (e: MouseEvent) => {
      if (!searchWrapperRef.current?.contains(e.target as Node)) {
        setHistoryOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [historyOpen])

  const handleUse = useCallback(
    (item: CivitaiLoraLibraryItem) => {
      // External base models: no working inference endpoint / license forbids
      // hosted generation — send to Civitai rather than a guaranteed failure.
      if (!isCivitaiBaseModelGeneratable(item.baseModelFamily)) {
        window.open(item.modelPageUrl, '_blank', 'noopener,noreferrer')
        toast.info(t('externalUseRedirect', { name: item.name }), {
          duration: LORA_TOAST_DURATION_MS,
        })
        return
      }
      stack.push(item)
      toast.success(t('addedToStack', { name: item.name }), {
        duration: LORA_TOAST_DURATION_MS,
      })
      router.push(
        `${ROUTES.STUDIO_LORA}?${LORA_WORKBENCH_SEARCH_PARAM}=${LORA_WORKBENCH_SECTIONS.GENERATE}`,
      )
    },
    [router, stack, t],
  )

  const handleFavoriteToggle = useCallback(
    async (item: CivitaiLoraLibraryItem) => {
      if (isFavorited(item.loraUrl)) {
        await onUnfavoriteByUrl(item.loraUrl)
      } else {
        await onFavorite(item)
      }
    },
    [isFavorited, onFavorite, onUnfavoriteByUrl],
  )

  // 原位展开切换：点已展开的当前项 → 收起；点其它项 → 切换选中并展开。
  const handleToggleItem = useCallback(
    (item: CivitaiLoraLibraryItem) => {
      const isCurrentlyExpanded =
        detailOpen && library.selectedItem?.id === item.id
      if (isCurrentlyExpanded) {
        setDetailOpen(false)
        return
      }
      library.selectItem(item)
      setDetailOpen(true)
    },
    [detailOpen, library],
  )

  const handleSortChange = useCallback(
    (value: string) => {
      if (isCivitaiLoraSort(value)) {
        library.setSort(value)
      }
    },
    [library],
  )

  const handleBaseModelChange = useCallback(
    (value: CivitaiLoraBaseModel) => {
      library.setBaseModel(value)
    },
    [library],
  )

  const handleNsfwToggle = useCallback(() => {
    const currentIndex = LORA_NSFW_FILTER_VALUES.indexOf(library.nsfwFilter)
    const nextValue =
      LORA_NSFW_FILTER_VALUES[
        (currentIndex + 1) % LORA_NSFW_FILTER_VALUES.length
      ]
    library.setNsfwFilter(nextValue)
  }, [library])

  const hasActiveFilters =
    library.baseModel !== 'all' ||
    library.debouncedSearch !== '' ||
    library.nsfwFilter !== DEFAULT_LORA_NSFW_FILTER ||
    library.contentType !== DEFAULT_LORA_CONTENT_TYPE
  const handleClearFilters = useCallback(() => {
    library.setBaseModel('all')
    library.setSearch('')
    library.setNsfwFilter(DEFAULT_LORA_NSFW_FILTER)
    library.setContentType(DEFAULT_LORA_CONTENT_TYPE)
  }, [library])

  const isTypeOnlyFilter =
    library.contentType !== 'all' &&
    library.baseModel === 'all' &&
    library.debouncedSearch === '' &&
    library.nsfwFilter === DEFAULT_LORA_NSFW_FILTER
  const activeTypeSearchFallbackTerm =
    library.contentType !== 'all'
      ? getLoraContentTypeDefinition(library.contentType).searchFallbackTerm
      : null
  const handleTypeSearchFallback = useCallback(() => {
    if (!activeTypeSearchFallbackTerm) return
    library.setSearch(activeTypeSearchFallbackTerm)
    library.setContentType(DEFAULT_LORA_CONTENT_TYPE)
  }, [activeTypeSearchFallbackTerm, library])

  const handleHistoryPick = useCallback(
    (term: string) => {
      library.setSearch(term)
      setHistoryOpen(false)
    },
    [library],
  )

  const handleHistoryClear = useCallback(() => {
    setHistory(clearSearchHistory(activeClerkId))
    setHistoryOpen(false)
  }, [activeClerkId])

  const typeOptions = useMemo(
    () =>
      LORA_CONTENT_TYPE_VALUES_BY_SOURCE[LORA_LIBRARY_SOURCES.CIVITAI].map(
        (value) => ({
          value,
          label: t(LORA_CONTENT_TYPE_LABEL_KEYS[value]),
        }),
      ),
    [t],
  )
  const familyOptions = useMemo(
    () =>
      LORA_LIBRARY_FAMILY_VALUES_BY_SOURCE[LORA_LIBRARY_SOURCES.CIVITAI].map(
        (value) => ({
          value,
          label: t(LORA_LIBRARY_FAMILY_LABEL_KEYS[value]),
        }),
      ),
    [t],
  )

  // 展开详情的样例带：优先逐图配方（带完整 recipe，R2 modal 用），其次纯
  // 预览兜底图，最后 item 自带的 previewImageUrls。
  const sampleImages = useMemo<LoraLibrarySampleImage[]>(() => {
    const label = (idx: number) => t('sampleImageAlt', { n: idx + 1 })
    if (minedPrompts.recipes.length > 0) {
      return minedPrompts.recipes.map((recipe, idx) => ({
        url: recipe.imageUrl,
        label: label(idx),
      }))
    }
    if (minedPrompts.previewImages.length > 0) {
      return minedPrompts.previewImages.map((preview, idx) => ({
        url: preview.imageUrl,
        label: label(idx),
      }))
    }
    return (library.selectedItem?.previewImageUrls ?? []).map((url, idx) => ({
      url,
      label: label(idx),
    }))
  }, [
    minedPrompts.recipes,
    minedPrompts.previewImages,
    library.selectedItem,
    t,
  ])

  const handleSampleClick = useCallback(
    (index: number) => {
      // R2：有逐图配方时，样例点击打开共享来源配方 modal（左大图 + 右侧
      // 参数库，可 prev/next）。无配方（纯预览兜底图）时退回封面大图预览。
      if (minedPrompts.recipes.length > 0) {
        setRecipeModalIndex(index)
        return
      }
      const sample = sampleImages[index]
      if (!sample) return
      setCoverPreview({
        url: proxyCivitaiImageUrl(sample.url),
        name: library.selectedItem?.name ?? '',
      })
    },
    [minedPrompts.recipes, sampleImages, library.selectedItem],
  )

  return (
    <section className="space-y-3">
      {/* 结果区：单列宽幅效果流 + 原位展开详情 + 真实分页。搜索/排序/NSFW/
          刷新已 portal 进 LoraWorkbench 顶栏；类型/底模留在结果区上方（随内层
          crossfade），与确认图一致。 */}
      <div className="flex min-h-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <LoraLibraryFilterCombobox
            label={t('libraryTypeFilter')}
            ariaLabel={t('typeFilterLabel')}
            value={library.contentType}
            options={typeOptions}
            onChange={library.setContentType}
          />
          <LoraLibraryFilterCombobox
            label={t('libraryFamilyFilter')}
            ariaLabel={t('baseModelFilterLabel')}
            value={civitaiBaseModelToFamilySlug(library.baseModel)}
            options={familyOptions}
            onChange={(slug) =>
              handleBaseModelChange(familySlugToCivitaiBaseModel(slug))
            }
            searchable
            searchPlaceholder={t('baseModelSearchPlaceholder')}
            emptyText={t('baseModelSearchEmpty')}
          />
        </div>

        <div
          className={cn(
            'min-h-0 transition-opacity',
            library.isRevalidating && library.items.length > 0
              ? 'opacity-60'
              : 'opacity-100',
          )}
          aria-busy={library.isRevalidating}
        >
          {library.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size="lg" className="text-muted-foreground" />
            </div>
          ) : library.error && library.items.length === 0 ? (
            <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 text-xs text-destructive sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                {t('communityLoadFailed')}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void library.refresh()}
              >
                {t('refresh')}
              </Button>
            </div>
          ) : library.items.length === 0 && isTypeOnlyFilter ? (
            <LoraLibraryTypeEmptyState
              onSearchFallback={handleTypeSearchFallback}
              onClearType={handleClearFilters}
            />
          ) : library.items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center text-xs text-muted-foreground">
              <span>{t('communityEmpty')}</span>
              {hasActiveFilters ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleClearFilters}
                  className="h-8 text-xs"
                >
                  {t('clearFilters')}
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {library.items.map((item, index) => {
                const isExpanded =
                  detailOpen && library.selectedItem?.id === item.id
                return (
                  <LoraLibraryDetailReveal
                    key={item.id}
                    isExpanded={isExpanded}
                    row={
                      <LoraLibraryRow
                        source="civitai"
                        item={item}
                        index={index + 1}
                        isExpanded={false}
                        onToggle={() => handleToggleItem(item)}
                      />
                    }
                    detail={
                      <LoraLibraryRowDetail
                        source="civitai"
                        item={item}
                        isFavorited={isFavorited(item.loraUrl)}
                        onUse={handleUse}
                        onFavorite={handleFavoriteToggle}
                        onCollapse={() => setDetailOpen(false)}
                        sampleImages={sampleImages}
                        onSampleClick={handleSampleClick}
                        onPreviewCover={(target) => {
                          const fullUrl =
                            target.coverImageUrlOriginal ?? target.coverImageUrl
                          if (fullUrl) {
                            setCoverPreview({
                              url: proxyCivitaiImageUrl(fullUrl),
                              name: target.name,
                            })
                          }
                        }}
                      />
                    }
                  />
                )
              })}
              {/* 稀疏态（本页 1–5 条）：列表尾部追加一条引导行。 */}
              {library.contentType !== 'all' &&
              library.items.length <= 5 &&
              activeTypeSearchFallbackTerm ? (
                <LoraLibraryTypeSparseCard
                  source={LORA_LIBRARY_SOURCES.CIVITAI}
                  searchFallbackTerm={activeTypeSearchFallbackTerm}
                  onSearchFallback={handleTypeSearchFallback}
                />
              ) : null}
            </div>
          )}
        </div>

        <LoraLibraryPagination
          page={library.page}
          total={library.total}
          hasNextPage={library.hasNextPage}
          isBusy={library.isRevalidating}
          onPreviousPage={library.previousPage}
          onNextPage={library.nextPage}
        />
      </div>

      {/* 搜索框：portal 进 LoraWorkbench 顶栏的搜索槽（占左侧主位）。历史下拉
          锚定在这个 wrapper 内，随 portal 一起搬家、逻辑不变。 */}
      {searchSlotNode
        ? createPortal(
            <div ref={searchWrapperRef} className="relative w-full min-w-0">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={library.search}
                onChange={(event) => library.setSearch(event.target.value)}
                onFocus={() => setHistoryOpen(true)}
                placeholder={t('communitySearch')}
                className="h-9 pl-9 pr-8 text-xs"
              />
              {library.isRevalidating && library.items.length > 0 ? (
                <Spinner
                  size="sm"
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
              ) : null}
              {historyOpen && history.length > 0 ? (
                <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-lg border border-border bg-popover p-1 text-xs shadow-lg">
                  <div className="flex items-center justify-between px-2 py-1 text-2xs uppercase tracking-wide text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <History className="size-3" aria-hidden />
                      {t('searchHistoryTitle')}
                    </span>
                    <button
                      type="button"
                      onClick={handleHistoryClear}
                      className="text-2xs text-muted-foreground hover:text-foreground"
                    >
                      {t('searchHistoryClear')}
                    </button>
                  </div>
                  <ul className="max-h-48 overflow-y-auto">
                    {history.map((entry) => (
                      <li key={entry}>
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault()
                            handleHistoryPick(entry)
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-muted"
                        >
                          <Search
                            className="size-3 shrink-0 text-muted-foreground"
                            aria-hidden
                          />
                          <span className="truncate">{entry}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>,
            searchSlotNode,
          )
        : null}

      {/* 顶栏右端控件：排序 Select + NSFW 三态 chip + 刷新，portal 进
          LoraWorkbench 顶栏的控件槽。 */}
      {controlsSlotNode
        ? createPortal(
            <>
              <Select value={library.sort} onValueChange={handleSortChange}>
                <SelectTrigger
                  size="sm"
                  className="w-full border-border/60 text-xs sm:w-40"
                  aria-label={t('communitySortFilter')}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CIVITAI_LORA_SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {library.sortFellBackToRelevance ? (
                <span
                  className="inline-flex h-9 shrink-0 items-center whitespace-nowrap text-2xs text-muted-foreground"
                  title={t('sortFallbackHint')}
                >
                  {t('sortFallbackLabel')}
                </span>
              ) : null}
              <button
                type="button"
                onClick={handleNsfwToggle}
                aria-label={`${t('nsfwToggleHint')}：${t(
                  NSFW_FILTER_LABEL_KEYS[library.nsfwFilter],
                )}`}
                title={t('nsfwToggleHint')}
                className={cn(
                  'inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-xs font-medium transition-colors',
                  library.nsfwFilter === 'nsfwOnly'
                    ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                    : library.nsfwFilter === 'safe'
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border/60 text-muted-foreground hover:border-primary/20 hover:text-foreground',
                )}
              >
                {library.nsfwFilter === 'nsfwOnly' ? (
                  <ShieldAlert className="size-3.5" aria-hidden />
                ) : library.nsfwFilter === 'safe' ? (
                  <ShieldCheck className="size-3.5" aria-hidden />
                ) : (
                  <Shield className="size-3.5" aria-hidden />
                )}
                {t(NSFW_FILTER_LABEL_KEYS[library.nsfwFilter])}
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => void library.refresh()}
                aria-label={t('refresh')}
                className="shrink-0"
              >
                <RefreshCw className="size-3.5" aria-hidden />
              </Button>
            </>,
            controlsSlotNode,
          )
        : null}

      <LoraCoverPreviewDialog
        preview={coverPreview}
        onClose={() => setCoverPreview(null)}
      />

      {/* R2 共享来源配方 modal（Library variant：查看 + 复制 + 打开来源，
          不承担「做同款」）。 */}
      <LoraSourceRecipeModal
        open={recipeModalIndex !== null}
        onOpenChange={(open) => {
          if (!open) setRecipeModalIndex(null)
        }}
        recipes={minedPrompts.recipes}
        index={recipeModalIndex ?? 0}
        onIndexChange={setRecipeModalIndex}
        variant="library"
        assetName={library.selectedItem?.name ?? ''}
        baseModelFamily={library.selectedItem?.baseModelFamily ?? ''}
        sourceUrl={library.selectedItem?.modelPageUrl ?? ''}
        tags={library.selectedItem?.tags}
      />
    </section>
  )
}
