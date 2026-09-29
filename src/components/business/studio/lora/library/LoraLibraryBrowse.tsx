'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { AnimatePresence } from 'motion/react'
import { useFormatter, useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { AlertCircle } from '@/components/icons'
import {
  CIVITAI_LORA_SORT_OPTIONS,
  CIVITAI_SEARCH_TOTAL_HITS_CAP,
  DEFAULT_LORA_CONTENT_TYPE,
  DEFAULT_LORA_NSFW_FILTER,
  LORA_CONTENT_TYPE_VALUES_BY_SOURCE,
  LORA_LIBRARY_BROWSE_PAGE_SIZE,
  LORA_LIBRARY_FAMILY_VALUES_BY_SOURCE,
  LORA_LIBRARY_SOURCES,
  LORA_NSFW_FILTER_VALUES,
  LORA_TOAST_DURATION_MS,
  civitaiBaseModelToFamilySlug,
  familySlugToCivitaiBaseModel,
  getLoraContentTypeDefinition,
  isCivitaiBaseModelGeneratable,
  isCivitaiLoraBaseModel,
  isCivitaiLoraSort,
  type LoraNsfwFilter,
} from '@/constants/lora'
import { useActiveLoraStack } from '@/hooks/use-active-lora-stack'
import { useCivitaiDownloadGate } from '@/hooks/use-civitai-download-gate'
import { useCivitaiLoraLibraryWithUrl } from '@/hooks/use-civitai-lora-library-url'
import { useLoadMoreOnScroll } from '@/hooks/use-load-more-on-scroll'
import {
  consumeLoraLibrarySearch,
  markLoraLibraryPickMounted,
  resetLoraLibraryAgent,
  useLoraLibraryAgent,
} from '@/hooks/use-lora-library-agent'
import { useLoraSearchHistory } from '@/hooks/use-lora-search-history'
import { listCivitaiLoraAssetsAPI } from '@/lib/api-client/lora-assets'
import { proxyCivitaiImageUrl } from '@/lib/civitai-image-url'
import { formatCompactNumber } from '@/lib/format-compact-number'
import { cn } from '@/lib/utils'
import type { CivitaiLoraLibraryItem, LoraAssetRecord } from '@/types'
import { Button } from '@/components/ui/button'

import { LoraLibraryDetailPage } from './LoraLibraryDetailPage'
import {
  LORA_CONTENT_TYPE_LABEL_KEYS,
  LORA_LIBRARY_FAMILY_LABEL_KEYS,
} from './lora-library-filter-labels'
import { LoraLibraryFilterCombobox } from './LoraLibraryFilterCombobox'
import { LoraLibrarySearchBox } from './LoraLibrarySearchBox'
import { LoraLibraryTile } from './LoraLibraryTile'
import { LoraLibraryTypeSparseCard } from './LoraLibraryTypeStates'

const NSFW_FILTER_LABEL_KEYS: Record<LoraNsfwFilter, string> = {
  unrestricted: 'nsfwFilterUnrestricted',
  nsfwOnly: 'nsfwFilterNsfwOnly',
  safe: 'nsfwFilterSafe',
}

/** 首屏还没有结果时铺几格占位（6 列 × 2 行）。 */
const SKELETON_TILES = 12

interface LoraLibraryBrowseProps {
  /** Civitai / Hugging Face 那颗分段（来源记在网址里，由上层持有）。 */
  sourceSwitch: ReactNode
  onFavorite: (item: CivitaiLoraLibraryItem) => Promise<LoraAssetRecord | null>
  onUnfavoriteByUrl: (loraUrl: string) => Promise<boolean>
  isFavorited: (loraUrl: string) => boolean
}

type Relaxation = {
  key: 'nsfw' | 'base' | 'type'
  label: string
  params: {
    nsfwFilter?: LoraNsfwFilter
    baseModel?: 'all'
    contentType?: typeof DEFAULT_LORA_CONTENT_TYPE
  }
}

/**
 * 库 B · Civitai（lora-library.md §3）：一行筛选 → 精确数量 → 自适应网格，往下滚着
 * 接；点卡升起详情页（§4），挂载留在原地。
 *
 * ⭐ 换筛选 / 搜新词：旧结果变淡到 42% 留在原地，新的第一段到了整批换掉 —— ⛔ 清成
 *   白屏、⛔ 转圈（hook 的 `accumulate`）。
 * ⭐ 挂载 = 过下载闸 → `push`，⛔ toast、⛔ 跳到生成台（左边竖条会多一张小封面）。
 * ⚠ 搜不到时给「放宽一项」，每颗带放宽以后的**真实**数量（只在结果为空时各问一次
 *   上游，⛔ 猜数）。
 */
export function LoraLibraryBrowse({
  sourceSwitch,
  onFavorite,
  onUnfavoriteByUrl,
  isFavorited,
}: LoraLibraryBrowseProps) {
  const t = useTranslations('LoraWorkbench')
  const tb = useTranslations('LoraWorkbench.browse')
  const format = useFormatter()
  const stack = useActiveLoraStack()
  const { ensureMountable } = useCivitaiDownloadGate()
  const library = useCivitaiLoraLibraryWithUrl({
    accumulate: true,
    pageSize: LORA_LIBRARY_BROWSE_PAGE_SIZE,
  })
  const searchHistory = useLoraSearchHistory()
  const agent = useLoraLibraryAgent()
  const [mountingId, setMountingId] = useState<string | null>(null)
  // 打开的详情页：存这一项本身（往下滚接了新的一段、或换了筛选，它都还在）。
  const [openItem, setOpenItem] = useState<CivitaiLoraLibraryItem | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  useLoadMoreOnScroll({
    scrollRef,
    sentinelRef,
    hasNextPage: library.hasNextPage,
    itemCount: library.items.length,
    loadMore: library.loadMore,
  })

  const rememberSearch = searchHistory.remember
  const handleSearchSubmit = useCallback(() => {
    library.submitSearch()
    rememberSearch(library.search)
  }, [library, rememberSearch])
  const handleHistoryPick = useCallback(
    (term: string) => {
      library.setSearch(term)
      library.commitSearchTerm(term)
      rememberSearch(term)
    },
    [library, rememberSearch],
  )

  /**
   * 助手当面搜（lora-assistant §13.2）：照「点一条搜索历史」那条路设词，再把底模
   * 筛选设成服务端这次用的那个值 —— 条件与服务端逐字相同，网格第一段就是助手挑选
   * 时看到的那一组。执行完清掉这一次请求（词与圈留着）。
   */
  const agentRequest = agent.request
  const { setSearch, commitSearchTerm, setBaseModel } = library
  useEffect(() => {
    if (!agentRequest) return
    setSearch(agentRequest.query)
    commitSearchTerm(agentRequest.query)
    setBaseModel(
      agentRequest.baseModel && isCivitaiLoraBaseModel(agentRequest.baseModel)
        ? agentRequest.baseModel
        : 'all',
    )
    consumeLoraLibrarySearch(agentRequest.nonce)
  }, [agentRequest, commitSearchTerm, setBaseModel, setSearch])

  /**
   * 你改了搜索词或任何一个筛选：结果已不是助手搜的那一组 —— 圈、小标、黑边一起撤。
   * ⚠ 筛选的基准在请求落到库页之后才记（搜词会把排序换回 Highest Rated）。
   */
  const filterKey = `${library.sort}|${library.nsfwFilter}|${library.contentType}`
  const agentFilterKey = useRef<string | null>(null)
  const agentActive = agent.query !== null
  const agentPending = agent.request !== null
  const matchesAgent =
    library.debouncedSearch === agent.query &&
    library.baseModel ===
      (agent.baseModel && isCivitaiLoraBaseModel(agent.baseModel)
        ? agent.baseModel
        : 'all')
  useEffect(() => {
    if (!agentActive) {
      agentFilterKey.current = null
      return
    }
    if (agentPending) return
    if (agentFilterKey.current === null) agentFilterKey.current = filterKey
    if (!matchesAgent || agentFilterKey.current !== filterKey) {
      resetLoraLibraryAgent()
    }
  }, [agentActive, agentPending, filterKey, matchesAgent])

  // 连版本号一起认：从收藏挂上的（收藏记录的 id / 链接写法）也算这一版已挂。
  const isMounted = useCallback(
    (item: CivitaiLoraLibraryItem) =>
      stack.items.some(
        (entry) =>
          entry.asset.id === item.id ||
          entry.asset.loraUrl === item.loraUrl ||
          (item.modelVersionId > 0 &&
            entry.asset.modelVersionId === item.modelVersionId),
      ),
    [stack.items],
  )
  const handleMount = useCallback(
    async (item: CivitaiLoraLibraryItem) => {
      if (isMounted(item) || mountingId) return
      setMountingId(item.id)
      try {
        // ⛔ 作者关了下载的挂上去只是陷阱——判据在下载闸里（与库 modal 同一份）。
        if (!(await ensureMountable(item))) return
        // 没有可用推理端点的家族：去 Civitai 站内出图，⛔ 挂上一个注定失败的。
        if (!isCivitaiBaseModelGeneratable(item.baseModelFamily)) {
          window.open(item.modelPageUrl, '_blank', 'noopener,noreferrer')
          toast.info(t('externalUseRedirect', { name: item.name }), {
            duration: LORA_TOAST_DURATION_MS,
          })
          return
        }
        stack.push(item)
        // 挂的是助手圈的那一把：那张撤圈，线程里落一行「你挂上了…」。
        markLoraLibraryPickMounted(item.id)
      } finally {
        setMountingId(null)
      }
    },
    [ensureMountable, isMounted, mountingId, stack, t],
  )
  const handleFavoriteToggle = useCallback(
    async (item: CivitaiLoraLibraryItem) => {
      if (isFavorited(item.loraUrl)) await onUnfavoriteByUrl(item.loraUrl)
      else await onFavorite(item)
    },
    [isFavorited, onFavorite, onUnfavoriteByUrl],
  )

  const typeOptions = useMemo(
    () =>
      LORA_CONTENT_TYPE_VALUES_BY_SOURCE[LORA_LIBRARY_SOURCES.CIVITAI].map(
        (value) => ({ value, label: t(LORA_CONTENT_TYPE_LABEL_KEYS[value]) }),
      ),
    [t],
  )
  const familyOptions = useMemo(
    () =>
      LORA_LIBRARY_FAMILY_VALUES_BY_SOURCE[LORA_LIBRARY_SOURCES.CIVITAI].map(
        (value) => ({ value, label: t(LORA_LIBRARY_FAMILY_LABEL_KEYS[value]) }),
      ),
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
  const sortOptions = useMemo(
    () =>
      CIVITAI_LORA_SORT_OPTIONS.map((option) => ({
        value: option.value as string,
        label: t(option.labelKey),
      })),
    [t],
  )

  const familySlug = civitaiBaseModelToFamilySlug(library.baseModel)
  const familyLabel =
    familyOptions.find((option) => option.value === familySlug)?.label ?? ''
  const typeLabel =
    typeOptions.find((option) => option.value === library.contentType)?.label ??
    ''
  const nsfwLabel = t(NSFW_FILTER_LABEL_KEYS[library.nsfwFilter])

  // 搜不到：能放宽的那几项（每项放宽以后的真实数量在下面问一次上游）。
  const relaxations = useMemo<Relaxation[]>(() => {
    const out: Relaxation[] = []
    if (library.nsfwFilter !== 'unrestricted') {
      out.push({
        key: 'nsfw',
        label: tb('relaxNsfw', { label: t('nsfwFilterUnrestricted') }),
        params: { nsfwFilter: 'unrestricted' },
      })
    }
    if (library.baseModel !== 'all') {
      out.push({
        key: 'base',
        label: tb('relaxBase', { label: familyLabel }),
        params: { baseModel: 'all' },
      })
    }
    if (library.contentType !== DEFAULT_LORA_CONTENT_TYPE) {
      out.push({
        key: 'type',
        label: tb('relaxType', { label: typeLabel }),
        params: { contentType: DEFAULT_LORA_CONTENT_TYPE },
      })
    }
    return out
  }, [
    familyLabel,
    library.baseModel,
    library.contentType,
    library.nsfwFilter,
    t,
    tb,
    typeLabel,
  ])
  const settledEmpty =
    !library.isLoading &&
    !library.isRevalidating &&
    library.items.length === 0 &&
    !library.error
  const queryKey = [
    library.debouncedSearch,
    library.baseModel,
    library.nsfwFilter,
    library.contentType,
    library.sort,
  ].join('|')
  const [relaxCounts, setRelaxCounts] = useState<{
    key: string
    counts: Partial<Record<Relaxation['key'], number | null>>
  } | null>(null)
  useEffect(() => {
    if (!settledEmpty || relaxations.length === 0) return
    const controller = new AbortController()
    void Promise.all(
      relaxations.map(async (relaxation) => {
        const response = await listCivitaiLoraAssetsAPI({
          page: 1,
          pageSize: 1,
          search: library.debouncedSearch || undefined,
          sort: library.sort,
          baseModel: library.baseModel,
          nsfwFilter: library.nsfwFilter,
          contentType: library.contentType,
          ...relaxation.params,
          signal: controller.signal,
        })
        return [
          relaxation.key,
          response.success && response.data ? response.data.total : null,
        ] as const
      }),
    ).then((entries) => {
      if (controller.signal.aborted) return
      setRelaxCounts({ key: queryKey, counts: Object.fromEntries(entries) })
    })
    return () => controller.abort()
  }, [
    library.baseModel,
    library.contentType,
    library.debouncedSearch,
    library.nsfwFilter,
    library.sort,
    queryKey,
    relaxations,
    settledEmpty,
  ])
  const applyRelaxation = (key: Relaxation['key']) => {
    if (key === 'nsfw') library.setNsfwFilter('unrestricted')
    else if (key === 'base') library.setBaseModel('all')
    else library.setContentType(DEFAULT_LORA_CONTENT_TYPE)
  }

  const searching =
    library.debouncedSearch !== '' && (library.isReplacing || library.isLoading)
  const hasPendingSearch =
    library.search.trim() !== library.debouncedSearch.trim()
  const shownTotal = library.total ?? library.items.length
  // 到了索引封顶就写「100,000+」（那不是精确数）。
  const totalLabel =
    shownTotal >= CIVITAI_SEARCH_TOTAL_HITS_CAP
      ? `${format.number(CIVITAI_SEARCH_TOTAL_HITS_CAP)}+`
      : format.number(shownTotal)
  const typeFallbackTerm =
    library.contentType !== 'all'
      ? getLoraContentTypeDefinition(library.contentType).searchFallbackTerm
      : null
  const scope = [
    t('librarySourceCivitai'),
    library.baseModel !== 'all' ? familyLabel : null,
    library.contentType !== DEFAULT_LORA_CONTENT_TYPE ? typeLabel : null,
    nsfwLabel,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* 一行筛选：搜索占满，其余按内容宽。 */}
      <div className="flex shrink-0 items-center gap-2 px-5 pt-4">
        <LoraLibrarySearchBox
          value={library.search}
          onChange={library.setSearch}
          onSubmit={handleSearchSubmit}
          onPickHistory={handleHistoryPick}
          history={searchHistory.history}
          onClearHistory={searchHistory.clear}
          pending={hasPendingSearch}
          searching={searching}
          placeholder={t('communitySearch')}
          agentLabel={
            agentActive && matchesAgent
              ? tb(searching ? 'agentSearching' : 'agentSearched')
              : null
          }
        />
        {sourceSwitch}
        <LoraLibraryFilterCombobox
          variant="bar"
          label={t('libraryTypeFilter')}
          ariaLabel={t('typeFilterLabel')}
          value={library.contentType}
          options={typeOptions}
          onChange={library.setContentType}
          changed={library.contentType !== DEFAULT_LORA_CONTENT_TYPE}
        />
        <LoraLibraryFilterCombobox
          variant="bar"
          label={t('libraryFamilyFilter')}
          ariaLabel={t('baseModelFilterLabel')}
          value={familySlug}
          options={familyOptions}
          onChange={(slug) =>
            library.setBaseModel(familySlugToCivitaiBaseModel(slug))
          }
          changed={library.baseModel !== 'all'}
          searchable
          searchPlaceholder={t('baseModelSearchPlaceholder')}
          emptyText={t('baseModelSearchEmpty')}
        />
        <LoraLibraryFilterCombobox
          variant="bar"
          label={tb('ratingLabel')}
          ariaLabel={t('nsfwToggleHint')}
          value={library.nsfwFilter}
          options={nsfwOptions}
          onChange={library.setNsfwFilter}
          changed={library.nsfwFilter !== DEFAULT_LORA_NSFW_FILTER}
        />
        <LoraLibraryFilterCombobox
          variant="bar"
          label={t('communitySortFilter')}
          ariaLabel={t('communitySortFilter')}
          value={library.sort}
          options={sortOptions}
          onChange={(value) => {
            if (isCivitaiLoraSort(value)) library.setSort(value)
          }}
          changed={library.sort !== 'Highest Rated'}
        />
      </div>

      {/* 过载：先给快照，一句话写明。 */}
      {library.isStale && library.staleFetchedAt ? (
        <div
          role="status"
          className="mx-5 mt-3 flex shrink-0 items-center gap-2 rounded-xl bg-status-warning-surface px-3 py-2 text-2sm text-status-warning"
        >
          <b className="font-semibold">{tb('staleTitle')}</b>
          <span className="min-w-0 truncate">
            {tb('staleBody', {
              time: format.relativeTime(new Date(library.staleFetchedAt)),
            })}
          </span>
          <span className="grow" />
          <button
            type="button"
            onClick={() => void library.refresh()}
            className="shrink-0 font-semibold hover:underline"
          >
            {tb('retry')}
          </button>
        </div>
      ) : null}

      {/* 数量一行：精确数；搜着的时候写在搜什么。 */}
      {settledEmpty ? null : (
        <p
          role="status"
          className="flex shrink-0 items-baseline gap-2.5 px-5 pb-2.5 pt-3 text-xs text-muted-foreground"
        >
          {searching ? (
            <span>{tb('searching', { query: library.debouncedSearch })}</span>
          ) : library.total !== null ? (
            <>
              <b className="text-sm font-semibold tabular-nums text-foreground">
                {totalLabel}
              </b>
              <span>
                {library.isStale && library.staleFetchedAt
                  ? tb('countUnitStale', {
                      count: library.total,
                      time: format.relativeTime(
                        new Date(library.staleFetchedAt),
                      ),
                    })
                  : tb('countUnit', { count: library.total })}
              </span>
            </>
          ) : null}
          {library.sortFellBackToRelevance ? (
            <span className="ml-auto" title={t('sortFallbackHint')}>
              {t('sortFallbackLabel')}
            </span>
          ) : null}
        </p>
      )}

      <div
        ref={scrollRef}
        aria-busy={library.isRevalidating}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-5"
      >
        {library.isLoading ? (
          <div className="lora-lib-grid" aria-hidden>
            {Array.from({ length: SKELETON_TILES }, (_, index) => (
              <div key={index} className="flex flex-col gap-1.5">
                <span className="block aspect-3/4 rounded-xl bg-muted" />
                <span className="h-2.5 w-3/4 rounded bg-muted" />
                <span className="h-2.5 w-1/2 rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : library.error && library.items.length === 0 ? (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-status-risk-surface px-3.5 py-3 text-xs text-status-risk">
            <span className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
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
        ) : settledEmpty ? (
          <div className="grid h-full place-items-center">
            <div className="flex max-w-115 flex-col items-center gap-2.5 text-center">
              <h4 className="text-base font-semibold text-foreground">
                {library.debouncedSearch
                  ? tb('emptyTitle', { query: library.debouncedSearch })
                  : tb('emptyTitleNoQuery')}
              </h4>
              <p className="text-2sm leading-5 text-muted-foreground">
                {relaxations.length > 0
                  ? tb('emptyBody', { scope })
                  : tb('emptyBodyNoRelax', { scope })}
              </p>
              {relaxations.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap justify-center gap-2">
                  {relaxations.map((relaxation) => {
                    const count =
                      relaxCounts?.key === queryKey
                        ? relaxCounts.counts[relaxation.key]
                        : undefined
                    return (
                      <button
                        key={relaxation.key}
                        type="button"
                        onClick={() => applyRelaxation(relaxation.key)}
                        className="inline-flex h-8.5 items-center gap-1.5 rounded-full border border-border px-3.25 text-2sm text-foreground transition-colors duration-fast ease-linear hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {relaxation.label}
                        {count !== undefined && count !== null ? (
                          <small className="font-mono text-2xs text-muted-foreground">
                            {tb('relaxCount', { count })}
                          </small>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <div
              className={cn(
                'lora-lib-grid transition-opacity duration-base ease-linear',
                library.isReplacing && 'opacity-42',
              )}
            >
              {library.items.map((item) => {
                const cover =
                  item.cardImageUrl ?? item.thumbImageUrl ?? item.coverImageUrl
                return (
                  <div
                    key={item.id}
                    className="animate-in fade-in duration-base ease-linear motion-reduce:animate-none"
                  >
                    <LoraLibraryTile
                      name={item.name}
                      meta={`↓ ${formatCompactNumber(item.downloadCount)} · ♥ ${formatCompactNumber(item.thumbsUpCount)}`}
                      coverUrl={cover ? proxyCivitaiImageUrl(cover) : null}
                      coverColor={item.coverColor ?? null}
                      mounted={isMounted(item)}
                      mounting={mountingId === item.id}
                      agentPick={
                        !isMounted(item) &&
                        agent.picks.some((pick) => pick.candidateId === item.id)
                      }
                      onOpen={() => setOpenItem(item)}
                      onMount={() => void handleMount(item)}
                    />
                  </div>
                )
              })}
            </div>
            {library.contentType !== DEFAULT_LORA_CONTENT_TYPE &&
            library.items.length <= 5 &&
            typeFallbackTerm ? (
              <div className="mt-4">
                <LoraLibraryTypeSparseCard
                  source={LORA_LIBRARY_SOURCES.CIVITAI}
                  searchFallbackTerm={typeFallbackTerm}
                  onSearchFallback={() => {
                    library.setSearch(typeFallbackTerm)
                    library.commitSearchTerm(typeFallbackTerm)
                    rememberSearch(typeFallbackTerm)
                    library.setContentType(DEFAULT_LORA_CONTENT_TYPE)
                  }}
                />
              </div>
            ) : null}
            {library.isLoadingMore ? (
              <p
                role="status"
                className="flex items-center justify-center gap-2 pb-5.5 pt-4.5 text-xs text-muted-foreground"
              >
                <span
                  aria-hidden
                  className="lora-breath size-1.5 rounded-full bg-foreground"
                />
                {tb('loadingMore', {
                  shown: format.number(library.items.length),
                  total: totalLabel,
                })}
              </p>
            ) : !library.hasNextPage ? (
              <p className="flex items-center gap-2.5 pb-6.5 pt-5.5 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
                {tb('end', { count: totalLabel })}
              </p>
            ) : (
              <div className="h-6" />
            )}
            <div ref={sentinelRef} aria-hidden className="h-px" />
          </>
        )}
      </div>

      {/* 详情是一页：从下面升上来盖住库，关上回到原来滚到的位置（列表没动过）。 */}
      <AnimatePresence>
        {openItem ? (
          <LoraLibraryDetailPage
            key={openItem.id}
            item={openItem}
            isMounted={isMounted}
            mountingId={mountingId}
            onMount={(target) => void handleMount(target)}
            isFavorited={(target) => isFavorited(target.loraUrl)}
            onToggleFavorite={(target) => void handleFavoriteToggle(target)}
            nsfwFilter={library.nsfwFilter}
            onClose={() => setOpenItem(null)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  )
}
