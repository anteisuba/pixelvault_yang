'use client'

import { useCallback, useMemo, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { useFormatter, useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { AlertCircle, Trash2 } from '@/components/icons'
import {
  DEFAULT_LORA_NSFW_FILTER,
  LORA_LIBRARY_NSFW_STORAGE_KEY,
  LORA_TOAST_DURATION_MS,
  isCivitaiBaseModelGeneratable,
  isLoraNsfwFilter,
} from '@/constants/lora'
import { useActiveLoraStack } from '@/hooks/use-active-lora-stack'
import { useCivitaiDownloadGate } from '@/hooks/use-civitai-download-gate'
import { useHandMentionToAssistant } from '@/hooks/use-hand-to-assistant'
import { useLocalPreference } from '@/hooks/use-local-preference'
import { proxyCivitaiImageUrl } from '@/lib/civitai-image-url'
import { getLoraAssetSourceUrl } from '@/lib/lora-asset-source-url'
import { buildLibraryFavoriteRequest } from '@/lib/lora-source-snapshot'
import { cn } from '@/lib/utils'
import type {
  CharacterLoraGroup,
  CivitaiLoraLibraryItem,
  LoraAssetRecord,
} from '@/types'
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
  LIBRARY_GRID_CLASS,
  LibraryNewTile,
  LibrarySearch,
  LibraryToolbar,
} from '@/components/ui/library-kit'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'

import {
  LoraLibraryDetailPage,
  type LoraLibraryDetailMenuItem,
} from './LoraLibraryDetailPage'
import { LoraLibraryFilterCombobox } from './LoraLibraryFilterCombobox'
import { LoraLibraryTile, loraMention } from './LoraLibraryTile'
import { useLoraPickSelection } from './lora-pick-selection'

/** 左栏「收藏 / 自训 / 角色」三行各开一格（ui-spec §9，样件 E S19）。 */
export type FavoritesSection = 'favorites' | 'trained' | 'characters'

const ALL_CHARACTERS = '\u0000all'
type FavoritesSort = 'newest' | 'oldest' | 'nameAsc'

const SORT_LABEL_KEYS: Record<FavoritesSort, string> = {
  newest: 'myLorasSortNewest',
  oldest: 'myLorasSortOldest',
  nameAsc: 'myLorasSortNameAsc',
}

interface LoraFavoritesBrowseProps {
  section: FavoritesSection
  /** 角色收的 LoRA（「角色」那一格用）。 */
  characterGroups?: readonly CharacterLoraGroup[]
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
  section,
  characterGroups = [],
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
  const hand = useHandMentionToAssistant()
  const stack = useActiveLoraStack()
  const { ensureMountable } = useCivitaiDownloadGate()
  const [storedNsfwFilter] = useLocalPreference(LORA_LIBRARY_NSFW_STORAGE_KEY)
  const nsfwFilter =
    storedNsfwFilter && isLoraNsfwFilter(storedNsfwFilter)
      ? storedNsfwFilter
      : DEFAULT_LORA_NSFW_FILTER

  const [characterId, setCharacterId] = useState(ALL_CHARACTERS)
  const [query, setQuery] = useState('')
  // 训练入口 = 「自训」那一栏第一格虚线「训练新 LoRA」（ui-spec ㊲，owner 10-25）；挑选框里只管挑，不给。
  const picking = useLoraPickSelection() !== null
  const showTrainTile = section === 'trained' && !picking
  const [family, setFamily] = useState('all')
  const [sort, setSort] = useState<FavoritesSort>('newest')
  const [openAsset, setOpenAsset] = useState<LoraAssetRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<LoraAssetRecord | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [mountingId, setMountingId] = useState<string | null>(null)

  const activeCharacterId = characterGroups.some(
    (group) => group.characterCardId === characterId,
  )
    ? characterId
    : ALL_CHARACTERS
  // 角色那一格：同一把 LoRA 收进了好几个角色只算一张。
  const characterLoras = useMemo(() => {
    const seen = new Set<string>()
    const out: LoraAssetRecord[] = []
    for (const group of characterGroups) {
      if (
        activeCharacterId !== ALL_CHARACTERS &&
        group.characterCardId !== activeCharacterId
      )
        continue
      for (const lora of group.loras) {
        if (seen.has(lora.loraUrl)) continue
        seen.add(lora.loraUrl)
        out.push(lora)
      }
    }
    return out
  }, [activeCharacterId, characterGroups])
  const source =
    section === 'trained'
      ? trained
      : section === 'characters'
        ? characterLoras
        : favorites
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

  // 格子上的书签：收着就取消（按记录自己的链接），角色里没收藏的那把就收进来。
  const toggleFavorite = useCallback(
    async (asset: LoraAssetRecord) => {
      if (isFavorited(asset.loraUrl)) {
        await onUnfavoriteByUrl(asset.loraUrl)
        return
      }
      if (asset.modelId) await onFavoriteCivitai(assetToLibraryItem(asset))
    },
    [isFavorited, onFavoriteCivitai, onUnfavoriteByUrl],
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
      {/* 顶上一行（ui-spec §9）：搜索 · 底模 ……… 排序；角色那一格下面一条角色切换条。 */}
      <div className="flex shrink-0 flex-col gap-3 pb-3">
        <LibraryToolbar
          search={
            <LibrarySearch
              value={query}
              onChange={setQuery}
              placeholder={t('myLorasSearchPlaceholder')}
              label={t('myLorasSearchPlaceholder')}
            />
          }
          pills={
            <LoraLibraryFilterCombobox
              variant="bar"
              label={t('libraryFamilyFilter')}
              ariaLabel={t('baseModelFilterLabel')}
              value={activeFamily}
              options={familyOptions}
              onChange={setFamily}
              changed={activeFamily !== 'all'}
            />
          }
          end={
            <LoraLibraryFilterCombobox
              variant="bar"
              label={t('myLorasSortLabel')}
              ariaLabel={t('myLorasSortLabel')}
              value={sort}
              options={sortOptions}
              onChange={setSort}
              changed
            />
          }
        />
        {section === 'characters' && characterGroups.length > 1 ? (
          <div className="flex">
            <LiquidSegmented
              ariaLabel={t('librarySectionCharacters')}
              value={activeCharacterId}
              items={[
                { value: ALL_CHARACTERS, label: t('familyLabel.all') },
                ...characterGroups.map((group) => ({
                  value: group.characterCardId,
                  label: group.name,
                })),
              ]}
              onChange={setCharacterId}
            />
          </div>
        ) : null}
      </div>

      <div className="@container relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pt-1">
        {error ? (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-status-risk-surface px-3.5 py-3 text-xs text-status-risk">
            <span className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {t('myLorasErrorTitle')}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void onRefresh()}
            >
              {t('myLorasErrorRetry')}
            </Button>
          </div>
        ) : isLoading ? (
          <div className={LIBRARY_GRID_CLASS} aria-hidden>
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex flex-col gap-1.5">
                <span className="block aspect-3/4 rounded-12 bg-muted" />
                <span className="h-2.5 w-3/4 rounded bg-muted" />
                <span className="h-2.5 w-1/2 rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : source.length === 0 && showTrainTile ? (
          <div className={LIBRARY_GRID_CLASS}>
            <LibraryNewTile label={t('trainTitle')} onClick={onGoTrain} />
          </div>
        ) : source.length === 0 ? (
          <div className="grid h-full place-items-center">
            <div className="flex max-w-100 flex-col items-center gap-3 text-center">
              <p className="text-2sm leading-5 text-muted-foreground">
                {section === 'trained'
                  ? t('myLorasTrainedSectionEmpty')
                  : section === 'characters'
                    ? t('librarySectionCharactersEmpty')
                    : t('myLorasFavoritesEmpty')}
              </p>
              <Button
                type="button"
                variant="secondary"
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
            <div className={LIBRARY_GRID_CLASS}>
              {showTrainTile && !trimmedQuery ? (
                <LibraryNewTile label={t('trainTitle')} onClick={onGoTrain} />
              ) : null}
              {shown.map((asset) => (
                <LoraLibraryTile
                  key={asset.id}
                  name={asset.name}
                  meta={[
                    asset.baseModelFamily,
                    asset.triggerWord.trim() || tb('noTrigger'),
                  ].join(' · ')}
                  coverUrl={
                    asset.coverImageUrl
                      ? proxyCivitaiImageUrl(asset.coverImageUrl)
                      : null
                  }
                  mounted={isMounted(asset)}
                  onOpen={() => setOpenAsset(asset)}
                  onMount={() => mount(asset)}
                  pickId={asset.id}
                  favorite={
                    asset.source === 'trained'
                      ? undefined
                      : {
                          saved: isFavorited(asset.loraUrl),
                          onToggle: () => void toggleFavorite(asset),
                        }
                  }
                  onHandToAssistant={
                    hand ? () => hand(loraMention(asset)) : undefined
                  }
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
            characterLoraFor={(target) =>
              buildLibraryFavoriteRequest(favoriteFor(target) ?? target)
            }
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
