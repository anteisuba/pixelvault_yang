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
  DEFAULT_LORA_CONTENT_TYPE,
  DEFAULT_LORA_NSFW_FILTER,
  LORA_CONTENT_TYPE_VALUES_BY_SOURCE,
  LORA_LIBRARY_BROWSE_PAGE_SIZE,
  LORA_LIBRARY_DETAIL_PARAM,
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
import {
  useSendRecipeToLoraBench,
  useSendToLoraBench,
} from '@/contexts/studio-library-pick'
import { useActiveLoraStack } from '@/features/lora/hooks/use-active-lora-stack'
import { useCivitaiDownloadGate } from '@/features/lora/hooks/use-civitai-download-gate'
import { useCivitaiLoraLibraryWithUrl } from '@/features/lora/hooks/use-civitai-lora-library-url'
import { useLibraryQuery } from '@/hooks/use-library-query'
import { useLoadMoreOnScroll } from '@/hooks/use-load-more-on-scroll'
import {
  consumeLoraLibrarySearch,
  markLoraLibraryPickMounted,
  resetLoraLibraryAgent,
  useLoraLibraryAgent,
} from '@/features/lora/hooks/use-lora-library-agent'
import { useHandMentionToAssistant } from '@/features/assistant/hooks'
import { useLoraSearchHistory } from '@/features/lora/hooks/use-lora-search-history'
import {
  listCivitaiLoraAssetsAPI,
  resolveCivitaiLoraAPI,
} from '@/lib/api-client/lora-assets'
import {
  parseCivitaiLibraryItemId,
  resolvedAssetToLibraryItem,
} from '@/features/lora/lib/lora-asset-library-item'
import { proxyCivitaiImageUrl } from '@/features/lora/lib/civitai-image-url'
import { formatCompactNumber } from '@/lib/format-compact-number'
import { cn } from '@/lib/utils'
import type {
  CivitaiImageRecipe,
  CivitaiLoraLibraryItem,
  CivitaiRecipeExtraLora,
  LoraAssetRecord,
} from '@/types'
import { Button } from '@/components/ui/button'
import { LIBRARY_GRID_CLASS, LibraryToolbar } from '@/components/ui/library-kit'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'

import { LoraLibraryDetailPage } from './LoraLibraryDetailPage'
import {
  formatLibraryTotal,
  LORA_CONTENT_TYPE_LABEL_KEYS,
  LORA_LIBRARY_FAMILY_LABEL_KEYS,
} from './lora-library-filter-labels'
import { LoraLibraryFilterCombobox } from './LoraLibraryFilterCombobox'
import { LoraLibrarySearchBox } from './LoraLibrarySearchBox'
import { LoraLibrarySkeletonGrid } from './LoraLibrarySkeleton'
import { LoraLibraryTile, loraMention } from './LoraLibraryTile'
import { LoraLibraryTypeSparseCard } from './LoraLibraryTypeStates'

