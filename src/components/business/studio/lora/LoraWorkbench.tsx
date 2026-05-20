'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useSearchParams } from 'next/navigation'
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Compass,
  Download,
  ExternalLink,
  GraduationCap,
  Heart,
  History,
  Library,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  CIVITAI_LORA_BASE_MODEL_VALUES,
  CIVITAI_LORA_SORT_OPTIONS,
  DEFAULT_LORA_WORKBENCH_SECTION,
  LORA_WORKBENCH_SEARCH_PARAM,
  LORA_WORKBENCH_SECTIONS,
  isCivitaiBaseModelGeneratable,
  isCivitaiLoraBaseModel,
  isCivitaiLoraSort,
  isLoraWorkbenchSection,
  type CivitaiLoraBaseModel,
  type LoraWorkbenchSection,
} from '@/constants/lora'
import { ROUTES } from '@/constants/routes'
import { usePathname, useRouter } from '@/i18n/navigation'
import type { CivitaiLoraLibraryItem, LoraAssetRecord } from '@/types'
import { useActiveLoraStack } from '@/hooks/use-active-lora-stack'
import { useCivitaiLoraLibrary } from '@/hooks/use-civitai-lora-library'
import { useLoraAssets } from '@/hooks/use-lora-assets'
import {
  LoraTrainingForm,
  LoraTrainingHistorySidebar,
} from '@/components/business/LoraTrainingDialog'
import {
  LoraAssetCard,
  isRecentlyTrained,
} from '@/components/business/studio/lora/LoraAssetCard'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  clearSearchHistory,
  readSearchHistory,
  recordSearchTerm,
} from '@/lib/civitai-search-history'
import { buildLoraPromptTemplate } from '@/lib/lora-prompt-template'
import { deferEffectTask } from '@/lib/defer-effect-task'
import { cn } from '@/lib/utils'

export function LoraWorkbench() {
  const t = useTranslations('LoraWorkbench')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const {
    trainedAssets,
    favoriteAssets,
    isLoadingMine,
    errorMine,
    refresh,
    setVisibility,
    favoriteCivitaiLora,
    unfavoriteAsset,
    unfavoriteByUrl,
    isFavorited,
  } = useLoraAssets()

  const sectionParam = searchParams.get(LORA_WORKBENCH_SEARCH_PARAM)
  const activeSection = isLoraWorkbenchSection(sectionParam)
    ? sectionParam
    : DEFAULT_LORA_WORKBENCH_SECTION

  const setActiveSection = useCallback(
    (nextSection: LoraWorkbenchSection) => {
      const params = new URLSearchParams(searchParams.toString())
      if (nextSection === DEFAULT_LORA_WORKBENCH_SECTION) {
        params.delete(LORA_WORKBENCH_SEARCH_PARAM)
      } else {
        params.set(LORA_WORKBENCH_SEARCH_PARAM, nextSection)
      }
      const query = params.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      })
    },
    [pathname, router, searchParams],
  )

  const handleTabChange = useCallback(
    (value: string) => {
      if (isLoraWorkbenchSection(value)) {
        setActiveSection(value)
      }
    },
    [setActiveSection],
  )

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      <Tabs value={activeSection} onValueChange={handleTabChange}>
        <TabsList className="grid h-9 w-full grid-cols-3 bg-muted/40 sm:inline-grid sm:w-auto">
          <TabsTrigger
            value={LORA_WORKBENCH_SECTIONS.MINE}
            className="h-7 px-3 text-xs"
          >
            <Library className="size-3.5" aria-hidden />
            {t('tabs.mine')}
          </TabsTrigger>
          <TabsTrigger
            value={LORA_WORKBENCH_SECTIONS.TRAIN}
            className="h-7 px-3 text-xs"
          >
            <GraduationCap className="size-3.5" aria-hidden />
            {t('tabs.train')}
          </TabsTrigger>
          <TabsTrigger
            value={LORA_WORKBENCH_SECTIONS.COMMUNITY}
            className="h-7 px-3 text-xs"
          >
            <Compass className="size-3.5" aria-hidden />
            {t('tabs.community')}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {activeSection === LORA_WORKBENCH_SECTIONS.TRAIN ? (
        <TrainingBranch />
      ) : null}

      {activeSection === LORA_WORKBENCH_SECTIONS.MINE ? (
        <MyLoraBranch
          trained={trainedAssets}
          favorites={favoriteAssets}
          isLoading={isLoadingMine}
          error={errorMine}
          onRefresh={refresh}
          onSwitchSection={setActiveSection}
          onVisibilityChange={setVisibility}
          onUnfavorite={unfavoriteAsset}
        />
      ) : null}

      {activeSection === LORA_WORKBENCH_SECTIONS.COMMUNITY ? (
        <CivitaiCommunityBranch
          onFavorite={favoriteCivitaiLora}
          onUnfavoriteByUrl={unfavoriteByUrl}
          isFavorited={isFavorited}
        />
      ) : null}
    </div>
  )
}

