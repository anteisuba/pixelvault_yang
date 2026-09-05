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
import { useFormatter, useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  CIVITAI_LORA_SORT_OPTIONS,
  DEFAULT_LORA_CONTENT_TYPE,
  DEFAULT_LORA_NSFW_FILTER,
  LORA_CONTENT_TYPE_VALUES_BY_SOURCE,
  LORA_LIBRARY_FAMILY_PARAM,
  LORA_LIBRARY_FAMILY_VALUES_BY_SOURCE,
  LORA_LIBRARY_MOBILE_GRID_CLASS,
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
  type LoraLibrarySource,
  type LoraNsfwFilter,
} from '@/constants/lora'
import { ROUTES } from '@/constants/routes'
import { usePathname, useRouter } from '@/i18n/navigation'
import type { CivitaiLoraLibraryItem, LoraAssetRecord } from '@/types'
import { useActiveLoraStack } from '@/hooks/use-active-lora-stack'
import { useCivitaiDownloadGate } from '@/hooks/use-civitai-download-gate'
import { useCivitaiLoraLibrary } from '@/hooks/use-civitai-lora-library'
import { useCivitaiMinedPrompts } from '@/hooks/prompts/use-civitai-mined-prompts'
import { useIsMobile } from '@/hooks/use-mobile'
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
import { LoraLibraryGridCard } from './LoraLibraryCard'
import { LoraLibraryDetailDrawer } from './LoraLibraryDetailDrawer'
import { LoraLibraryFilterCombobox } from './LoraLibraryFilterCombobox'
import { LoraLibraryMobileFilters } from './LoraLibraryMobileFilters'
import { LoraLibraryPagination } from './LoraLibraryPagination'
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
  /** 源切换：桌面走顶栏 segmented（在 LoraLibraryTabs），手机走筛选 sheet 的
   *  「来源」分区——所以值和 setter 要下发到 pane 里来。 */
  source: LoraLibrarySource
  onSourceChange: (value: LoraLibrarySource) => void
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
  source,
  onSourceChange,
}: CivitaiCommunityBranchOwnProps) {
  const t = useTranslations('LoraWorkbench')
  const format = useFormatter()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const stack = useActiveLoraStack()
  // 挂载前的 Civitai 下载闸（与「＋添加 LoRA」库 modal 共用同一实现）。
  const { ensureMountable } = useCivitaiDownloadGate()
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
  // R1 库聚焦浏览：详情从按需抽屉改成「原位置展开」。单展开：同一时刻只有一行
  // 的详情渲染，点另一行即切换；`null` = 全部收起。
  //
  // ⚠ 这里**必须存展开项自己的 id**，不能写成「detailOpen 布尔 + 比对
  // library.selectedItem」。hook 里 `selectedItem` 是
  // `items.find(...) ?? items[0]`——带兜底：一旦列表变了（换排序/筛选/翻页/
  // 重拉），旧的 selectedItemId 对不上任何一项，selectedItem 就悄悄回落到**第
  // 一项**；此时若 detailOpen 还是 true，第一行就凭空变成展开态，用户点它反而
  // 是收起 → 表现为「第一下点不开」（owner 2026-08-07 实拍）。
  // 与 HuggingFaceLoraLibrary 的写法对齐（那边本来就是局部 state、无兜底）。
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)
  // <1024：结果区改成封面网格，详情走底部抽屉（ui-defaults.md §6「LoRA 降级」）。
  // 展开态复用同一个 expandedItemId——两种形态只是同一个「当前选中项」的两种
  // 外壳，不再养第二份选中状态。
  const isMobile = useIsMobile()
  const searchWrapperRef = useRef<HTMLDivElement>(null)
  const { isLoaded, userId } = useAuth()
  const activeClerkId: string | null = isLoaded ? userId : null

  useEffect(() => {
    return deferEffectTask(() => {
      setHistory(readSearchHistory(activeClerkId))
    })
  }, [activeClerkId])

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
    async (item: CivitaiLoraLibraryItem) => {
      // ⛔ 作者在 Civitai 关掉下载的 LoRA 挂上去只是个陷阱——判据与原因写在
      // useCivitaiDownloadGate 里（与库 modal 共用同一实现，别在这里再写一份）。
      if (!(await ensureMountable(item))) return

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
    [ensureMountable, router, stack, t],
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

  const handleOpenItem = useCallback(
    (item: CivitaiLoraLibraryItem) => {
      library.selectItem(item)
      setExpandedItemId(item.id)
    },
    [library],
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
  // 历史只记「真的搜过的词」。旧行为是敲字 800ms 后就记一条，于是
  // "detail tw" 这种半截词也进了历史。记在提交这个事件上，不放 effect——
  // effect 内同步 setState 会引发级联渲染（react-hooks/set-state-in-effect）。
  const rememberSearch = useCallback(
    (term: string) => {
      const trimmed = term.trim()
      if (trimmed.length < 2) return
      setHistory(recordSearchTerm(trimmed, activeClerkId))
    },
    [activeClerkId],
  )

  const handleTypeSearchFallback = useCallback(() => {
    if (!activeTypeSearchFallbackTerm) return
    library.setSearch(activeTypeSearchFallbackTerm)
    library.commitSearchTerm(activeTypeSearchFallbackTerm)
    rememberSearch(activeTypeSearchFallbackTerm)
    library.setContentType(DEFAULT_LORA_CONTENT_TYPE)
  }, [activeTypeSearchFallbackTerm, library, rememberSearch])

  // 输入框里的字 ≠ 正在搜的词 = 还有一次没提交的检索。按钮据此从 ghost 变
  // 实心，把「回车才生效」这件事变成看得见的状态而不是要用户猜。
  const hasPendingSearch =
    library.search.trim() !== library.debouncedSearch.trim()

  const handleSearchSubmit = useCallback(() => {
    library.submitSearch()
    rememberSearch(library.search)
    setHistoryOpen(false)
  }, [library, rememberSearch])

  const handleHistoryPick = useCallback(
    (term: string) => {
      library.setSearch(term)
      // 点历史项等于「我就要搜这个」——立刻提交，不用再按一次回车。
      library.commitSearchTerm(term)
      // 重记一次把它顶到历史最前面。
      rememberSearch(term)
      setHistoryOpen(false)
    },
    [library, rememberSearch],
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

  // 移动端 chip 行 / 筛选 sheet 的选项集（与桌面下拉、顶栏 Select 同一批值域，
  // 只是换了呈现）。
  const sortOptions = useMemo(
    () =>
      CIVITAI_LORA_SORT_OPTIONS.map((option) => ({
        value: option.value as string,
        label: t(option.labelKey),
      })),
    [t],
  )
  const nsfwOptions = useMemo(
    () =>
      LORA_NSFW_FILTER_VALUES.map((value) => ({
        value,
        label: t(NSFW_FILTER_LABEL_KEYS[value]),
      })),
    [t],
  )
  // chip 上的 ●N 只数「筛选」sheet 里那三个缩小结果集的维度（类型/底模/安全）——
  // 排序不缩小结果集，搜索有自己的输入框，都不进这个数。
  const activeFilterCount =
    (library.contentType !== DEFAULT_LORA_CONTENT_TYPE ? 1 : 0) +
    (library.baseModel !== 'all' ? 1 : 0) +
    (library.nsfwFilter !== DEFAULT_LORA_NSFW_FILTER ? 1 : 0)

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

  // ⚠ 用 `find` 而不是 `library.selectedItem`：hook 里那个带「回落到第一项」的
  // 兜底，列表一变（换排序/翻页/重拉）抽屉就会静默换成另一个 LoRA 的详情。
  const drawerItem =
    library.items.find((item) => item.id === expandedItemId) ?? null

  return (
    <section className="flex min-h-0 flex-1 flex-col lg:block lg:space-y-3">
      {/* 结果区：单列宽幅效果流 + 原位展开详情 + 真实分页。
          顶栏（portal 进 LoraWorkbench）只留「在哪 / 找什么 / 怎么排」＝
          搜索 + 来源 + 排序；这一行是「筛到什么」＝类型 / 底模 / 安全，末尾跟
          刷新（按当前条件重拉）。
          ⚠ owner 2026-08-07：安全（NSFW 分级）本来在顶栏和排序并列，但它**是
          筛选**——缩小结果集，和类型/底模同类；排序不缩小只重排，两者混在一行
          读不出层次。 */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:gap-3">
        {/* <1024：上面那一行（类型/底模/安全/刷新）＋顶栏的来源/排序全部收成
            一行 chip + 底部 sheet。375 上原来这些要 256px 头部，只剩 2 张卡
            看得全（owner 2026-09-03）。 */}
        {isMobile ? (
          <LoraLibraryMobileFilters
            source={source}
            onSourceChange={onSourceChange}
            sortValue={library.sort}
            sortOptions={sortOptions}
            onSortChange={handleSortChange}
            contentType={library.contentType}
            typeOptions={typeOptions}
            onContentTypeChange={library.setContentType}
            familySlug={civitaiBaseModelToFamilySlug(library.baseModel)}
            familyOptions={familyOptions}
            onFamilyChange={(slug) =>
              handleBaseModelChange(familySlugToCivitaiBaseModel(slug))
            }
            nsfwFilter={library.nsfwFilter}
            nsfwOptions={nsfwOptions}
            onNsfwFilterChange={library.setNsfwFilter}
            total={library.total}
            activeFilterCount={activeFilterCount}
            onClearFilters={handleClearFilters}
            onRefresh={() => void library.refresh()}
          />
        ) : (
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
            <button
              type="button"
              onClick={handleNsfwToggle}
              aria-label={`${t('nsfwToggleHint')}：${t(
                NSFW_FILTER_LABEL_KEYS[library.nsfwFilter],
              )}`}
              title={t('nsfwToggleHint')}
              className={cn(
                'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-xs font-medium transition-colors',
                library.nsfwFilter === 'nsfwOnly'
                  ? 'border-status-warning/40 bg-status-warning-surface text-status-warning'
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
            {/* 刷新推到最右：它不是筛选条件，是「按当前条件重拉」的动作。 */}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => void library.refresh()}
              aria-label={t('refresh')}
              className="ml-auto shrink-0"
            >
              <RefreshCw className="size-3.5" aria-hidden />
            </Button>
          </div>
        )}

        {library.isStale && library.staleFetchedAt ? (
          <div
            role="status"
            className="border-border bg-muted/50 text-foreground mb-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs font-medium"
          >
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              {t('staleSnapshotNotice', {
                time: format.relativeTime(new Date(library.staleFetchedAt)),
              })}
            </span>
          </div>
        ) : null}

        <div
          className={cn(
            'min-h-0 flex-1 overflow-y-auto overscroll-contain transition-opacity lg:flex-none lg:overflow-visible',
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
            <div className="flex flex-col gap-3">
              <div className={LORA_LIBRARY_MOBILE_GRID_CLASS}>
                {library.items.map((item) => (
                  <LoraLibraryGridCard
                    key={item.id}
                    source="civitai"
                    item={item}
                    onOpen={() => handleOpenItem(item)}
                  />
                ))}
              </div>
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
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  handleSearchSubmit()
                }}
                // 触屏键盘把回车键渲染成「搜索」，配合右侧按钮两条路都通。
                // 不用 type="search"：Chrome 会画一个原生清除叉，正好压在
                // 右侧那颗搜索按钮上。
                enterKeyHint="search"
                placeholder={t('communitySearch')}
                className="h-9 pl-9 pr-16 text-xs"
              />
              {library.isRevalidating ? (
                <Spinner
                  size="sm"
                  className="pointer-events-none absolute right-11 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
              ) : null}
              {/* 移动端没有回车键可按，必须有个能点的入口。桌面端它也是
                  「输入不等于已搜」的可见提示——不然改成显式提交之后，用户
                  敲完字盯着没变的列表会以为卡住了。 */}
              <Button
                type="button"
                size="sm"
                variant={hasPendingSearch ? 'default' : 'ghost'}
                onClick={handleSearchSubmit}
                aria-label={t('communitySearchSubmit')}
                className="absolute right-1 top-1/2 h-7 -translate-y-1/2 px-2"
              >
                <Search className="size-3.5" aria-hidden />
              </Button>
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
          LoraWorkbench 顶栏的控件槽。手机上排序进了筛选 sheet，这里不渲染
          （渲染就等于顶栏又多一行）。 */}
      {!isMobile && controlsSlotNode
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
              {/* 安全（NSFW 分级）与刷新已下沉到类型/底模那一行——见结果区上方
                  那段注释。这里只剩排序。 */}
            </>,
            controlsSlotNode,
          )
        : null}

      <LoraLibraryDetailDrawer
        open={drawerItem !== null}
        onOpenChange={(open) => {
          if (!open) setExpandedItemId(null)
        }}
        title={drawerItem?.name ?? ''}
      >
        {drawerItem ? (
          <LoraLibraryRowDetail
            source="civitai"
            layout="drawer"
            item={drawerItem}
            isFavorited={isFavorited(drawerItem.loraUrl)}
            onUse={(target) => void handleUse(target)}
            onFavorite={handleFavoriteToggle}
            onCollapse={() => setExpandedItemId(null)}
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
        ) : null}
      </LoraLibraryDetailDrawer>

      <LoraCoverPreviewDialog
        key={coverPreview?.url ?? 'closed'}
        images={sampleImages.map((image) => proxyCivitaiImageUrl(image.url))}
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
