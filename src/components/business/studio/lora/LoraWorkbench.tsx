'use client'

import { useCallback, useState, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  AlertCircle,
  ArrowUpRight,
  Compass,
  Download,
  GraduationCap,
  Heart,
  Library,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  CIVITAI_LORA_SORT_OPTIONS,
  DEFAULT_LORA_WORKBENCH_SECTION,
  LORA_WORKBENCH_SEARCH_PARAM,
  LORA_WORKBENCH_SECTIONS,
  isCivitaiLoraSort,
  isLoraWorkbenchSection,
  type LoraWorkbenchSection,
} from '@/constants/lora'
import { ROUTES } from '@/constants/routes'
import { usePathname, useRouter } from '@/i18n/navigation'
import type { CivitaiLoraLibraryItem, LoraAssetRecord } from '@/types'
import { useActiveLoraStack } from '@/hooks/use-active-lora-stack'
import { useCivitaiLoraLibrary } from '@/hooks/use-civitai-lora-library'
import { useLoraAssets } from '@/hooks/use-lora-assets'
import { LoraTrainingForm } from '@/components/business/LoraTrainingDialog'
import { LoraAssetCard } from '@/components/business/studio/lora/LoraAssetCard'
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
          onRefresh={refresh}
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

interface MyLoraBranchProps {
  trained: LoraAssetRecord[]
  favorites: LoraAssetRecord[]
  isLoading: boolean
  onRefresh: () => Promise<void>
  onVisibilityChange: (assetId: string, isPublic: boolean) => Promise<boolean>
  onUnfavorite: (assetId: string) => Promise<boolean>
}

function MyLoraBranch({
  trained,
  favorites,
  isLoading,
  onRefresh,
  onVisibilityChange,
  onUnfavorite,
}: MyLoraBranchProps) {
  const t = useTranslations('LoraWorkbench')
  const totalCount = trained.length + favorites.length

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void onRefresh()}
        >
          <RefreshCw className="size-3.5" aria-hidden />
          {t('refresh')}
        </Button>
      </header>

      {isLoading ? (
        <div className="flex items-center justify-center rounded-2xl border border-border bg-card/40 py-12 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden />
        </div>
      ) : totalCount === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">{t('myLorasEmpty')}</p>
        </div>
      ) : (
        <>
          <AssetSection
            title={t('myLorasTrainedSection')}
            count={trained.length}
          >
            {trained.length === 0 ? (
              <EmptyHint text={t('myLorasEmpty')} />
            ) : (
              <AssetGrid>
                {trained.map((asset) => (
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
            count={favorites.length}
          >
            {favorites.length === 0 ? (
              <EmptyHint text={t('myLorasFavoritesEmpty')} />
            ) : (
              <AssetGrid>
                {favorites.map((asset) => (
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
    </section>
  )
}

interface AssetSectionProps {
  title: string
  count: number
  children: ReactNode
}

function AssetSection({ title, count, children }: AssetSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          {title}
        </h2>
        <span className="text-xs text-muted-foreground">({count})</span>
      </div>
      {children}
    </div>
  )
}

function AssetGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
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

  const handleUse = useCallback(
    (item: CivitaiLoraLibraryItem) => {
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
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={library.search}
                onChange={(event) => library.setSearch(event.target.value)}
                placeholder={t('communitySearch')}
                className="h-9 pl-9 text-xs"
              />
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
            <span className="shrink-0 rounded-full bg-muted/60 px-1.5 py-0.5 text-2xs text-muted-foreground">
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
        variant={isActive ? 'secondary' : 'ghost'}
        size="icon-sm"
        onClick={() => onUse(item)}
        aria-label={isActive ? t('alreadyInUse') : t('use')}
      >
        <Sparkles className="size-3.5" aria-hidden />
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
  onPreviewCover: (item: CivitaiLoraLibraryItem) => void
}

function CivitaiLoraInspector({
  item,
  isFavorited,
  onUse,
  onFavorite,
  onPreviewCover,
}: CivitaiLoraInspectorProps) {
  const t = useTranslations('LoraWorkbench')

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

        <div className="grid gap-2 pt-2">
          <Button type="button" onClick={() => onUse(item)}>
            <Sparkles className="size-4" aria-hidden />
            {t('communityUseInStudio')}
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
          <Button type="button" variant="ghost" asChild>
            <a href={item.modelPageUrl} target="_blank" rel="noreferrer">
              <ArrowUpRight className="size-4" aria-hidden />
              {t('communityOpenSource')}
            </a>
          </Button>
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
  return (
    <section className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-5 sm:p-6">
      <LoraTrainingForm showHeading />
    </section>
  )
}