type MineSort = 'newest' | 'oldest' | 'nameAsc'

interface MyLoraBranchProps {
  trained: LoraAssetRecord[]
  favorites: LoraAssetRecord[]
  isLoading: boolean
  error: string | null
  onRefresh: () => Promise<void>
  onSwitchSection: (section: LoraWorkbenchSection) => void
  onVisibilityChange: (assetId: string, isPublic: boolean) => Promise<boolean>
  onUnfavorite: (assetId: string) => Promise<boolean>
}

function MyLoraBranch({
  trained,
  favorites,
  isLoading,
  error,
  onRefresh,
  onSwitchSection,
  onVisibilityChange,
  onUnfavorite,
}: MyLoraBranchProps) {
  const t = useTranslations('LoraWorkbench')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<MineSort>('newest')

  const totalCount = trained.length + favorites.length

  // 「最近训练完成」hero strip — 7 天内 source==='trained' 最新一个。
  // 把训练 → 使用闭环从 3 步压成 1 步：从 train tab 跳回 mine tab
  // 的用户第一眼看到自己刚做的东西，旁边一个大按钮直达 Studio。
  // 始终从原始 trained 数组算（忽略当前 search/sort 状态），
  // 不然搜索过滤后会把刚训完的隐藏掉。
  const recentlyTrained = useMemo(() => {
    const fresh = trained
      .filter(isRecentlyTrained)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
    return fresh[0] ?? null
  }, [trained])

  const { filteredTrained, filteredFavorites } = useMemo(() => {
    const trimmedQuery = query.trim().toLowerCase()
    const matchQuery = (a: LoraAssetRecord) =>
      !trimmedQuery ||
      a.name.toLowerCase().includes(trimmedQuery) ||
      a.triggerWord.toLowerCase().includes(trimmedQuery)

    const sortFn = (a: LoraAssetRecord, b: LoraAssetRecord) => {
      switch (sort) {
        case 'oldest':
          return (
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          )
        case 'nameAsc':
          return a.name.localeCompare(b.name)
        case 'newest':
        default:
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
      }
    }

    return {
      filteredTrained: trained.filter(matchQuery).sort(sortFn),
      filteredFavorites: favorites.filter(matchQuery).sort(sortFn),
    }
  }, [trained, favorites, query, sort])

  const hasSearchHit =
    !query.trim() || filteredTrained.length + filteredFavorites.length > 0

  return (
    <section className="space-y-6">
      <MineHeader
        totalCount={totalCount}
        isLoading={isLoading}
        onRefresh={onRefresh}
      />

      {error ? (
        <ErrorBlock error={error} onRetry={onRefresh} />
      ) : isLoading ? (
        <SkeletonGrid />
      ) : totalCount === 0 ? (
        <EmptyHero onSwitchSection={onSwitchSection} />
      ) : (
        <>
          {recentlyTrained ? (
            <RecentlyTrainedStrip asset={recentlyTrained} />
          ) : null}

          <MineToolbar
            query={query}
            onQueryChange={setQuery}
            sort={sort}
            onSortChange={setSort}
          />

          {!hasSearchHit ? (
            <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 px-6 py-10 text-center text-sm text-muted-foreground">
              {t('myLorasSearchEmpty', { query: query.trim() })}
            </div>
          ) : (
            <>
              <AssetSection
                title={t('myLorasTrainedSection')}
                count={filteredTrained.length}
                originalCount={trained.length}
              >
                {filteredTrained.length === 0 && trained.length === 0 ? (
                  <EmptyHint text={t('myLorasEmpty')} />
                ) : filteredTrained.length === 0 ? null : (
                  <AssetGrid>
                    {filteredTrained.map((asset) => (
                      <LoraAssetCard
                        key={asset.id}
                        asset={asset}
                        showVisibilityToggle={asset.isOwn}
                        onVisibilityChange={onVisibilityChange}
                      />
                    ))}
                  </AssetGrid>
                )}
              </AssetSection>

              <AssetSection
                title={t('myLorasFavoritesSection')}
                count={filteredFavorites.length}
                originalCount={favorites.length}
              >
                {filteredFavorites.length === 0 && favorites.length === 0 ? (
                  <EmptyHint text={t('myLorasFavoritesEmpty')} />
                ) : filteredFavorites.length === 0 ? null : (
                  <AssetGrid>
                    {filteredFavorites.map((asset) => (
                      <LoraAssetCard
                        key={asset.id}
                        asset={asset}
                        onUnfavorite={onUnfavorite}
                      />
                    ))}
                  </AssetGrid>
                )}
              </AssetSection>
            </>
          )}
        </>
      )}
    </section>
  )
}

