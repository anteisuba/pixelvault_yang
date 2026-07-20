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
} from '@/constants/lora'
import { getCompatibleBases } from '@/constants/lora-base-models'
import { ROUTES } from '@/constants/routes'
import { usePathname, useRouter } from '@/i18n/navigation'
import { useActiveLoraStack } from '@/hooks/use-active-lora-stack'
import { useHuggingFaceLoraLibrary } from '@/hooks/use-huggingface-lora-library'
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
import { LoraLibraryDetailReveal } from './LoraLibraryDetailReveal'
import { LoraLibraryFilterCombobox } from './LoraLibraryFilterCombobox'
import { LoraLibraryPagination } from './LoraLibraryPagination'
import { LoraLibraryRow } from './LoraLibraryRow'
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
}

export function HuggingFaceLoraLibrary({
  onImport,
  onUnfavoriteByUrl,
  isFavorited,
  searchSlotNode,
  controlsSlotNode,
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

  // 原位展开切换：点已展开当前项 → 收起；点其它项 → 切换并展开。
  const handleToggleItem = useCallback(
    (item: HuggingFaceLoraSearchItem) => {
      const isCurrentlyExpanded =
        detailOpen && selectedItem?.repoId === item.repoId
      if (isCurrentlyExpanded) {
        setDetailOpen(false)
        return
      }
      setSelectedItem(item)
      setDetailOpen(true)
    },
    [detailOpen, selectedItem],
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
      const record = await onImport({
        name: item.name,
        triggerWord: item.triggerWord,
        loraUrl: file.downloadUrl,
        type: item.type,
        baseModelFamily: file.baseModelFamily,
        provider: 'huggingface',
        coverImageUrl: item.coverImageUrl,
      })
      if (!record) return
      stack.push(record)
      toast.success(t('addedToStack', { name: record.name }), {
        duration: LORA_TOAST_DURATION_MS,
      })
      router.push(
        `${ROUTES.STUDIO_LORA}?${LORA_WORKBENCH_SEARCH_PARAM}=${LORA_WORKBENCH_SECTIONS.GENERATE}`,
      )
    },
    [onImport, router, stack, t],
  )

  // 拍板②：HF 的「导入」语义统一为「收藏」，落 LoraAssetRecord 的实现不变
  // （onImport 幂等——已收藏文件直接返回既有记录）。
  const handleFavorite = useCallback(
    (item: HuggingFaceLoraSearchItem, file: HuggingFaceLoraFile) => {
      void onImport({
        name: item.name,
        triggerWord: item.triggerWord,
        loraUrl: file.downloadUrl,
        type: item.type,
        baseModelFamily: file.baseModelFamily,
        provider: 'huggingface',
        coverImageUrl: item.coverImageUrl,
      })
    },
    [onImport],
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

  return (
    <section className="space-y-3">
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
            value={huggingFaceFamilyToFamilySlug(library.baseModelFamily)}
            options={familyOptions}
            onChange={(slug) =>
              library.setBaseModelFamily(familySlugToHuggingFaceFamily(slug))
            }
            searchable
            searchPlaceholder={t('baseModelSearchPlaceholder')}
            emptyText={t('baseModelSearchEmpty')}
          />
        </div>

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
              'flex flex-col gap-1',
              library.isRevalidating ? 'opacity-60' : 'opacity-100',
            )}
            aria-busy={library.isRevalidating}
          >
            {library.items.map((item, index) => {
              const isExpanded =
                detailOpen && selectedItem?.repoId === item.repoId
              return (
                <LoraLibraryDetailReveal
                  key={item.repoId}
                  isExpanded={isExpanded}
                  row={
                    <LoraLibraryRow
                      source="huggingface"
                      item={item}
                      index={index + 1}
                      isExpanded={false}
                      onToggle={() => handleToggleItem(item)}
                    />
                  }
                  detail={
                    <LoraLibraryRowDetail
                      source="huggingface"
                      item={item}
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
                  }
                />
              )
            })}
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

      {/* 顶栏右端控件：排序 Select + 刷新，portal 进控件槽。HF 无 NSFW。 */}
      {controlsSlotNode
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
    </section>
  )
}
