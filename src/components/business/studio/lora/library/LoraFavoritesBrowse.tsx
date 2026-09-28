'use client'

import { useCallback, useMemo, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { useFormatter, useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { AlertCircle, Search, Trash2, X } from '@/components/icons'
import {
  DEFAULT_LORA_NSFW_FILTER,
  LORA_LIBRARY_NSFW_STORAGE_KEY,
  LORA_TOAST_DURATION_MS,
  isCivitaiBaseModelGeneratable,
  isLoraNsfwFilter,
} from '@/constants/lora'
import { useActiveLoraStack } from '@/hooks/use-active-lora-stack'
import { useCivitaiDownloadGate } from '@/hooks/use-civitai-download-gate'
import { useLocalPreference } from '@/hooks/use-local-preference'
import { proxyCivitaiImageUrl } from '@/lib/civitai-image-url'
import { getLoraAssetSourceUrl } from '@/lib/lora-asset-source-url'
import { cn } from '@/lib/utils'
import type { CivitaiLoraLibraryItem, LoraAssetRecord } from '@/types'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

import {
  LoraLibraryDetailPage,
  type LoraLibraryDetailMenuItem,
} from './LoraLibraryDetailPage'
import { LoraLibraryFilterCombobox } from './LoraLibraryFilterCombobox'
import { LoraLibrarySegmented } from './LoraLibrarySegmented'
import { LoraLibraryTile } from './LoraLibraryTile'

type FavoritesSection = 'favorites' | 'trained'
type FavoritesSort = 'newest' | 'oldest' | 'nameAsc'

const SORT_LABEL_KEYS: Record<FavoritesSort, string> = {
  newest: 'myLorasSortNewest',
  oldest: 'myLorasSortOldest',
  nameAsc: 'myLorasSortNameAsc',
}

interface LoraFavoritesBrowseProps {
  trained: readonly LoraAssetRecord[]
  favorites: readonly LoraAssetRecord[]
  isLoading: boolean
  error: string | null
  onRefresh: () => Promise<void>
  onUnfavoriteByUrl: (loraUrl: string) => Promise<boolean>
  onFavoriteCivitai: (
    item: CivitaiLoraLibraryItem,
  ) => Promise<LoraAssetRecord | null>
  onDelete: (assetId: string) => Promise<boolean>
  onVisibilityChange: (assetId: string, isPublic: boolean) => Promise<boolean>
  isFavorited: (loraUrl: string) => boolean
  onGoLibrary: () => void
  onGoTrain: () => void
}

/**
 * 收藏记录 → 详情页吃的条目形状。缺的热度 / 作者留空（详情页没有就不写）；Civitai
 * 的收藏打开后会取回那一版的完整条目换上去（按版本号认）。
 */
function assetToLibraryItem(asset: LoraAssetRecord): CivitaiLoraLibraryItem {
  const license = asset.sourceSnapshot?.license
  return {
    ...asset,
    modelId: asset.modelId ?? 0,
    modelVersionId: asset.modelVersionId ?? 0,
    versionName: asset.name,
    creatorName: asset.sourceSnapshot?.author ?? null,
    creatorAvatarUrl: null,
    modelPageUrl: getLoraAssetSourceUrl(asset) ?? '',
    tags: [],
    downloadCount: 0,
    thumbsUpCount: 0,
    allowCommercialUse: license?.commercialUse ?? [],
    allowDerivatives: license?.allowDerivatives ?? false,
    allowNoCredit: license?.allowNoCredit ?? true,
    thumbImageUrl: null,
    cardImageUrl: null,
    coverColor: null,
    coverImageUrlOriginal: null,
    triggerAlternates: [],
    recommendedPrompt: asset.recommendedPrompt ?? null,
    recommendedPromptAlternates: asset.recommendedPromptAlternates ?? [],
    triggerSource: asset.triggerSource ?? 'official',
    fileHashAutoV3: asset.fileHashAutoV3 ?? null,
    fileSizeBytes: asset.sourceSnapshot?.fileSizeBytes ?? null,
  }
}

/**
 * 库 B 的「收藏」（lora-library.md §6）：与库同一副外壳 —— 一行（搜索 · 收藏 N /
 * 自训 N · 底模 · 排序）→ 数量 → 网格（名字下面写触发词）→ 到底；点卡升起同一个
 * 详情页，挂载留在原地。
 *
 * ⚠ 全在本机筛：收藏与自训一次就取齐了，⛔ 为搜索再打服务端。
 * ⚠ 详情页按来源取样例：Civitai 取回版本与逐图配方，Hugging Face 取 README 里的图，
 *   自训的只有它自带的预览图；自训的 ⋯ 里多「设为公开 / 私有」与「删除」（删除要再
 *   确认一次）。
 */
export function LoraFavoritesBrowse({
  trained,
  favorites,
  isLoading,
  error,
  onRefresh,
  onUnfavoriteByUrl,
  onFavoriteCivitai,
  onDelete,
  onVisibilityChange,
  isFavorited,
  onGoLibrary,
  onGoTrain,
}: LoraFavoritesBrowseProps) {
  const t = useTranslations('LoraWorkbench')
  const tb = useTranslations('LoraWorkbench.browse')
  const format = useFormatter()
  const stack = useActiveLoraStack()
  const { ensureMountable } = useCivitaiDownloadGate()
  const [storedNsfwFilter] = useLocalPreference(LORA_LIBRARY_NSFW_STORAGE_KEY)
  const nsfwFilter =
    storedNsfwFilter && isLoraNsfwFilter(storedNsfwFilter)
      ? storedNsfwFilter
      : DEFAULT_LORA_NSFW_FILTER

  const [section, setSection] = useState<FavoritesSection>('favorites')
  const [query, setQuery] = useState('')
  const [family, setFamily] = useState('all')
  const [sort, setSort] = useState<FavoritesSort>('newest')
  const [openAsset, setOpenAsset] = useState<LoraAssetRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<LoraAssetRecord | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [mountingId, setMountingId] = useState<string | null>(null)

  const source = section === 'trained' ? trained : favorites
  const sectionLabel =
    section === 'trained'
      ? t('myLorasTrainedSection')
      : t('myLorasFavoritesSection')
  const families = useMemo(
    () =>
      [...new Set(source.map((asset) => asset.baseModelFamily))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [source],
  )
  // 换了一格（收藏 ↔ 自训）底模可能不在这一格里：落回「全部」。
  const activeFamily = families.includes(family) ? family : 'all'
  const trimmedQuery = query.trim().toLowerCase()
  const shown = useMemo(() => {
    const matched = source.filter(
      (asset) =>
        (activeFamily === 'all' || asset.baseModelFamily === activeFamily) &&
        (!trimmedQuery ||
          asset.name.toLowerCase().includes(trimmedQuery) ||
          asset.triggerWord.toLowerCase().includes(trimmedQuery)),
    )
    return [...matched].sort((a, b) => {
      if (sort === 'nameAsc') return a.name.localeCompare(b.name)
      const diff =
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      return sort === 'oldest' ? diff : -diff
    })
  }, [activeFamily, sort, source, trimmedQuery])

  // 连版本号一起认：收藏记录与详情页取回的版本条目是同一把，但 id / 链接写法不同。
  const isMounted = useCallback(
    (target: { id: string; loraUrl: string; modelVersionId?: number }) =>
      stack.items.some(
        (entry) =>
          entry.asset.id === target.id ||
          entry.asset.loraUrl === target.loraUrl ||
          (!!target.modelVersionId &&
            entry.asset.modelVersionId === target.modelVersionId),
      ),
    [stack.items],
  )
  const favoriteFor = useCallback(
    (item: CivitaiLoraLibraryItem) =>
      favorites.find(
        (asset) =>
          asset.loraUrl === item.loraUrl ||
          (item.modelVersionId > 0 &&
            asset.modelVersionId === item.modelVersionId),
      ) ?? null,
    [favorites],
  )
  // 挂收藏记录本身；详情页里切到了另一版（Civitai 条目）就过一遍下载闸再挂那一版。
  const mount = useCallback(
    async (asset: LoraAssetRecord, target?: CivitaiLoraLibraryItem) => {
      const version =
        target && target.modelVersionId !== asset.modelVersionId ? target : null
      if (isMounted(version ?? asset) || mountingId) return
      if (!version) {
        stack.push(asset)
        return
      }
      setMountingId(version.id)
      try {
        if (!(await ensureMountable(version))) return
        if (!isCivitaiBaseModelGeneratable(version.baseModelFamily)) {
          window.open(version.modelPageUrl, '_blank', 'noopener,noreferrer')
          toast.info(t('externalUseRedirect', { name: version.name }), {
            duration: LORA_TOAST_DURATION_MS,
          })
          return
        }
        stack.push(version)
      } finally {
        setMountingId(null)
      }
    },
    [ensureMountable, isMounted, mountingId, stack, t],
  )

  const familyOptions = useMemo(
    () => [
      { value: 'all', label: t('familyLabel.all') },
      ...families.map((value) => ({ value, label: value })),
    ],
    [families, t],
  )
  const sortOptions = useMemo(
    () =>
      (Object.keys(SORT_LABEL_KEYS) as FavoritesSort[]).map((value) => ({
        value,
        label: t(SORT_LABEL_KEYS[value]),
      })),
    [t],
  )

  const detailItem = openAsset ? assetToLibraryItem(openAsset) : null
  const openIsTrained = openAsset?.source === 'trained'
  const extraMenu: LoraLibraryDetailMenuItem[] =
    openAsset && openIsTrained && openAsset.isOwn
      ? [
          {
            key: 'visibility',
            label: openAsset.isPublic
              ? t('assetActionMakePrivate')
              : t('assetActionMakePublic'),
            onSelect: () =>
              void onVisibilityChange(openAsset.id, !openAsset.isPublic),
          },
          {
            key: 'delete',
            label: t('assetActionDelete'),
            danger: true,
            onSelect: () => setDeleteTarget(openAsset),
          },
        ]
      : []

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-5 pt-4">
        <div className="relative flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-background px-3 transition-colors duration-fast ease-linear focus-within:border-foreground/40">
          <Search
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('myLorasSearchPlaceholder')}
            aria-label={t('myLorasSearchPlaceholder')}
            className="h-full min-w-0 flex-1 bg-transparent text-2sm text-foreground outline-none placeholder:text-muted-foreground/70"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={tb('searchClear')}
              className="shrink-0 text-muted-foreground transition-colors duration-fast ease-linear hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
        <LoraLibrarySegmented
          ariaLabel={t('myLorasTitle')}
          value={section}
          onChange={setSection}
          options={[
            {
              value: 'favorites' as const,
              label: `${t('myLorasFavoritesSection')} · ${favorites.length}`,
            },
            {
              value: 'trained' as const,
              label: `${t('myLorasTrainedSection')} · ${trained.length}`,
            },
          ]}
        />
        <LoraLibraryFilterCombobox
          variant="bar"
          label={t('libraryFamilyFilter')}
          ariaLabel={t('baseModelFilterLabel')}
          value={activeFamily}
          options={familyOptions}
          onChange={setFamily}
          changed={activeFamily !== 'all'}
        />
        <LoraLibraryFilterCombobox
          variant="bar"
          label={t('myLorasSortLabel')}
          ariaLabel={t('myLorasSortLabel')}
          value={sort}
          options={sortOptions}
          onChange={setSort}
          changed={sort !== 'newest'}
        />
      </div>

      {!isLoading && !error && source.length > 0 ? (
        <p
          role="status"
          className="flex shrink-0 items-baseline gap-2.5 px-5 pb-2.5 pt-3 text-xs text-muted-foreground"
        >
          {trimmedQuery ? (
            <span>
              {tb('mineCountQuery', {
                count: shown.length,
                section: sectionLabel,
                query: query.trim(),
              })}
            </span>
          ) : (
            <>
              <b className="text-sm font-semibold tabular-nums text-foreground">
                {format.number(shown.length)}
              </b>
              <span>
                {tb('mineCountUnit', {
                  count: shown.length,
                  section: sectionLabel,
                })}
              </span>
            </>
          )}
        </p>
      ) : null}

      <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-5">
        {error ? (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-status-risk-surface px-3.5 py-3 text-xs text-status-risk">
            <span className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {t('myLorasErrorTitle')}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void onRefresh()}
            >
              {t('myLorasErrorRetry')}
            </Button>
          </div>
        ) : isLoading ? (
          <div className="lora-lib-grid pt-3" aria-hidden>
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex flex-col gap-1.5">
                <span className="block aspect-3/4 rounded-xl bg-muted" />
                <span className="h-2.5 w-3/4 rounded bg-muted" />
                <span className="h-2.5 w-1/2 rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : source.length === 0 ? (
          <div className="grid h-full place-items-center">
            <div className="flex max-w-100 flex-col items-center gap-3 text-center">
              <p className="text-2sm leading-5 text-muted-foreground">
                {section === 'trained'
                  ? t('myLorasTrainedSectionEmpty')
                  : t('myLorasFavoritesEmpty')}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={section === 'trained' ? onGoTrain : onGoLibrary}
              >
                {section === 'trained'
                  ? t('myLorasEmptyCtaTrain')
                  : t('myLorasEmptyCtaBrowse')}
              </Button>
            </div>
          </div>
        ) : shown.length === 0 ? (
          <p className="py-12 text-center text-2sm text-muted-foreground">
            {t('myLorasSearchEmpty', { query: query.trim() || activeFamily })}
          </p>
        ) : (
          <>
            <div className="lora-lib-grid">
              {shown.map((asset) => (
                <LoraLibraryTile
                  key={asset.id}
                  name={asset.name}
                  meta={asset.triggerWord.trim() || tb('noTrigger')}
                  coverUrl={
                    asset.coverImageUrl
                      ? proxyCivitaiImageUrl(asset.coverImageUrl)
                      : null
                  }
                  mounted={isMounted(asset)}
                  onOpen={() => setOpenAsset(asset)}
                  onMount={() => void mount(asset)}
                />
              ))}
            </div>
            <p
              className={cn(
                'flex items-center gap-2.5 pb-6.5 pt-5.5 text-xs text-muted-foreground',
                'before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border',
              )}
            >
              {tb('end', { count: format.number(shown.length) })}
            </p>
          </>
        )}
      </div>

      <AnimatePresence>
        {openAsset && detailItem ? (
          <LoraLibraryDetailPage
            key={openAsset.id}
            item={detailItem}
            isMounted={isMounted}
            mountingId={mountingId}
            onMount={(target) => void mount(openAsset, target)}
            isFavorited={(target) =>
              favoriteFor(target) !== null || isFavorited(target.loraUrl)
            }
            onToggleFavorite={(target) => {
              // 取消收藏按收藏记录自己的链接取消（取回的版本条目链接写法不同）。
              const favorite = favoriteFor(target)
              if (favorite) {
                void onUnfavoriteByUrl(favorite.loraUrl)
              } else if (isFavorited(target.loraUrl)) {
                void onUnfavoriteByUrl(target.loraUrl)
              } else if (target.modelId > 0) {
                void onFavoriteCivitai(target)
              }
            }}
            nsfwFilter={nsfwFilter}
            onClose={() => setOpenAsset(null)}
            origin={
              openIsTrained
                ? 'trained'
                : openAsset.provider === 'huggingface'
                  ? 'huggingface'
                  : 'civitai'
            }
            extraMenu={extraMenu}
          />
        ) : null}
      </AnimatePresence>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('assetDeleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('assetDeleteConfirmDescription', {
                name: deleteTarget?.name ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t('assetDeleteConfirmCancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={(event) => {
                // 等删完再收：失败时弹窗留着，能看见也能重试。
                event.preventDefault()
                if (!deleteTarget) return
                setDeleting(true)
                void onDelete(deleteTarget.id).then((ok) => {
                  setDeleting(false)
                  if (!ok) return
                  setDeleteTarget(null)
                  setOpenAsset(null)
                })
              }}
            >
              <Trash2 className="size-4" aria-hidden />
              {t('assetDeleteConfirmAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