interface MineHeaderProps {
  totalCount: number
  isLoading: boolean
  onRefresh: () => Promise<void>
}

function MineHeader({ totalCount, isLoading, onRefresh }: MineHeaderProps) {
  const t = useTranslations('LoraWorkbench')
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        <div className="flex items-baseline gap-2">
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            {t('myLorasTitle')}
          </h2>
          {!isLoading && totalCount > 0 ? (
            <span className="text-sm tabular-nums text-muted-foreground">
              {totalCount}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">{t('myLorasSubtitle')}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => void onRefresh()}
        disabled={isLoading}
        className="shrink-0 self-start sm:self-auto"
      >
        <RefreshCw
          className={cn('size-3.5', isLoading && 'animate-spin')}
          aria-hidden
        />
        {t('refresh')}
      </Button>
    </header>
  )
}

interface MineToolbarProps {
  query: string
  onQueryChange: (next: string) => void
  sort: MineSort
  onSortChange: (next: MineSort) => void
}

function MineToolbar({
  query,
  onQueryChange,
  sort,
  onSortChange,
}: MineToolbarProps) {
  const t = useTranslations('LoraWorkbench')

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative min-w-0 flex-1">
        <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={t('myLorasSearchPlaceholder')}
          className="h-9 pl-9 pr-9 text-xs"
        />
        {query ? (
          <button
            type="button"
            onClick={() => onQueryChange('')}
            className="absolute right-2 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="clear"
          >
            <X className="size-3" aria-hidden />
          </button>
        ) : null}
      </div>
      <Select value={sort} onValueChange={(v) => onSortChange(v as MineSort)}>
        <SelectTrigger
          size="sm"
          className="w-full border-border/60 text-xs sm:w-40"
          aria-label={t('myLorasSortLabel')}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="newest">{t('myLorasSortNewest')}</SelectItem>
          <SelectItem value="oldest">{t('myLorasSortOldest')}</SelectItem>
          <SelectItem value="nameAsc">{t('myLorasSortNameAsc')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

interface ErrorBlockProps {
  error: string
  onRetry: () => Promise<void>
}

function ErrorBlock({ error, onRetry }: ErrorBlockProps) {
  const t = useTranslations('LoraWorkbench')
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
      <AlertCircle
        className="mt-0.5 size-4 shrink-0 text-destructive"
        aria-hidden
      />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium text-foreground">
          {t('myLorasErrorTitle')}
        </p>
        <p className="text-xs text-muted-foreground">{error}</p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void onRetry()}
        className="shrink-0"
      >
        <RefreshCw className="size-3.5" aria-hidden />
        {t('myLorasErrorRetry')}
      </Button>
    </div>
  )
}

function SkeletonGrid() {
  // 8 张 skeleton card — 模拟 trained + favorites 各 4 张的常见形态，
  // 让用户对「内容长什么样」有视觉预期，比空 spinner 体感专业。
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="h-5 w-24 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={`s-trained-${i}`} />
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <div className="h-5 w-24 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={`s-fav-${i}`} />
          ))}
        </div>
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
      <div className="aspect-square animate-pulse bg-muted" />
      <div className="space-y-2 p-3">
        <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted/70" />
        <div className="h-7 w-full animate-pulse rounded bg-muted/60" />
      </div>
    </div>
  )
}

