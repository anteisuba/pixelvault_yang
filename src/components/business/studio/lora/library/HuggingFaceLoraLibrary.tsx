'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import { RefreshCw, Search } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  DEFAULT_LORA_CONTENT_TYPE,
  HUGGINGFACE_LORA_SORT_OPTIONS,
  LORA_CONTENT_TYPE_VALUES_BY_SOURCE,
  LORA_LIBRARY_FAMILY_PARAM,
  LORA_LIBRARY_FAMILY_VALUES_BY_SOURCE,
  LORA_LIBRARY_MOBILE_GRID_CLASS,
  LORA_LIBRARY_SEARCH_PARAM,
  LORA_LIBRARY_SORT_PARAM,
  LORA_LIBRARY_SOURCES,
  LORA_LIBRARY_TYPE_PARAM,
  LORA_TOAST_DURATION_MS,
  LORA_WORKBENCH_SEARCH_PARAM,
  LORA_WORKBENCH_SECTIONS,
  familySlugToHuggingFaceFamily,
  getLoraContentTypeDefinition,
  huggingFaceFamilyToFamilySlug,
  isHuggingFaceLoraSort,
  parseLoraLibraryFamilyParam,
  parseLoraLibraryTypeParam,
  type LoraLibrarySource,
} from '@/constants/lora'
import { getCompatibleBases } from '@/constants/lora-base-models'
import { ROUTES } from '@/constants/routes'
import { usePathname, useRouter } from '@/i18n/navigation'
import { useActiveLoraStack } from '@/hooks/use-active-lora-stack'
import { useHuggingFaceLoraLibrary } from '@/hooks/use-huggingface-lora-library'
import { useIsMobile } from '@/hooks/use-mobile'
import { buildHuggingFaceSourceSnapshot } from '@/lib/lora-source-snapshot'
import { cn } from '@/lib/utils'
import type {
  FavoriteLoraRequest,
  HuggingFaceLoraFile,
  HuggingFaceLoraSearchItem,
  LoraAssetRecord,
} from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LoraCoverPreviewDialog } from './LoraCoverPreviewDialog'
import { LoraLibraryGridCard } from './LoraLibraryCard'
import { LoraLibraryDetailDrawer } from './LoraLibraryDetailDrawer'
import { LoraLibraryFilterCombobox } from './LoraLibraryFilterCombobox'
import { LoraLibraryMobileFilters } from './LoraLibraryMobileFilters'
import { LoraLibraryPagination } from './LoraLibraryPagination'
import { LoraLibraryRowDetail } from './LoraLibraryRowDetail'
import {
  LoraLibraryTypeEmptyState,
  LoraLibraryTypeSparseCard,
} from './LoraLibraryTypeStates'
import {
  LORA_CONTENT_TYPE_LABEL_KEYS,
  LORA_LIBRARY_FAMILY_LABEL_KEYS,
} from './lora-library-filter-labels'

interface HuggingFaceLoraLibraryProps {
  onImport: (input: FavoriteLoraRequest) => Promise<LoraAssetRecord | null>
  onUnfavoriteByUrl: (loraUrl: string) => Promise<boolean>
  isFavorited: (loraUrl: string) => boolean
  /** R1 顶栏槽（LoraLibraryTabs → LoraWorkbench 常驻顶栏）：搜索框 portal 进
   *  searchSlot；排序/刷新 portal 进 controlsSlot。HF 无分级数据，不渲染 NSFW。 */
  searchSlotNode: HTMLDivElement | null
  controlsSlotNode: HTMLDivElement | null
  /** 源切换：桌面走顶栏 segmented，手机走筛选 sheet 的「来源」分区。 */
  source: LoraLibrarySource
  onSourceChange: (value: LoraLibrarySource) => void
}

