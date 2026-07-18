'use client'

import { useCallback, useEffect, useState } from 'react'
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
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import type {
  FavoriteLoraRequest,
  HuggingFaceLoraFile,
  HuggingFaceLoraSearchItem,
  LoraAssetRecord,
} from '@/types'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { ContentTypeChipRow } from './ContentTypeChipRow'
import { FamilyChipRow } from './FamilyChipRow'
import { LoraCoverPreviewDialog } from './LoraCoverPreviewDialog'
import { LoraLibraryCard } from './LoraLibraryCard'
import { LoraLibraryInspector } from './LoraLibraryInspector'
import { LoraLibraryPagination } from './LoraLibraryPagination'
import {
  LoraLibraryTypeEmptyState,
  LoraLibraryTypeSparseCard,
} from './LoraLibraryTypeStates'

interface HuggingFaceLoraLibraryProps {
  onImport: (input: FavoriteLoraRequest) => Promise<LoraAssetRecord | null>
  onUnfavoriteByUrl: (loraUrl: string) => Promise<boolean>
  isFavorited: (loraUrl: string) => boolean
  /** §12：行A 右端控件槽（LoraLibraryTabs 渲染），排序/刷新 portal 进去，
   *  与 pills/源 segmented 同行。HF 无分级数据，不渲染 NSFW chip。 */
  controlsSlotNode: HTMLDivElement | null
}