interface EmptyHeroProps {
  onSwitchSection: (section: LoraWorkbenchSection) => void
}

function EmptyHero({ onSwitchSection }: EmptyHeroProps) {
  const t = useTranslations('LoraWorkbench')
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-primary/5 via-card to-card px-6 py-14 text-center sm:px-12 sm:py-20 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* 抽象装饰 — 大圈柔光在右上，配合品牌色，给空状态一点温度，
          不抢主视觉。fixed 单层渐变，不是 AI slop 的 floating blob 阵。 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-24 size-64 rounded-full bg-primary/5 blur-3xl"
      />

      <div className="relative mx-auto flex max-w-lg flex-col items-center gap-4">
        <div className="inline-flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
          <Sparkles className="size-7" strokeWidth={1.5} />
        </div>

        <div className="space-y-2">
          <h3 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {t('myLorasEmptyTitle')}
          </h3>
          <p className="text-sm text-muted-foreground sm:text-base">
            {t('myLorasEmptyDescription')}
          </p>
        </div>

        <div className="mt-2 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <Button
            type="button"
            size="lg"
            onClick={() => onSwitchSection(LORA_WORKBENCH_SECTIONS.TRAIN)}
            className="gap-2"
          >
            <Sparkles className="size-4" aria-hidden />
            {t('myLorasEmptyCtaTrain')}
          </Button>
          <Button
            type="button"
            size="lg"
            variant="outline"
            onClick={() => onSwitchSection(LORA_WORKBENCH_SECTIONS.COMMUNITY)}
            className="gap-2"
          >
            <Compass className="size-4" aria-hidden />
            {t('myLorasEmptyCtaBrowse')}
          </Button>
        </div>
      </div>
    </div>
  )
}

interface RecentlyTrainedStripProps {
  asset: LoraAssetRecord
}

function RecentlyTrainedStrip({ asset }: RecentlyTrainedStripProps) {
  const t = useTranslations('LoraWorkbench')
  const tStack = useTranslations('LoraStack')
  const router = useRouter()
  const pathname = usePathname()
  const stack = useActiveLoraStack()

  const alreadyInStack = stack.items.some(
    (entry) => entry.asset.id === asset.id,
  )

  const handleUse = useCallback(() => {
    if (!alreadyInStack) stack.push(asset)
    if (pathname === ROUTES.STUDIO_IMAGE) {
      toast.success(tStack('alreadyHere', { name: asset.name }))
      return
    }
    toast.success(t('addedToStack', { name: asset.name }))
    router.push(ROUTES.STUDIO_IMAGE)
  }, [alreadyInStack, asset, pathname, stack, router, t, tStack])

  return (
    <div className="relative flex items-center gap-3 overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-3 animate-in fade-in slide-in-from-top-2 duration-500 sm:gap-4 sm:p-4">
      <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-muted ring-1 ring-primary/20 sm:size-20">
        {asset.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.coverImageUrl}
            alt={asset.name}
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-primary">
            <Sparkles className="size-6" aria-hidden />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-2xs font-medium uppercase tracking-wide text-primary-foreground">
            <Sparkles className="size-2.5 fill-current" aria-hidden />
            {t('recentlyTrainedBadge')}
          </span>
        </div>
        <p className="truncate font-display text-base font-semibold tracking-tight text-foreground sm:text-lg">
          {asset.name}
        </p>
        <p className="hidden truncate text-xs text-muted-foreground sm:block">
          {t('recentlyTrainedSubtitle')} ·{' '}
          <span className="font-mono">{asset.triggerWord}</span>
        </p>
      </div>

      <Button
        type="button"
        size="sm"
        onClick={handleUse}
        className="shrink-0 gap-1.5"
      >
        {alreadyInStack ? t('alreadyInUse') : t('recentlyTrainedUse')}
        {!alreadyInStack ? (
          <ArrowRight className="size-3.5" aria-hidden />
        ) : null}
      </Button>
    </div>
  )
}

interface AssetSectionProps {
  title: string
  count: number
  originalCount?: number
  children: ReactNode
}

function AssetSection({
  title,
  count,
  originalCount,
  children,
}: AssetSectionProps) {
  // 标题降级（页面已有 h2「我的 LoRA」做主标题）— 这里改成 h3，
  // 用更小的 uppercase tracking-wide 风格让 section 之间的层级
  // 比 page header 弱，但又比 card row 强。
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 border-b border-border/40 pb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        <span className="text-xs tabular-nums text-muted-foreground/70">
          {count}
          {originalCount !== undefined && originalCount !== count
            ? ` / ${originalCount}`
            : null}
        </span>
      </div>
      {children}
    </div>
  )
}

function AssetGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {children}
    </div>
  )
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border/60 bg-card/30 px-4 py-6 text-center text-xs text-muted-foreground">
      {text}
    </div>
  )
}

interface CivitaiCommunityBranchProps {
  onFavorite: (item: CivitaiLoraLibraryItem) => Promise<LoraAssetRecord | null>
  onUnfavoriteByUrl: (loraUrl: string) => Promise<boolean>
  isFavorited: (loraUrl: string) => boolean
}

function CivitaiCommunityBranch({
  onFavorite,
  onUnfavoriteByUrl,
  isFavorited,
}: CivitaiCommunityBranchProps) {
  const t = useTranslations('LoraWorkbench')
  const router = useRouter()
  const stack = useActiveLoraStack()
  const library = useCivitaiLoraLibrary()
  const [coverPreview, setCoverPreview] = useState<{
    url: string
    name: string
  } | null>(null)
  const [history, setHistory] = useState<string[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const searchWrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Defer the hydrate so React doesn't see a synchronous setState in
    // the effect body — same pattern useCivitaiLoraLibrary uses for its
    // initial refresh.
    return deferEffectTask(() => {
      setHistory(readSearchHistory())
    })
  }, [])

  // Commit a search term to history on debounce-completion (i.e. when
  // the active search the API is actually using stabilises). We hook
  // off `library.search` ≥ 2 chars to avoid logging every keystroke.
  useEffect(() => {
    const trimmed = library.search.trim()
    if (trimmed.length < 2) return
    const id = setTimeout(() => {
      setHistory(recordSearchTerm(trimmed))
    }, 800)
    return () => clearTimeout(id)
  }, [library.search])

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
        toast.info(t('externalUseRedirect', { name: item.name }))
        return
      }
      stack.push(item)
      toast.success(t('addedToStack', { name: item.name }))
      router.push(ROUTES.STUDIO_IMAGE)
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

  const handleHistoryPick = useCallback(
    (term: string) => {
      library.setSearch(term)
      setHistoryOpen(false)
    },
    [library],
  )

  const handleHistoryClear = useCallback(() => {
    setHistory(clearSearchHistory())
    setHistoryOpen(false)
  }, [])

  const handleCopyTryPrompt = useCallback(
    async (item: CivitaiLoraLibraryItem) => {
      const template = buildLoraPromptTemplate(item)
      try {
        await navigator.clipboard.writeText(template)
        toast.success(t('tryPromptCopied'))
      } catch {
        toast.error(t('tryPromptCopyFailed'))
      }
    },
    [t],
  )

  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <header className="flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          {t('communityTitle')}
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void library.refresh()}
        >
          <RefreshCw className="size-3.5" aria-hidden />
          {t('refresh')}
        </Button>
      </header>

      <div className="grid gap-4 pt-4 lg:grid-cols-3">
        <div className="flex min-h-0 flex-col gap-3 lg:col-span-2">
          <BaseModelChipRow
            value={library.baseModel}
            onChange={handleBaseModelChange}
          />

          <div className="flex flex-col gap-2 sm:flex-row">
            <div ref={searchWrapperRef} className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={library.search}
                onChange={(event) => library.setSearch(event.target.value)}
                onFocus={() => setHistoryOpen(true)}
                placeholder={t('communitySearch')}
                className="h-9 pl-9 text-xs"
              />
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
          </div>

          <div
            className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1"
            aria-busy={library.isLoading}
          >
            {library.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : library.error ? (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 text-xs text-destructive">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                <span>{t('communityLoadFailed')}</span>
              </div>
            ) : library.items.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                {t('communityEmpty')}
              </div>
            ) : (
              library.items.map((item) => (
                <CivitaiLoraRow
                  key={item.id}
                  item={item}
                  isSelected={library.selectedItem?.id === item.id}
                  isActive={stack.items.some(
                    (entry) => entry.asset.id === item.id,
                  )}
                  isFavorited={isFavorited(item.loraUrl)}
                  onSelect={library.selectItem}
                  onUse={handleUse}
                  onFavorite={handleFavoriteToggle}
                />
              ))
            )}
          </div>

          <div className="flex shrink-0 items-center justify-between border-t border-border/40 pt-2 text-xs text-muted-foreground">
            <Button
              variant="outline"
              size="sm"
              disabled={library.page <= 1 || library.isLoading}
              onClick={library.previousPage}
              className="h-7 text-xs"
            >
              {t('communityPrevious')}
            </Button>
            <span>
              {library.total
                ? t('communityPageStatusKnown', {
                    page: library.page,
                    total: library.total,
                  })
                : t('communityPageStatus', { page: library.page })}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!library.hasNextPage || library.isLoading}
              onClick={library.nextPage}
              className="h-7 text-xs"
            >
              {t('communityNext')}
            </Button>
          </div>
        </div>

        <CivitaiLoraInspector
          item={library.selectedItem}
          isFavorited={
            library.selectedItem
              ? isFavorited(library.selectedItem.loraUrl)
              : false
          }
          onUse={handleUse}
          onFavorite={handleFavoriteToggle}
          onCopyTryPrompt={handleCopyTryPrompt}
          onPreviewCover={(item) =>
            item.coverImageUrl
              ? setCoverPreview({
                  url: item.coverImageUrl,
                  name: item.name,
                })
              : undefined
          }
        />
      </div>

      <Dialog
        open={coverPreview !== null}
        onOpenChange={(open) => {
          if (!open) setCoverPreview(null)
        }}
      >
        <DialogContent className="max-w-4xl border-none bg-transparent p-0 shadow-none">
          <DialogTitle className="sr-only">
            {coverPreview?.name ?? ''}
          </DialogTitle>
          {coverPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverPreview.url}
              alt={coverPreview.name}
              className="h-auto w-full rounded-xl object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  )
}