const NSFW_FILTER_LABEL_KEYS: Record<LoraNsfwFilter, string> = {
  unrestricted: 'nsfwFilterUnrestricted',
  nsfwOnly: 'nsfwFilterNsfwOnly',
  safe: 'nsfwFilterSafe',
}

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
 * ⭐ 挂载 = 过下载闸 → `push`；台没开时「去 LoRA 台用」跳过去，「已挂上」由台落地后说。
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
  const sendToBench = useSendToLoraBench()
  const sendRecipe = useSendRecipeToLoraBench()
  const { ensureMountable } = useCivitaiDownloadGate()
  const library = useCivitaiLoraLibraryWithUrl({
    accumulate: true,
    pageSize: LORA_LIBRARY_BROWSE_PAGE_SIZE,
  })
  const searchHistory = useLoraSearchHistory()
  const agent = useLoraLibraryAgent()
  const hand = useHandMentionToAssistant()
  const [mountingId, setMountingId] = useState<string | null>(null)
  // 打开的详情页记在网址里（`?lora=<条目 id>`，刷新 / 分享回到它、浏览器后退关掉它）；
  // 条目本身另存一份（往下滚接了新的一段、或换了筛选，它都还在）。
  const query = useLibraryQuery()
  const openKey = query.params.get(LORA_LIBRARY_DETAIL_PARAM)
  const [opened, setOpened] = useState<{
    key: string
    item: CivitaiLoraLibraryItem
  } | null>(null)
  /** 这一次是点开的（记了一步历史）：关的时候后退，⛔ 再叠一步。 */
  const pushedKeyRef = useRef<string | null>(null)
  const openItem = openKey
    ? opened?.key === openKey
      ? opened.item
      : (library.items.find((item) => item.id === openKey) ?? null)
    : null
  const openDetail = useCallback(
    (item: CivitaiLoraLibraryItem) => {
      setOpened({ key: item.id, item })
      const params = new URLSearchParams(query.params.toString())
      params.set(LORA_LIBRARY_DETAIL_PARAM, item.id)
      pushedKeyRef.current = item.id
      query.push(params)
    },
    [query],
  )
  const closeDetail = useCallback(() => {
    if (query.back && pushedKeyRef.current === openKey) {
      pushedKeyRef.current = null
      query.back()
      return
    }
    pushedKeyRef.current = null
    const params = new URLSearchParams(query.params.toString())
    params.delete(LORA_LIBRARY_DETAIL_PARAM)
    query.replace(params)
  }, [openKey, query])
  // 刷新 / 贴来的链接：列表里没有这一把就按版本号取回来（取不到 = 去掉参数、说一声）。
  const missingKey = openKey && !openItem && !library.isLoading ? openKey : null
  const { replace: replaceQuery, params: queryParams } = query
  useEffect(() => {
    if (!missingKey) return
    const ids = parseCivitaiLibraryItemId(missingKey)
    const controller = new AbortController()
    const dropParam = () => {
      const params = new URLSearchParams(queryParams.toString())
      params.delete(LORA_LIBRARY_DETAIL_PARAM)
      replaceQuery(params)
      toast.info(tb('detailNotFound'), { duration: LORA_TOAST_DURATION_MS })
    }
    if (!ids) {
      dropParam()
      return
    }
    void resolveCivitaiLoraAPI({ modelVersionId: ids.modelVersionId }).then(
      (response) => {
        if (controller.signal.aborted) return
        if (!response.success || !response.data) {
          dropParam()
          return
        }
        const item = resolvedAssetToLibraryItem(response.data)
        setOpened({
          key: missingKey,
          item: { ...item, modelId: item.modelId || ids.modelId },
        })
      },
    )
    return () => controller.abort()
  }, [missingKey, queryParams, replaceQuery, tb])
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
  const mountedEntry = useCallback(
    (item: CivitaiLoraLibraryItem) =>
      stack.items.find(
        (entry) =>
          entry.asset.id === item.id ||
          entry.asset.loraUrl === item.loraUrl ||
          (item.modelVersionId > 0 &&
            entry.asset.modelVersionId === item.modelVersionId),
      ) ?? null,
    [stack.items],
  )
  const isMounted = useCallback(
    (item: CivitaiLoraLibraryItem) => mountedEntry(item) !== null,
    [mountedEntry],
  )
  /**
   * 挂上这一把：过下载闸、能出图的家族才挂。返回挂载栈里那一把的 id 与是不是这一下才挂上的；
   * 挂不上（闸拦了 / 去 Civitai 站内出图）= `null`。
   */
  const mountItem = useCallback(
    async (
      item: CivitaiLoraLibraryItem,
    ): Promise<{ assetId: string; newlyMounted: boolean } | null> => {
      const existing = mountedEntry(item)
      if (existing) return { assetId: existing.asset.id, newlyMounted: false }
      // ⛔ 作者关了下载的挂上去只是陷阱——判据在下载闸里（与库 modal 同一份）。
      if (!(await ensureMountable(item))) return null
      // 没有可用推理端点的家族：去 Civitai 站内出图，⛔ 挂上一个注定失败的。
      if (!isCivitaiBaseModelGeneratable(item.baseModelFamily)) {
        window.open(item.modelPageUrl, '_blank', 'noopener,noreferrer')
        toast.info(t('externalUseRedirect', { name: item.name }), {
          duration: LORA_TOAST_DURATION_MS,
        })
        return null
      }
      stack.push(item)
      // 挂的是助手圈的那一把：那张撤圈，线程里落一行「你挂上了…」。
      markLoraLibraryPickMounted(item.id)
      return { assetId: item.id, newlyMounted: true }
    },
    [ensureMountable, mountedEntry, stack, t],
  )
  const handleMount = useCallback(
    async (item: CivitaiLoraLibraryItem) => {
      if (mountingId) return
      setMountingId(item.id)
      try {
        const mounted = await mountItem(item)
        // 台没开：去台上，台落地后说「已挂上 XXX」（带撤销与触发词）。台开着留在原地。
        if (mounted) sendToBench?.(mounted)
      } finally {
        setMountingId(null)
      }
    },
    [mountItem, mountingId, sendToBench],
  )
  /** 「用这张的配方」：挂上这一把，带着这张的配方去台上走「做同款」。 */
  const handleUseRecipe = useCallback(
    async (
      item: CivitaiLoraLibraryItem,
      recipe: CivitaiImageRecipe,
      includeSeed: boolean,
      extraLoras: readonly CivitaiRecipeExtraLora[],
    ) => {
      if (mountingId || !sendRecipe) return
      setMountingId(item.id)
      try {
        const mounted = await mountItem(item)
        if (mounted) {
          sendRecipe({
            ...mounted,
            recipe: { recipe, includeSeed, extraLoras },
          })
        }
      } finally {
        setMountingId(null)
      }
    },
    [mountItem, mountingId, sendRecipe],
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
  const totalLabel = formatLibraryTotal(
    format,
    library.total ?? library.items.length,
    library.totalCapped,
  )
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

  const renderTile = (item: CivitaiLoraLibraryItem) => {
    const cover = item.cardImageUrl ?? item.thumbImageUrl ?? item.coverImageUrl
    return (
      <LoraLibraryTile
        name={item.name}
        meta={`${item.baseModelFamily} · ↓ ${formatCompactNumber(item.downloadCount)}`}
        coverUrl={cover ? proxyCivitaiImageUrl(cover) : null}
        coverColor={item.coverColor ?? null}
        coverVideoUrl={item.cardVideoUrl ?? null}
        coverVideoActive={openItem === null}
        mounted={isMounted(item)}
        mounting={mountingId === item.id}
        agentPick={
          !isMounted(item) &&
          agent.picks.some((pick) => pick.candidateId === item.id)
        }
        onOpen={() => openDetail(item)}
        onMount={() => handleMount(item)}
        pickId={item.id}
        favorite={{
          saved: isFavorited(item.loraUrl),
          onToggle: () => void handleFavoriteToggle(item),
        }}
        onHandToAssistant={hand ? () => hand(loraMention(item)) : undefined}
      />
    )
  }

  // 结果分段（lora-library.md §3）：字面命中 → 纠错/现查 → 意思接近，后两段各带一条分隔线说明。
  const segments = library.debouncedSearch ? library.segments : null
  const resultGroups: {
    key: string
    label: string | null
    items: CivitaiLoraLibraryItem[]
  }[] = []
  if (!segments) {
    resultGroups.push({ key: 'all', label: null, items: library.items })
  } else {
    const fallbackEnd = segments.literalTotal + (segments.fallback?.total ?? 0)
    const literal = library.items.slice(0, segments.literalTotal)
    const fallback = library.items.slice(segments.literalTotal, fallbackEnd)
    const meaning = library.items.slice(fallbackEnd)
    if (literal.length > 0) {
      resultGroups.push({ key: 'literal', label: null, items: literal })
    }
    if (segments.fallback && fallback.length > 0) {
      const count = format.number(segments.fallback.total)
      resultGroups.push({
        key: 'fallback',
        label:
          segments.fallback.kind === 'corrected'
            ? tb('segmentCorrected', {
                query: library.debouncedSearch,
                corrected: segments.fallback.query,
                count,
              })
            : tb('segmentLive', { count }),
        items: fallback,
      })
    }
    if (meaning.length > 0) {
      resultGroups.push({
        key: 'meaning',
        label: tb('segmentMeaning'),
        items: meaning,
      })
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* 顶上一行（ui-spec §9）：搜索 · 底模 · 分级 · 来源 ……… 排序；下面类型切换条。 */}
      <div className="flex shrink-0 flex-col gap-3 pb-3">
        <LibraryToolbar
          search={
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
          }
          pills={
            <>
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
              {sourceSwitch}
            </>
          }
          end={
            <LoraLibraryFilterCombobox
              variant="bar"
              label={t('communitySortFilter')}
              ariaLabel={t('communitySortFilter')}
              value={library.sort}
              options={sortOptions}
              onChange={(value) => {
                if (isCivitaiLoraSort(value)) library.setSort(value)
              }}
              changed
            />
          }
        />
        <div className="flex">
          <LiquidSegmented
            ariaLabel={t('typeFilterLabel')}
            value={library.contentType}
            items={typeOptions}
            onChange={library.setContentType}
          />
        </div>
      </div>

      <div
        ref={scrollRef}
        aria-busy={library.isRevalidating}
        // `pt-1`：助手推荐那圈外扩 4px（2 白 + 2 黑），顶上不留这一截第一排会被裁掉。
        className="@container relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pt-1"
      >
        {library.isLoading ? (
          <LoraLibrarySkeletonGrid />
        ) : library.error && library.items.length === 0 ? (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-status-risk-surface px-3.5 py-3 text-xs text-status-risk">
            <span className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {t('communityLoadFailed')}
            </span>
            <Button
              type="button"
              variant="secondary"
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
            {resultGroups.map((group) => (
              <section key={group.key} className="contents">
                {group.label ? (
                  <p className="flex items-center gap-2.5 pb-3 pt-5 text-xs text-muted-foreground before:h-px before:w-6 before:bg-border after:h-px after:flex-1 after:bg-border">
                    {group.label}
                  </p>
                ) : null}
                <div
                  className={cn(
                    LIBRARY_GRID_CLASS,
                    'transition-opacity duration-base ease-linear',
                    library.isReplacing && 'opacity-42',
                  )}
                >
                  {group.items.map((item) => (
                    <div
                      key={item.id}
                      className="animate-in fade-in duration-base ease-linear motion-reduce:animate-none"
                    >
                      {renderTile(item)}
                    </div>
                  ))}
                </div>
              </section>
            ))}
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
            onUseRecipe={
              sendRecipe
                ? (target, recipe, includeSeed, extraLoras) =>
                    void handleUseRecipe(
                      target,
                      recipe,
                      includeSeed,
                      extraLoras,
                    )
                : undefined
            }
            onClose={closeDetail}
          />
        ) : null}
      </AnimatePresence>
    </div>
  )
}