export function HuggingFaceLoraLibrary({
  onImport,
  onUnfavoriteByUrl,
  isFavorited,
  controlsSlotNode,
}: HuggingFaceLoraLibraryProps) {
  const t = useTranslations('LoraWorkbench')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const stack = useActiveLoraStack()
  const isMobile = useIsMobile()

  // S1 统一外壳：family/q/sort 全部入 URL query，与 civitai pane 同一套
  // 「值等于默认就从 query 里删掉」约定；`nsfw`/`source` 不属于这个 pane，
  // effect 只碰自己拥有的三个 key，切源时原样留在 URL 里（lora-workbench.md
  // §2.1「nsfw 状态在 URL 保留、切回恢复」）。
  const initialFamilySlug = parseLoraLibraryFamilyParam(
    searchParams.get(LORA_LIBRARY_FAMILY_PARAM),
  )
  const initialSortParam = searchParams.get(LORA_LIBRARY_SORT_PARAM)
  // S2：URL `type=` 解析同一套「未知值静默按 all」约定（§2.5）。
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

  // S3 统一详情抽屉（lora-workbench.md §2.4）：点卡开抽屉，与 civitai 对齐
  // ——HF 卡面不再自带 file Select/import 按钮，选文件+收藏都进抽屉。
  const [selectedItem, setSelectedItem] =
    useState<HuggingFaceLoraSearchItem | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(false)
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

  const handleSelectItem = useCallback((item: HuggingFaceLoraSearchItem) => {
    setSelectedItem(item)
    setInspectorOpen(true)
  }, [])

  // 主「去生成」：家族可生成时组合 import（幂等，已收藏则直接返回既有
  // 记录）+ 挂载栈 push + 跳转生成，与 civitai 的 handleUse 语义对齐——HF
  // 资产没有 civitai 那种可以直接 push 的临时合成记录，落库是唯一路径。
  // 家族不可生成时兜底跳去 HF repo（D5 外源模式）——与抽屉内的按钮态互为
  // 防御性双保险，调用方无需先自行判断。
  // 返回值 = 是否应该关闭抽屉：外链跳转/挂载成功都算「完成」；onImport 失败
  // （如未登录 401）时 false——失败已经由 onImport 内部大声 toast 过，抽屉
  // 留着让用户看清报错、可以重试，不静默关掉盖住错误（P0-1 同一条纪律）。
  const handleUse = useCallback(
    async (
      item: HuggingFaceLoraSearchItem,
      file: HuggingFaceLoraFile,
    ): Promise<boolean> => {
      if (
        !getCompatibleBases(file.baseModelFamily).some((base) => base.available)
      ) {
        window.open(item.modelPageUrl, '_blank', 'noopener,noreferrer')
        toast.info(t('externalUseRedirect', { name: item.name }), {
          duration: LORA_TOAST_DURATION_MS,
        })
        return true
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
      if (!record) return false
      stack.push(record)
      toast.success(t('addedToStack', { name: record.name }), {
        duration: LORA_TOAST_DURATION_MS,
      })
      router.push(
        `${ROUTES.STUDIO_LORA}?${LORA_WORKBENCH_SEARCH_PARAM}=${LORA_WORKBENCH_SECTIONS.GENERATE}`,
      )
      return true
    },
    [onImport, router, stack, t],
  )

  // 拍板②：HF 的「导入」语义统一为「收藏」，落 LoraAssetRecord 的实现不变
  // （onImport 本就幂等——已收藏的文件直接返回既有记录，不重复建行）。
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

  // 卡面收藏心（§2.3）：单文件仓库没有歧义，直接切换收藏；多文件仓库不
  // 知道该收哪个文件——退化为「点卡开抽屉」，交给抽屉的文件选择器决定
  // （不静默选 files[0]，与抽屉内的引导态同一条纪律）。
  const handleCardFavoriteClick = useCallback(
    (item: HuggingFaceLoraSearchItem) => {
      if (item.files.length === 1) {
        const onlyFile = item.files[0]!
        if (isFavorited(onlyFile.downloadUrl)) {
          void onUnfavoriteByUrl(onlyFile.downloadUrl)
        } else {
          handleFavorite(item, onlyFile)
        }
        return
      }
      handleSelectItem(item)
    },
    [handleFavorite, handleSelectItem, isFavorited, onUnfavoriteByUrl],
  )

  const handleCopyTrigger = useCallback(
    async (trigger: string) => {
      try {
        await navigator.clipboard.writeText(trigger)
        toast.success(t('triggerCopied'), { duration: LORA_TOAST_DURATION_MS })
      } catch {
        toast.error(t('tryPromptCopyFailed'), {
          duration: LORA_TOAST_DURATION_MS,
        })
      }
    },
    [t],
  )

  // S2（§3.3）：type 是唯一生效筛选时，0 结果走专属三件套空态；否则退回
  // 通用空态（HF 目前没有 nsfw 维度，判定只看 family/search）。
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

  return (
    <section className="space-y-3">
      {/* §12 压缩：行A（pills+源 segmented+排序/刷新）已移交 LoraLibraryTabs
          渲染，排序/刷新通过下方 portal 挂进它的控件槽——这里只剩行B（搜索，
          独占全宽）+ 行C（类型/底模成簇）+ 网格 + 分页。 */}
      <div className="flex min-h-0 flex-col gap-2.5 border-t border-border/60 pt-3">
        <div className="relative min-w-0 w-full">
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
        </div>

        {/* 行C：类型/底模两行紧贴成一簇（gap-1.5）。availableValues 走
            per-source 可用性表，某类型在 HF 完全无供给时会在这里被剔除
            （§3.1 实测：本批未发现零供给类型，全部 7 类渲染，机制留着供
            未来收窄）。 */}
        <div className="flex flex-col gap-1.5">
          <ContentTypeChipRow
            value={library.contentType}
            availableValues={
              LORA_CONTENT_TYPE_VALUES_BY_SOURCE[
                LORA_LIBRARY_SOURCES.HUGGINGFACE
              ]
            }
            onChange={library.setContentType}
          />

          <FamilyChipRow
            value={huggingFaceFamilyToFamilySlug(library.baseModelFamily)}
            availableValues={
              LORA_LIBRARY_FAMILY_VALUES_BY_SOURCE[
                LORA_LIBRARY_SOURCES.HUGGINGFACE
              ]
            }
            onChange={(slug) =>
              library.setBaseModelFamily(familySlugToHuggingFaceFamily(slug))
            }
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
          // S2（§3.3）：type 是唯一生效筛选时的专属三件套空态。
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
              'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6',
              library.isRevalidating ? 'opacity-60' : 'opacity-100',
            )}
            aria-busy={library.isRevalidating}
          >
            {library.items.map((item) => (
              <LoraLibraryCard
                key={item.repoId}
                source="huggingface"
                item={item}
                isSelected={
                  inspectorOpen && selectedItem?.repoId === item.repoId
                }
                isFavorited={item.files.some((file) =>
                  isFavorited(file.downloadUrl),
                )}
                onSelect={() => handleSelectItem(item)}
                onFavorite={() => handleCardFavoriteClick(item)}
              />
            ))}
            {/* S2（§3.3）：稀疏态引导卡——不管家族/搜索是否同时激活，只要
                type≠all 且本页结果少就出现。 */}
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

      {/* §12 行A 右端控件：portal 进 LoraLibraryTabs 渲染的控件槽，与
          pills/源 segmented 同行；控件槽未挂载时不渲染。 */}
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

      {/* 详情按需抽屉——与 civitai pane 同一套形制（手机 Drawer / 桌面
          Sheet），S3 统一抽屉组件双源装配（lora-workbench.md §2.4）。 */}
      <Drawer
        open={isMobile && inspectorOpen && !!selectedItem}
        onOpenChange={setInspectorOpen}
      >
        <DrawerContent
          aria-describedby={undefined}
          className="max-h-[85vh]"
          style={{
            maxHeight:
              'min(85vh, calc(100svh - var(--keyboard-inset, 0px) - 0.75rem))',
          }}
        >
          <DrawerTitle className="sr-only">
            {selectedItem?.name ?? ''}
          </DrawerTitle>
          <div className="overflow-y-auto px-4 pb-6 pt-2">
            <LoraLibraryInspector
              key={selectedItem?.repoId ?? 'empty'}
              source="huggingface"
              item={selectedItem}
              isFavorited={isFavorited}
              onUse={(item, file) => {
                void handleUse(item, file).then((succeeded) => {
                  if (succeeded) setInspectorOpen(false)
                })
              }}
              onFavorite={handleFavorite}
              onUnfavorite={handleUnfavorite}
              onCopyTrigger={handleCopyTrigger}
              onPreviewCover={(item) => {
                if (item.coverImageUrl) {
                  setCoverPreview({ url: item.coverImageUrl, name: item.name })
                }
              }}
            />
          </div>
        </DrawerContent>
      </Drawer>

      <Sheet
        open={!isMobile && inspectorOpen && !!selectedItem}
        onOpenChange={setInspectorOpen}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-sm"
        >
          <SheetTitle className="sr-only">
            {selectedItem?.name ?? ''}
          </SheetTitle>
          <div className="px-4 pb-6 pt-2">
            <LoraLibraryInspector
              key={selectedItem?.repoId ?? 'empty'}
              source="huggingface"
              item={selectedItem}
              isFavorited={isFavorited}
              onUse={(item, file) => {
                void handleUse(item, file).then((succeeded) => {
                  if (succeeded) setInspectorOpen(false)
                })
              }}
              onFavorite={handleFavorite}
              onUnfavorite={handleUnfavorite}
              onCopyTrigger={handleCopyTrigger}
              onPreviewCover={(item) => {
                if (item.coverImageUrl) {
                  setCoverPreview({ url: item.coverImageUrl, name: item.name })
                }
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      <LoraCoverPreviewDialog
        preview={coverPreview}
        onClose={() => setCoverPreview(null)}
      />
    </section>
  )
}