interface CivitaiLoraRowProps {
  item: CivitaiLoraLibraryItem
  isSelected: boolean
  isActive: boolean
  isFavorited: boolean
  onSelect: (item: CivitaiLoraLibraryItem) => void
  onUse: (item: CivitaiLoraLibraryItem) => void
  onFavorite: (item: CivitaiLoraLibraryItem) => void
}

function CivitaiLoraRow({
  item,
  isSelected,
  isActive,
  isFavorited,
  onSelect,
  onUse,
  onFavorite,
}: CivitaiLoraRowProps) {
  const t = useTranslations('LoraWorkbench')
  const isGeneratable = isCivitaiBaseModelGeneratable(item.baseModelFamily)

  return (
    <div
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all',
        isSelected
          ? 'border-primary/30 bg-primary/10'
          : 'border-transparent hover:bg-muted/30',
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(item)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <LoraThumb item={item} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">
              {item.name}
            </span>
            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-2xs',
                isGeneratable
                  ? 'bg-muted/60 text-muted-foreground'
                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
              )}
              title={isGeneratable ? undefined : t('externalBadgeHint')}
            >
              {!isGeneratable ? (
                <ExternalLink className="size-3" aria-hidden />
              ) : null}
              {item.baseModelFamily}
            </span>
          </div>
          <span className="block truncate text-2xs text-muted-foreground">
            {item.creatorName ?? t('communityUnknownCreator')}
          </span>
          <span className="block truncate font-mono text-2xs text-muted-foreground/70">
            {item.triggerWord}
          </span>
        </div>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => onFavorite(item)}
        aria-label={isFavorited ? t('unfavorite') : t('favorite')}
        title={isFavorited ? t('unfavorite') : t('favorite')}
      >
        <Heart
          className={cn(
            'size-3.5',
            isFavorited && 'fill-rose-500 text-rose-500',
          )}
          aria-hidden
        />
      </Button>
      <Button
        type="button"
        variant={isActive && isGeneratable ? 'secondary' : 'ghost'}
        size="icon-sm"
        onClick={() => onUse(item)}
        aria-label={
          !isGeneratable
            ? t('useExternal')
            : isActive
              ? t('alreadyInUse')
              : t('use')
        }
        title={
          !isGeneratable
            ? t('useExternal')
            : isActive
              ? t('alreadyInUse')
              : t('use')
        }
      >
        {!isGeneratable ? (
          <ExternalLink className="size-3.5" aria-hidden />
        ) : (
          <Sparkles className="size-3.5" aria-hidden />
        )}
      </Button>
    </div>
  )
}

