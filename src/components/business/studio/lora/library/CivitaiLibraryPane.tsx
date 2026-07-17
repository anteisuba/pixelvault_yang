'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
import { useIsMobile } from '@/hooks/use-mobile'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Spinner } from '@/components/ui/spinner'
import {
  clearSearchHistory,
  readSearchHistory,
  recordSearchTerm,
} from '@/lib/civitai-search-history'
import { buildLoraPromptTemplate } from '@/lib/lora-prompt-template'
import { proxyCivitaiImageUrl } from '@/lib/civitai-image-url'
import { deferEffectTask } from '@/lib/defer-effect-task'
import { cn } from '@/lib/utils'
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

export interface CivitaiCommunityBranchProps {
  onFavorite: (item: CivitaiLoraLibraryItem) => Promise<LoraAssetRecord | null>
  onUnfavoriteByUrl: (loraUrl: string) => Promise<boolean>
  isFavorited: (loraUrl: string) => boolean
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
}: CivitaiCommunityBranchProps) {
  const t = useTranslations('LoraWorkbench')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const stack = useActiveLoraStack()
  // P1-5 方案 A：family/q/sort/nsfw 全部入 URL query（白名单校验，未知值
  // 静默按默认处理，不透传给 civitai API）。只在挂载时读一次做初始种子——
  // 后续变更由下面的 effect 写回 URL，与 section 参数同一套「值等于默认
  // 就从 query 里删掉」的约定。S1：family 存的是 slug（constants/lora.ts
  // §2.2），这里翻译回 civitai 的原始 baseModel 值喂给 hook——hook 内部
  // 值域不变，只在这个边界做翻译。
  const initialFamilySlug = parseLoraLibraryFamilyParam(
    searchParams.get(LORA_LIBRARY_FAMILY_PARAM),
  )
  const initialSortParam = searchParams.get(LORA_LIBRARY_SORT_PARAM)
  const initialNsfwParam = searchParams.get(LORA_LIBRARY_NSFW_PARAM)
  // S2：URL `type=` 解析同一套「未知值静默按 all」约定（§2.5）。
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
  // Phase-2 enrichment: mine the activation prompt from user generations
  // for the currently-selected LoRA. Lazy + cached per (model, version,
  // hash); covers the ~34% of LoRAs that ship neither trainedWords nor
  // description code blocks.
  const minedPrompts = useCivitaiMinedPrompts(library.selectedItem)
  const isMobile = useIsMobile()
  const [coverPreview, setCoverPreview] = useState<{
    url: string
    name: string
  } | null>(null)
  const [history, setHistory] = useState<string[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  // 库模块重做（lora-domain-wireframes.md §4）：详情从常驻的第三栏改成
  // 按需抽屉——桌面端右侧滑入 Sheet，手机端底部 Drawer（Vaul），两者共用
  // 同一个 open 状态，点卡才出现，不占网格空间。
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const searchWrapperRef = useRef<HTMLDivElement>(null)
  // Clerk scopes the history slot so A's searches never surface in B's
  // dropdown after a sign-out / sign-in on the same browser.
  const { isLoaded, userId } = useAuth()
  const activeClerkId: string | null = isLoaded ? userId : null

  useEffect(() => {
    // Defer the hydrate so React doesn't see a synchronous setState in
    // the effect body — same pattern useCivitaiLoraLibrary uses for its
    // initial refresh.
    return deferEffectTask(() => {
      setHistory(readSearchHistory(activeClerkId))
    })
  }, [activeClerkId])

  // Commit a search term to history on debounce-completion (i.e. when
  // the active search the API is actually using stabilises). We hook
  // off `library.search` ≥ 2 chars to avoid logging every keystroke.
  useEffect(() => {
    const trimmed = library.search.trim()
    if (trimmed.length < 2) return
    const id = setTimeout(() => {
      setHistory(recordSearchTerm(trimmed, activeClerkId))
    }, 800)
    return () => clearTimeout(id)
  }, [activeClerkId, library.search])

  // Close history dropdown on outside click.
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
      // External base models (Pony / SD 1.5 / Anima): PixelVault has no
      // working inference endpoint or the license forbids third-party
      // hosted generation. Send the user to Civitai to generate there
      // rather than dispatching them into a guaranteed-failure path.
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
      // 去生成：切到 LoRA 域生成 tab（Image Studio 已不消费 LoRA）。
      router.push(
        `${ROUTES.STUDIO_LORA}?${LORA_WORKBENCH_SEARCH_PARAM}=${LORA_WORKBENCH_SECTIONS.GENERATE}`,
      )
    },
    [router, stack, t],
  )

  // B10 (D7⑤) 带词去生成：与 handleUse 同一挂载路径，额外把试用词段带进生成
  // 纸——走 ?prompt= 回放注入（GenerateBranch 的 replay effect 会读它填 prompt）。
  // 只对可生成家族有意义；外源家族在 UI 层已不显示这个入口。
  const handleUseWithPrompt = useCallback(
    (item: CivitaiLoraLibraryItem, promptText: string) => {
      if (!isCivitaiBaseModelGeneratable(item.baseModelFamily)) return
      stack.push(item)
      toast.success(t('addedToStack', { name: item.name }), {
        duration: LORA_TOAST_DURATION_MS,
      })
      const params = new URLSearchParams({
        [LORA_WORKBENCH_SEARCH_PARAM]: LORA_WORKBENCH_SECTIONS.GENERATE,
      })
      if (promptText.trim()) params.set('prompt', promptText)
      router.push(`${ROUTES.STUDIO_LORA}?${params.toString()}`)
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

  const handleSelectItem = useCallback(
    (item: CivitaiLoraLibraryItem) => {
      library.selectItem(item)
      // 网格卡片点了就该打开详情——桌面/手机都是按需抽屉了，不再有常驻的
      // 桌面第三栏。
      setInspectorOpen(true)
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

  // P1-6（三态循环）：不设限 → 仅NSFW → 安全 → 不设限。
  const handleNsfwToggle = useCallback(() => {
    const currentIndex = LORA_NSFW_FILTER_VALUES.indexOf(library.nsfwFilter)
    const nextValue =
      LORA_NSFW_FILTER_VALUES[
        (currentIndex + 1) % LORA_NSFW_FILTER_VALUES.length
      ]
    library.setNsfwFilter(nextValue)
  }, [library])

  // P2-6：空结果时补「清除筛选」——只在真的有筛选在生效时才有意义显示。
  // S2：扩展为连 type 一起清（§3.3「与其他筛选组合为空时走现有清除筛选
  // 空态，动作扩展为清 type」）。
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

  // S2（§3.3）：type 是唯一生效筛选时，0 结果走专属三件套空态（不是通用
  // 「清除筛选」空态）——family/q/nsfw 任一同时激活时退回通用空态，避免
  // 两套空态在同一场景里打架。
  const isTypeOnlyFilter =
    library.contentType !== 'all' &&
    library.baseModel === 'all' &&
    library.debouncedSearch === '' &&
    library.nsfwFilter === DEFAULT_LORA_NSFW_FILTER
  const activeTypeSearchFallbackTerm =
    library.contentType !== 'all'
      ? getLoraContentTypeDefinition(library.contentType).searchFallbackTerm
      : null
  // 稀疏引导卡 / 空态主动作共用的「用关键词搜索」注入：填搜索框 + type
  // 重置 all（§3.3「点击把词填入搜索框、type 重置 all」）。
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

  const handleCopyTryPrompt = useCallback(
    // overridePrompt lets the inspector pass the currently-selected outfit
    // when a LoRA has multiple variants; fallback path keeps the original
    // single-prompt behaviour for non-Civitai callers and back-compat.
    async (item: CivitaiLoraLibraryItem, overridePrompt?: string) => {
      const text = overridePrompt ?? buildLoraPromptTemplate(item)
      try {
        await navigator.clipboard.writeText(text)
        toast.success(t('tryPromptCopied'), {
          duration: LORA_TOAST_DURATION_MS,
        })
      } catch {
        toast.error(t('tryPromptCopyFailed'), {
          duration: LORA_TOAST_DURATION_MS,
        })
      }
    },
    [t],
  )

  const handleCopyTrigger = useCallback(
    async (trigger: string) => {
      // Just the trigger token — the common case when the user already has a
      // prompt and only needs to glue the activation word in. Splitting this
      // out avoids the "copy template" pattern dumping 100+ chars on top of
      // an existing prompt.
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

  return (
    <section className="space-y-3">
      {/* S1 统一外壳（lora-workbench.md §2.1）：控件行去盒化——不再套
          rounded-2xl 面板，顶部发丝线分区，与上面的源 tab 挨着。行1=搜索/
          排序/NSFW/刷新，行3=底模 chips（行2 留给 S2 的「类型」chips）。 */}
      <div className="flex min-h-0 flex-col gap-2.5 border-t border-border/60 pt-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div ref={searchWrapperRef} className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={library.search}
              onChange={(event) => library.setSearch(event.target.value)}
              onFocus={() => setHistoryOpen(true)}
              placeholder={t('communitySearch')}
              className="h-9 pl-9 pr-8 text-xs"
            />
            {/* Inline revalidation indicator — replaces the old "blank the
                whole list and show a center loader" behaviour. Stale items
                stay visible underneath while this spins, so the user keeps
                context instead of seeing a 300–900 ms white flash. */}
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
                          // Use mousedown so we beat the input's blur,
                          // which would close the popup before click fires.
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
          </div>
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
          {/* B11 兜底：meilisearch 挂了回落 REST 搜索路径，此时排序请求
              被 civitai 静默忽略——如实告知，别让用户以为选的排序生效了。 */}
          {library.sortFellBackToRelevance ? (
            <span
              className="inline-flex h-9 shrink-0 items-center whitespace-nowrap text-2xs text-muted-foreground"
              title={t('sortFallbackHint')}
            >
              {t('sortFallbackLabel')}
            </span>
          ) : null}
          {/* P1-6（三态循环，2026-07-04 改稿）：不设限（默认）→ 仅NSFW
              （过滤掉安全内容）→ 安全 → 循环。仅 NSFW 态琥珀描边示警，
              安全态用与其它筛选 chip 一致的 primary 高亮。仅 civitai 源
              渲染——HF Hub 无分级数据（lora-workbench.md §2.1）。 */}
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
        </div>

        {/* 行2=类型（S2），行3=底模（S1）——顺序对齐 lora-workbench.md §2.1
            控件行示意图。 */}
        <ContentTypeChipRow
          value={library.contentType}
          availableValues={
            LORA_CONTENT_TYPE_VALUES_BY_SOURCE[LORA_LIBRARY_SOURCES.CIVITAI]
          }
          onChange={library.setContentType}
        />

        <FamilyChipRow
          value={civitaiBaseModelToFamilySlug(library.baseModel)}
          availableValues={
            LORA_LIBRARY_FAMILY_VALUES_BY_SOURCE[LORA_LIBRARY_SOURCES.CIVITAI]
          }
          onChange={(slug) =>
            handleBaseModelChange(familySlugToCivitaiBaseModel(slug))
          }
        />

        <div
          className={cn(
            'min-h-0 transition-opacity',
            // Dim stale items slightly while a background fetch is running
            // so the spinner in the search input has a visual partner. Keep
            // them rendered (no `display: none`) — the whole point is that
            // the user keeps reading the previous result.
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
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              <span>{t('communityLoadFailed')}</span>
            </div>
          ) : library.items.length === 0 && isTypeOnlyFilter ? (
            // S2（§3.3）：type 是唯一生效筛选时的专属三件套空态。
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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {library.items.map((item) => (
                <LoraLibraryCard
                  key={item.id}
                  source="civitai"
                  item={item}
                  // P2-5：ring 只在抽屉/侧栏真正打开时标记对应卡，不然首屏
                  // 第一张卡永远带 ring 却不指向任何打开的状态。
                  isSelected={
                    inspectorOpen && library.selectedItem?.id === item.id
                  }
                  isFavorited={isFavorited(item.loraUrl)}
                  onSelect={() => handleSelectItem(item)}
                  onFavorite={() => handleFavoriteToggle(item)}
                />
              ))}
              {/* S2（§3.3）：稀疏态（本页 1–5 条）网格尾部追加引导卡——不管
                  家族/搜索/NSFW 是否同时激活，只要 type≠all 且本页结果少
                  就出现（验收：冷门类型+家族组合见引导卡）。 */}
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

      {/* 详情按需抽屉——手机端 Vaul 底部 Drawer，桌面端右侧滑入 Sheet
          （lora-domain-wireframes.md §4.5 动效规范：320ms 滑入 + scrim，
          网格不被推开）。两者共用 inspectorOpen，按 isMobile 二选一挂载。 */}
      <Drawer
        open={isMobile && inspectorOpen && !!library.selectedItem}
        onOpenChange={setInspectorOpen}
      >
        {/* aria-describedby explicitly unset — Radix otherwise warns about a
            missing Description, but the drawer body already contains all the
            details and a verbose description would just be noise for screen
            readers. */}
        <DrawerContent
          aria-describedby={undefined}
          className="max-h-[85vh]"
          style={{
            maxHeight:
              'min(85vh, calc(100svh - var(--keyboard-inset, 0px) - 0.75rem))',
          }}
        >
          <DrawerTitle className="sr-only">
            {library.selectedItem?.name ?? ''}
          </DrawerTitle>
          <div className="overflow-y-auto px-4 pb-6 pt-2">
            <LoraLibraryInspector
              // Same remount-on-id-change pattern as the desktop instance.
              key={library.selectedItem?.id ?? 'empty'}
              source="civitai"
              item={library.selectedItem}
              isFavorited={
                library.selectedItem
                  ? isFavorited(library.selectedItem.loraUrl)
                  : false
              }
              onUse={(item) => {
                handleUse(item)
                setInspectorOpen(false)
              }}
              onUseWithPrompt={(item, promptText) => {
                handleUseWithPrompt(item, promptText)
                setInspectorOpen(false)
              }}
              onFavorite={handleFavoriteToggle}
              onCopyTryPrompt={handleCopyTryPrompt}
              onCopyTrigger={handleCopyTrigger}
              onPreviewCover={(item) => {
                const fullUrl = item.coverImageUrlOriginal ?? item.coverImageUrl
                if (fullUrl) {
                  setCoverPreview({
                    url: proxyCivitaiImageUrl(fullUrl),
                    name: item.name,
                  })
                }
              }}
              minedOutfits={minedPrompts.outfits}
              minedTotalSampled={minedPrompts.totalSampled}
              minedIsLoading={minedPrompts.isLoading}
            />
          </div>
        </DrawerContent>
      </Drawer>

      <Sheet
        open={!isMobile && inspectorOpen && !!library.selectedItem}
        onOpenChange={setInspectorOpen}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-sm"
        >
          <SheetTitle className="sr-only">
            {library.selectedItem?.name ?? ''}
          </SheetTitle>
          <div className="px-4 pb-6 pt-2">
            <LoraLibraryInspector
              key={library.selectedItem?.id ?? 'empty'}
              source="civitai"
              item={library.selectedItem}
              isFavorited={
                library.selectedItem
                  ? isFavorited(library.selectedItem.loraUrl)
                  : false
              }
              onUse={(item) => {
                handleUse(item)
                setInspectorOpen(false)
              }}
              onUseWithPrompt={(item, promptText) => {
                handleUseWithPrompt(item, promptText)
                setInspectorOpen(false)
              }}
              onFavorite={handleFavoriteToggle}
              onCopyTryPrompt={handleCopyTryPrompt}
              onCopyTrigger={handleCopyTrigger}
              onPreviewCover={(item) => {
                const fullUrl = item.coverImageUrlOriginal ?? item.coverImageUrl
                if (fullUrl) {
                  setCoverPreview({
                    url: proxyCivitaiImageUrl(fullUrl),
                    name: item.name,
                  })
                }
              }}
              minedOutfits={minedPrompts.outfits}
              minedTotalSampled={minedPrompts.totalSampled}
              minedIsLoading={minedPrompts.isLoading}
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