export function HuggingFaceLoraLibrary({
  onImport,
  onUnfavoriteByUrl,
  isFavorited,
  searchSlotNode,
  controlsSlotNode,
  source,
  onSourceChange,
}: HuggingFaceLoraLibraryProps) {
  const t = useTranslations('LoraWorkbench')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const stack = useActiveLoraStack()

  const initialFamilySlug = parseLoraLibraryFamilyParam(
    searchParams.get(LORA_LIBRARY_FAMILY_PARAM),
  )
  const initialSortParam = searchParams.get(LORA_LIBRARY_SORT_PARAM)
  const initialContentType = parseLoraLibraryTypeParam(
    searchParams.get(LORA_LIBRARY_TYPE_PARAM),
  )
  const library = useHuggingFaceLoraLibrary({
    initialSearch:
      searchParams.get(LORA_LIBRARY_SEARCH_PARAM)?.trim() || undefined,
    initialBaseModelFamily: familySlugToHuggingFaceFamily(initialFamilySlug),
    initialSort:
      initialSortParam && isHuggingFaceLoraSort(initialSortParam)
        ? initialSortParam
        : undefined,
    initialContentType:
      initialContentType === 'all' ? undefined : initialContentType,
  })

  // R1 库聚焦浏览：详情从按需抽屉改成原位置展开——selectedItem + detailOpen。
  const [selectedItem, setSelectedItem] =
    useState<HuggingFaceLoraSearchItem | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [coverPreview, setCoverPreview] = useState<{
    url: string
    name: string
  } | null>(null)
  // <1024：结果区改成封面网格 + 底部详情抽屉（与 Civitai pane 同一形制）。
  const isMobile = useIsMobile()

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    const familySlug = huggingFaceFamilyToFamilySlug(library.baseModelFamily)
    if (familySlug === 'all') {
      params.delete(LORA_LIBRARY_FAMILY_PARAM)
    } else {
      params.set(LORA_LIBRARY_FAMILY_PARAM, familySlug)
    }
    if (library.debouncedSearch) {
      params.set(LORA_LIBRARY_SEARCH_PARAM, library.debouncedSearch)
    } else {
      params.delete(LORA_LIBRARY_SEARCH_PARAM)
    }
    if (library.sort === 'downloads') {
      params.delete(LORA_LIBRARY_SORT_PARAM)
    } else {
      params.set(LORA_LIBRARY_SORT_PARAM, library.sort)
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
    library.baseModelFamily,
    library.sort,
    library.debouncedSearch,
    library.contentType,
    pathname,
    router,
    searchParams,
  ])

  const handleOpenItem = useCallback((item: HuggingFaceLoraSearchItem) => {
    setSelectedItem(item)
    setDetailOpen(true)
  }, [])

  /**
   * 导入载荷（含出处快照，策略 C）。
   *
   * ⚠ 这个 pane 有**两个**导入点：「使用此 LoRA」与详情里的「收藏」。只接一个的
   * 下场是同一把 LoRA 从两个按钮进来，一行有作者/许可/commit、另一行全空 ——
   * 而两行看起来完全一样。所以载荷在这里拼一次，两个 handler 都用它。
   * 构造走 `lib/lora-source-snapshot`（与库 modal / 助手推荐卡同一份）。
   */
  const buildImportPayload = useCallback(
    (
      item: HuggingFaceLoraSearchItem,
      file: HuggingFaceLoraFile,
    ): FavoriteLoraRequest => ({
      name: item.name,
      triggerWord: item.triggerWord,
      loraUrl: file.downloadUrl,
      type: item.type,
      baseModelFamily: file.baseModelFamily,
      provider: 'huggingface',
      coverImageUrl: item.coverImageUrl,
      // 抓取时刻 = 这批结果回来的那一刻，不是点击时刻。
      sourceSnapshot: buildHuggingFaceSourceSnapshot({
        item,
        file,
        retrievedAt: library.retrievedAt,
      }),
    }),
    [library.retrievedAt],
  )

  // 主「使用此 LoRA」：家族可生成时组合 import（幂等）+ 挂载栈 push + 跳转
  // 生成，与 civitai 对齐。家族不可生成时兜底跳 HF repo。
  const handleUse = useCallback(
    async (item: HuggingFaceLoraSearchItem, file: HuggingFaceLoraFile) => {
      if (
        !getCompatibleBases(file.baseModelFamily).some((base) => base.available)
      ) {
        window.open(item.modelPageUrl, '_blank', 'noopener,noreferrer')
        toast.info(t('externalUseRedirect', { name: item.name }), {
          duration: LORA_TOAST_DURATION_MS,
        })
        return
      }
      const record = await onImport(buildImportPayload(item, file))
      if (!record) return
      stack.push(record)
      toast.success(t('addedToStack', { name: record.name }), {
        duration: LORA_TOAST_DURATION_MS,
      })
      router.push(
        `${ROUTES.STUDIO_LORA}?${LORA_WORKBENCH_SEARCH_PARAM}=${LORA_WORKBENCH_SECTIONS.GENERATE}`,
      )
    },
    [buildImportPayload, onImport, router, stack, t],
  )

  // 拍板②：HF 的「导入」语义统一为「收藏」，落 LoraAssetRecord 的实现不变
  // （onImport 幂等——已收藏文件直接返回既有记录）。
  const handleFavorite = useCallback(
    (item: HuggingFaceLoraSearchItem, file: HuggingFaceLoraFile) => {
      void onImport(buildImportPayload(item, file))
    },
    [buildImportPayload, onImport],
  )

  const handleUnfavorite = useCallback(
    (file: HuggingFaceLoraFile) => {
      void onUnfavoriteByUrl(file.downloadUrl)
    },
    [onUnfavoriteByUrl],
  )

  const hasActiveFilters =
    library.baseModelFamily !== 'all' ||
    library.debouncedSearch !== '' ||
    library.contentType !== DEFAULT_LORA_CONTENT_TYPE
  const handleClearFilters = () => {
    library.setBaseModelFamily('all')
    library.setSearch('')
    library.setContentType(DEFAULT_LORA_CONTENT_TYPE)
  }
  const isTypeOnlyFilter =
    library.contentType !== 'all' &&
    library.baseModelFamily === 'all' &&
    library.debouncedSearch === ''
  const activeTypeSearchFallbackTerm =
    library.contentType !== 'all'
      ? getLoraContentTypeDefinition(library.contentType).searchFallbackTerm
      : null
  const handleTypeSearchFallback = () => {
    if (!activeTypeSearchFallbackTerm) return
    library.setSearch(activeTypeSearchFallbackTerm)
    library.setContentType(DEFAULT_LORA_CONTENT_TYPE)
  }

  const typeOptions = useMemo(
    () =>
      LORA_CONTENT_TYPE_VALUES_BY_SOURCE[LORA_LIBRARY_SOURCES.HUGGINGFACE].map(
        (value) => ({
          value,
          label: t(LORA_CONTENT_TYPE_LABEL_KEYS[value]),
        }),
      ),
    [t],
  )
  const familyOptions = useMemo(
    () =>
      LORA_LIBRARY_FAMILY_VALUES_BY_SOURCE[
        LORA_LIBRARY_SOURCES.HUGGINGFACE
      ].map((value) => ({
        value,
        label: t(LORA_LIBRARY_FAMILY_LABEL_KEYS[value]),
      })),
    [t],
  )
  const sortOptions = useMemo(
    () =>
      HUGGINGFACE_LORA_SORT_OPTIONS.map((option) => ({
        value: option.value as string,
        label: t(option.labelKey),
      })),
    [t],
  )
  // HF 没有分级数据，「安全」维度不参与计数（sheet 里也不渲染那一节）。
  const activeFilterCount =
    (library.contentType !== DEFAULT_LORA_CONTENT_TYPE ? 1 : 0) +
    (library.baseModelFamily !== 'all' ? 1 : 0)

  return (
    <section className="flex min-h-0 flex-1 flex-col lg:block lg:space-y-3">
      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:gap-3">
        {/* <1024：来源/排序/类型/底模/刷新收成一行 chip + 底部 sheet（与
            Civitai pane 同一组件，只是没有「安全」分区）。 */}
        {isMobile ? (
          <LoraLibraryMobileFilters
            source={source}
            onSourceChange={onSourceChange}
            sortValue={library.sort}
            sortOptions={sortOptions}
            onSortChange={(value) => {
              if (isHuggingFaceLoraSort(value)) library.setSort(value)
            }}
            contentType={library.contentType}
            typeOptions={typeOptions}
            onContentTypeChange={library.setContentType}
            familySlug={huggingFaceFamilyToFamilySlug(library.baseModelFamily)}
            familyOptions={familyOptions}
            onFamilyChange={(slug) =>
              library.setBaseModelFamily(familySlugToHuggingFaceFamily(slug))
            }
            nsfwFilter={null}
            nsfwOptions={[]}
            onNsfwFilterChange={() => {}}
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
              value={huggingFaceFamilyToFamilySlug(library.baseModelFamily)}
              options={familyOptions}
              onChange={(slug) =>
                library.setBaseModelFamily(familySlugToHuggingFaceFamily(slug))
              }
              searchable
              searchPlaceholder={t('baseModelSearchPlaceholder')}
              emptyText={t('baseModelSearchEmpty')}
            />
            {/* 刷新推到最右：它不是筛选条件，是「按当前条件重拉」的动作。与
              Civitai 源那一行同构（那边多一个安全档，HF 没有分级筛选）。 */}
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

        {library.error ? (
          <div className="flex flex-col gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive sm:flex-row sm:items-center sm:justify-between">
            <span>{t('huggingFaceLoadFailed')}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void library.refresh()}
            >
              {t('refresh')}
            </Button>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain lg:flex-none lg:overflow-visible">
          {library.isLoading ? (
            <div
              className="flex min-h-40 items-center justify-center text-sm text-muted-foreground"
              role="status"
            >
              <Spinner size="md" className="mr-2" aria-hidden />
              {t('huggingFaceLoading')}
            </div>
          ) : library.items.length === 0 && isTypeOnlyFilter ? (
            <LoraLibraryTypeEmptyState
              onSearchFallback={handleTypeSearchFallback}
              onClearType={handleClearFilters}
            />
          ) : library.items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
              <span>{t('huggingFaceNoResults')}</span>
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
            <div
              className={cn(
                'flex flex-col gap-3',
                library.isRevalidating ? 'opacity-60' : 'opacity-100',
              )}
              aria-busy={library.isRevalidating}
            >
              <div className={LORA_LIBRARY_MOBILE_GRID_CLASS}>
                {library.items.map((item) => (
                  <LoraLibraryGridCard
                    key={item.repoId}
                    source="huggingface"
                    item={item}
                    onOpen={() => handleOpenItem(item)}
                  />
                ))}
              </div>
              {library.contentType !== 'all' &&
              library.items.length <= 5 &&
              activeTypeSearchFallbackTerm ? (
                <LoraLibraryTypeSparseCard
                  source={LORA_LIBRARY_SOURCES.HUGGINGFACE}
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

      {/* 搜索框：portal 进 LoraWorkbench 顶栏搜索槽（占左侧主位）。 */}
      {searchSlotNode
        ? createPortal(
            <div className="relative w-full min-w-0">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={library.search}
                onChange={(event) => library.setSearch(event.target.value)}
                placeholder={t('huggingFaceSearchPlaceholder')}
                aria-label={t('huggingFaceSearchPlaceholder')}
                className="h-9 pl-9 pr-8 text-xs"
              />
              {library.isRevalidating ? (
                <Spinner
                  size="sm"
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
              ) : null}
            </div>,
            searchSlotNode,
          )
        : null}

      {/* 顶栏右端控件：排序 Select + 刷新，portal 进控件槽。HF 无 NSFW。
          手机上排序进筛选 sheet，这里不渲染。 */}
      {!isMobile && controlsSlotNode
        ? createPortal(
            <>
              <Select
                value={library.sort}
                onValueChange={(value) => {
                  if (isHuggingFaceLoraSort(value)) library.setSort(value)
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="w-full border-border/60 text-xs sm:w-40"
                  aria-label={t('communitySortFilter')}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HUGGINGFACE_LORA_SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* 刷新已下沉到类型/底模那一行——见上方筛选行的注释。顶栏只剩排序。 */}
            </>,
            controlsSlotNode,
          )
        : null}

      <LoraLibraryDetailDrawer
        open={detailOpen && selectedItem !== null}
        onOpenChange={(open) => {
          if (!open) setDetailOpen(false)
        }}
        title={selectedItem?.name ?? ''}
      >
        {selectedItem ? (
          <LoraLibraryRowDetail
            source="huggingface"
            layout="drawer"
            item={selectedItem}
            isFavorited={isFavorited}
            onUse={handleUse}
            onFavorite={handleFavorite}
            onUnfavorite={handleUnfavorite}
            onCollapse={() => setDetailOpen(false)}
            onPreviewCover={(target) => {
              if (target.coverImageUrl) {
                setCoverPreview({
                  url: target.coverImageUrl,
                  name: target.name,
                })
              }
            }}
          />
        ) : null}
      </LoraLibraryDetailDrawer>

      <LoraCoverPreviewDialog
        key={coverPreview?.url ?? 'closed'}
        preview={coverPreview}
        onClose={() => setCoverPreview(null)}
      />
    </section>
  )
}