interface LoraThumbProps {
  item: CivitaiLoraLibraryItem
}

function LoraThumb({ item }: LoraThumbProps) {
  return (
    <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
      {item.coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.coverImageUrl}
          alt=""
          className="size-full object-cover"
          loading="lazy"
        />
      ) : (
        <Sparkles className="size-4" aria-hidden />
      )}
    </div>
  )
}

interface CivitaiLoraInspectorProps {
  item: CivitaiLoraLibraryItem | null
  isFavorited: boolean
  onUse: (item: CivitaiLoraLibraryItem) => void
  onFavorite: (item: CivitaiLoraLibraryItem) => void
  onCopyTryPrompt: (item: CivitaiLoraLibraryItem) => Promise<void>
  onPreviewCover: (item: CivitaiLoraLibraryItem) => void
}

function CivitaiLoraInspector({
  item,
  isFavorited,
  onUse,
  onFavorite,
  onCopyTryPrompt,
  onPreviewCover,
}: CivitaiLoraInspectorProps) {
  const t = useTranslations('LoraWorkbench')
  const isGeneratable = item
    ? isCivitaiBaseModelGeneratable(item.baseModelFamily)
    : true

  if (!item) {
    return (
      <aside className="flex min-h-0 items-center justify-center rounded-xl border border-border/60 bg-muted/10 p-6 text-center text-sm text-muted-foreground">
        {t('communityNoSelection')}
      </aside>
    )
  }

  return (
    <aside className="min-h-0 overflow-y-auto rounded-xl border border-border/60 bg-muted/10 p-4">
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => onPreviewCover(item)}
          disabled={!item.coverImageUrl}
          aria-label={t('viewCover')}
          className={cn(
            'block w-full overflow-hidden rounded-lg border border-border/60 bg-muted',
            item.coverImageUrl
              ? 'cursor-zoom-in transition-opacity hover:opacity-90'
              : 'cursor-default',
          )}
        >
          {item.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.coverImageUrl}
              alt={item.name}
              className="aspect-video w-full object-cover"
            />
          ) : (
            <div className="flex aspect-video items-center justify-center text-muted-foreground">
              <Sparkles className="size-8" aria-hidden />
            </div>
          )}
        </button>

        <div className="space-y-1">
          <h3 className="font-display text-lg font-semibold leading-tight">
            {item.name}
          </h3>
          <p className="text-xs text-muted-foreground">
            {item.creatorName ?? t('communityUnknownCreator')} ·{' '}
            {item.versionName}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <Metric
            icon={<Download className="size-3.5" aria-hidden />}
            label={t('communityDownloads')}
            value={String(item.downloadCount)}
          />
          <Metric
            icon={<Heart className="size-3.5" aria-hidden />}
            label={t('communityLikes')}
            value={String(item.thumbsUpCount)}
          />
        </div>

        <dl className="space-y-3 text-xs">
          <div>
            <dt className="text-muted-foreground">{t('communityBaseModel')}</dt>
            <dd className="mt-1 font-medium text-foreground">
              {item.baseModelFamily}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              {t('communityTriggerWord')}
            </dt>
            <dd className="mt-1 rounded-md border border-border/60 bg-background px-2 py-1 font-mono text-foreground">
              {item.triggerWord}
            </dd>
          </div>
          {item.tags.length > 0 ? (
            <div>
              <dt className="text-muted-foreground">{t('communityTags')}</dt>
              <dd className="mt-2 flex flex-wrap gap-1.5">
                {item.tags.slice(0, 6).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-muted px-2 py-0.5 text-2xs text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="rounded-lg border border-border/60 bg-background/60 p-2">
          <div className="flex items-center justify-between gap-2 text-2xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Wand2 className="size-3" aria-hidden />
              {t('tryPromptLabel')}
            </span>
            <button
              type="button"
              onClick={() => void onCopyTryPrompt(item)}
              className="text-2xs font-medium text-foreground hover:text-primary"
            >
              {t('tryPromptCopy')}
            </button>
          </div>
          <p className="mt-1.5 break-words font-mono text-2xs leading-relaxed text-foreground">
            {buildLoraPromptTemplate(item)}
          </p>
        </div>

        {!isGeneratable ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-2xs leading-relaxed text-amber-700 dark:text-amber-300">
            {t('externalInspectorHint', { family: item.baseModelFamily })}
          </div>
        ) : null}

        <div className="grid gap-2 pt-2">
          <Button type="button" onClick={() => onUse(item)}>
            {isGeneratable ? (
              <Sparkles className="size-4" aria-hidden />
            ) : (
              <ExternalLink className="size-4" aria-hidden />
            )}
            {isGeneratable
              ? t('communityUseInStudio')
              : t('communityOpenInCivitai')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onFavorite(item)}
          >
            <Heart
              className={cn(
                'size-4',
                isFavorited && 'fill-rose-500 text-rose-500',
              )}
              aria-hidden
            />
            {isFavorited ? t('unfavorite') : t('favorite')}
          </Button>
          {isGeneratable ? (
            <Button type="button" variant="ghost" asChild>
              <a href={item.modelPageUrl} target="_blank" rel="noreferrer">
                <ArrowUpRight className="size-4" aria-hidden />
                {t('communityOpenSource')}
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </aside>
  )
}

interface MetricProps {
  icon: ReactNode
  label: string
  value: string
}

function Metric({ icon, label, value }: MetricProps) {
  return (
    <div className="rounded-lg border border-border/60 bg-background p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 font-medium text-foreground">{value}</div>
    </div>
  )
}

function TrainingBranch() {
  // Two-column page layout (Krea-inspired): left rail surfaces the user's
  // training history + dataset-reuse placeholder so they stay in view as
  // the user fills the form, right pane is the form itself. Form's
  // built-in recent-jobs block is suppressed (hideRecentJobs) since the
  // sidebar owns that responsibility here. Collapses to single column
  // on mobile so the sidebar doesn't squeeze the form.
  return (
    <section className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[280px_1fr]">
      <div className="rounded-2xl border border-border bg-card p-4 lg:max-h-[calc(100vh-12rem)] lg:sticky lg:top-4">
        <LoraTrainingHistorySidebar />
      </div>
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <LoraTrainingForm showHeading hideRecentJobs />
      </div>
    </section>
  )
}

interface BaseModelChipRowProps {
  value: CivitaiLoraBaseModel
  onChange: (value: CivitaiLoraBaseModel) => void
}

function BaseModelChipRow({ value, onChange }: BaseModelChipRowProps) {
  const t = useTranslations('LoraWorkbench')

  // Split chips by generatability so the user sees "things I can run here"
  // vs "things that send me to Civitai" at a glance. The separator anchors
  // the visual grouping; external chips also pick up the ExternalLink icon
  // + amber active color used elsewhere on LoRA cards for the same families.
  const generatableChips = CIVITAI_LORA_BASE_MODEL_VALUES.filter(
    (v) => v !== 'all' && isCivitaiBaseModelGeneratable(v),
  )
  const externalChips = CIVITAI_LORA_BASE_MODEL_VALUES.filter(
    (v) => v !== 'all' && !isCivitaiBaseModelGeneratable(v),
  )

  const renderChip = (option: CivitaiLoraBaseModel) => {
    const isActive = option === value
    const isExternal =
      option !== 'all' && !isCivitaiBaseModelGeneratable(option)
    const label = option === 'all' ? t('baseModelFilterAll') : option
    return (
      <button
        key={option}
        type="button"
        role="radio"
        aria-checked={isActive}
        onClick={() => {
          if (isCivitaiLoraBaseModel(option)) onChange(option)
        }}
        title={isExternal ? t('externalBadgeHint') : undefined}
        className={cn(
          'inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-2xs font-medium transition-colors',
          isActive
            ? isExternal
              ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300'
              : 'border-primary/40 bg-primary/10 text-primary'
            : 'border-border/60 text-muted-foreground hover:border-primary/20 hover:text-foreground',
        )}
      >
        {isExternal ? <ExternalLink className="size-3" aria-hidden /> : null}
        {label}
      </button>
    )
  }

  return (
    <div
      role="radiogroup"
      aria-label={t('baseModelFilterLabel')}
      className="flex flex-wrap items-center gap-1.5"
    >
      {renderChip('all')}
      {generatableChips.map(renderChip)}
      {externalChips.length > 0 ? (
        <span className="mx-1 h-4 w-px shrink-0 bg-border/60" aria-hidden />
      ) : null}
      {externalChips.map(renderChip)}
    </div>
  )
}
