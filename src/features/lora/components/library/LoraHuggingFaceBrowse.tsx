'use client'

import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence } from 'motion/react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  DEFAULT_LORA_CONTENT_TYPE,
  DEFAULT_LORA_NSFW_FILTER,
  HUGGINGFACE_LORA_SORT_OPTIONS,
  LORA_CONTENT_TYPE_VALUES_BY_SOURCE,
  LORA_LIBRARY_BROWSE_PAGE_SIZE,
  LORA_LIBRARY_FAMILY_VALUES_BY_SOURCE,
  LORA_LIBRARY_SOURCES,
  LORA_TOAST_DURATION_MS,
  familySlugToHuggingFaceFamily,
  getLoraContentTypeDefinition,
  huggingFaceFamilyToFamilySlug,
  isHuggingFaceLoraSort,
  isHuggingFaceSocialThumbnailCoverUrl,
} from '@/constants/lora'
import { getCompatibleBases } from '@/features/lora/constants/lora-base-models'
import { useSendToLoraBench } from '@/contexts/studio-library-pick'
import { useActiveLoraStack } from '@/features/lora/hooks/use-active-lora-stack'
import { useHuggingFaceLoraLibraryWithUrl } from '@/features/lora/hooks/use-huggingface-lora-library-url'
import { useHuggingFaceShowcaseCover } from '@/features/lora/hooks/use-huggingface-showcase-cover'
import { useLoadMoreOnScroll } from '@/hooks/use-load-more-on-scroll'
import { useLoraSearchHistory } from '@/features/lora/hooks/use-lora-search-history'
import { formatCompactNumber } from '@/lib/format-compact-number'
import { isLoraBaseModelMountCompatible } from '@/features/lora/lib/lora-model-compatibility'
import {
  buildHuggingFaceFavoriteRequest,
  buildHuggingFaceSourceSnapshot,
  buildLibraryFavoriteRequest,
  huggingFaceAuthor,
} from '@/features/lora/lib/lora-source-snapshot'
import { cn } from '@/lib/utils'
import type {
  CivitaiLoraLibraryItem,
  FavoriteLoraRequest,
  HuggingFaceLoraFile,
  HuggingFaceLoraSearchItem,
  LoraAssetRecord,
} from '@/types'
import {
  LibraryGrid,
  LibraryNoResults,
  LibraryTileSkeletonGrid,
  LibraryToolbar,
} from '@/components/ui/library-kit'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import { FeedTail } from '@/components/business/FeedTail'
import { PageLoadError } from '@/components/business/PageLoadError'

import { useLoraStage } from '../lora-stage-context'
import { useLoraLibraryScope } from './lora-library-scope-context'
import { LoraLibraryDetailPage } from './LoraLibraryDetailPage'
import {
  LORA_CONTENT_TYPE_LABEL_KEYS,
  LORA_LIBRARY_FAMILY_LABEL_KEYS,
} from './lora-library-filter-labels'
import { LoraLibraryFilterCombobox } from './LoraLibraryFilterCombobox'
import { LoraLibrarySearchBox } from './LoraLibrarySearchBox'
import { LoraLibraryTile } from './LoraLibraryTile'
import { LoraLibraryTypeSparseCard } from './LoraLibraryTypeStates'

interface LoraHuggingFaceBrowseProps {
  /** Civitai / Hugging Face 那颗分段（来源记在网址里，由上层持有）。 */
  sourceSwitch: ReactNode
  onImport: (input: FavoriteLoraRequest) => Promise<LoraAssetRecord | null>
  onUnfavoriteByUrl: (loraUrl: string) => Promise<boolean>
  isFavorited: (loraUrl: string) => boolean
}

/**
 * 仓库里的一个权重文件 → 详情页与挂载栈吃的条目形状。
 *
 * ⚠ Hugging Face 没有的就空着（没有风格码、没有发布日期、没有 Civitai 那套权限位），
 *   许可与作者在出处快照里（`huggingFaceLicense` / `huggingFaceAuthor`）—— ⛔ 编。
 */
function fileToLibraryItem(
  repo: HuggingFaceLoraSearchItem,
  file: HuggingFaceLoraFile,
  retrievedAt: string,
): CivitaiLoraLibraryItem {
  const cover =
    repo.coverImageUrl &&
    !isHuggingFaceSocialThumbnailCoverUrl(repo.coverImageUrl)
      ? repo.coverImageUrl
      : null
  return {
    id: `huggingface:${repo.repoId}:${file.filename}`,
    styleCode: '',
    name: repo.name,
    source: 'imported',
    type: repo.type,
    baseModelFamily: file.baseModelFamily,
    provider: 'huggingface',
    triggerWord: repo.triggerWord,
    triggerAlternates: [],
    recommendedPrompt: null,
    recommendedPromptAlternates: [],
    triggerSource: 'official',
    fileHashAutoV3: null,
    loraUrl: file.downloadUrl,
    coverImageUrl: cover,
    coverImageUrlOriginal: null,
    thumbImageUrl: null,
    previewImageUrls: cover ? [cover] : [],
    defaultScale: 1,
    isPublic: true,
    isOwn: false,
    createdAt: '',
    modelId: 0,
    modelVersionId: 0,
    versionName: file.filename.split('/').pop() ?? file.filename,
    creatorName: huggingFaceAuthor(repo.repoId),
    creatorAvatarUrl: null,
    modelPageUrl: repo.modelPageUrl,
    tags: repo.tags,
    downloadCount: repo.downloads,
    thumbsUpCount: repo.likes,
    allowCommercialUse: [],
    allowDerivatives: false,
    fileSizeBytes: file.sizeBytes,
    sourceSnapshot: buildHuggingFaceSourceSnapshot({
      item: repo,
      file,
      retrievedAt,
    }),
  }
}

interface HuggingFaceTileProps {
  repo: HuggingFaceLoraSearchItem
  mounted: boolean
  onOpen: () => void
  onMount: () => void
}

/** 一格：封面是社交横幅兜底的，进视野再去 README 找第一张真图（找到前只铺底色）。 */
function HuggingFaceTile({
  repo,
  mounted,
  onOpen,
  onMount,
}: HuggingFaceTileProps) {
  // ⚠ 先拆开再用：整个返回对象当 ref 传会被 react-hooks/refs 判成 ref（见 LoraLibraryCard）。
  const { coverUrl, isPending, setObservedElement } =
    useHuggingFaceShowcaseCover(repo.repoId, repo.revision, repo.coverImageUrl)
  return (
    <div
      ref={setObservedElement}
      className="animate-in fade-in duration-base ease-linear motion-reduce:animate-none"
    >
      <LoraLibraryTile
        name={repo.name}
        meta={`↓ ${formatCompactNumber(repo.downloads)} · ♥ ${formatCompactNumber(repo.likes)}`}
        coverUrl={coverUrl}
        coverPending={isPending}
        mounted={mounted}
        onOpen={onOpen}
        onMount={onMount}
        mountChooses={repo.files.length > 1}
      />
    </div>
  )
}

/**
 * 库 B · Hugging Face（lora-library.md §3）：与 Civitai 同一副外壳 —— 一行筛选 →
 * 数量 → 网格往下滚着接 → 详情页。来源差异如实保留：
 *
 * - 没有分级（Hugging Face 不给），这一行就没有那一格；
 * - 上游不报总数：数量行写「已显示 N 个」，到底才写「共 N 个」—— ⛔ 编一个总数；
 * - 一个仓库可能有好几个权重文件：只有一个的原地挂，好几个的「挂载…」去详情页选，
 *   ⛔ 替用户挑第一个。
 *
 * ⭐ 挂载 = 直接进挂载栈（与 Civitai 一样），⛔ 顺手收藏、⛔ toast、⛔ 跳到生成台。
 */
export function LoraHuggingFaceBrowse({
  sourceSwitch,
  onImport,
  onUnfavoriteByUrl,
  isFavorited,
}: LoraHuggingFaceBrowseProps) {
  const t = useTranslations('LoraWorkbench')
  const tb = useTranslations('LoraWorkbench.browse')
  const stack = useActiveLoraStack()
  const sendToBench = useSendToLoraBench()
  const stage = useLoraStage()
  const library = useHuggingFaceLoraLibraryWithUrl({
    accumulate: true,
    limit: LORA_LIBRARY_BROWSE_PAGE_SIZE,
  })
  const searchHistory = useLoraSearchHistory()
  // 输入框里正在敲的字留在这里，回车 / 放大镜才交给 hook（⛔ 边敲边搜）。
  const [draft, setDraft] = useState(library.search)
  const [openRepo, setOpenRepo] = useState<HuggingFaceLoraSearchItem | null>(
    null,
  )
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  useLoadMoreOnScroll({
    scrollRef,
    sentinelRef,
    // 这批没拿到：停在尾巴上等你点「重试」，⛔ 滚着滚着自己跳过这一页（ui-defaults §7）。
    hasNextPage: library.hasNextPage && !library.error,
    itemCount: library.items.length,
    loadMore: library.loadMore,
  })

  const { remember } = searchHistory
  const { commitSearch: commitLibrarySearch, retrievedAtFor } = library
  const commitSearch = useCallback(
    (term: string) => {
      setDraft(term)
      commitLibrarySearch(term)
      remember(term)
    },
    [commitLibrarySearch, remember],
  )

  const isMounted = useCallback(
    (target: { loraUrl: string }) =>
      stack.items.some((entry) => entry.asset.loraUrl === target.loraUrl),
    [stack.items],
  )
  const fileOf = (repo: HuggingFaceLoraSearchItem, loraUrl: string) =>
    repo.files.find((file) => file.downloadUrl === loraUrl) ?? null

  const mountFile = useCallback(
    (repo: HuggingFaceLoraSearchItem, file: HuggingFaceLoraFile) => {
      // 台没开：去台上，台落地后说「已挂上 XXX」（带撤销与触发词，与库页同一处认领）。
      const already = stack.items.find(
        (entry) => entry.asset.loraUrl === file.downloadUrl,
      )
      if (already) {
        sendToBench?.({ assetId: already.asset.id, newlyMounted: false })
        return
      }
      // 没有可用底模的家族：去 Hugging Face 看，⛔ 挂上一个注定失败的。
      if (
        !getCompatibleBases(file.baseModelFamily).some((base) => base.available)
      ) {
        window.open(repo.modelPageUrl, '_blank', 'noopener,noreferrer')
        toast.info(t('huggingFaceUseRedirect', { name: repo.name }), {
          duration: LORA_TOAST_DURATION_MS,
        })
        return
      }
      const item = fileToLibraryItem(repo, file, retrievedAtFor(repo.repoId))
      stack.push(item)
      sendToBench?.({ assetId: item.id, newlyMounted: true })
    },
    [retrievedAtFor, sendToBench, stack, t],
  )
  const toggleFavorite = useCallback(
    (repo: HuggingFaceLoraSearchItem, file: HuggingFaceLoraFile) => {
      if (isFavorited(file.downloadUrl)) {
        void onUnfavoriteByUrl(file.downloadUrl)
        return
      }
      void onImport(
        buildHuggingFaceFavoriteRequest({
          item: repo,
          file,
          retrievedAt: retrievedAtFor(repo.repoId),
        }),
      )
    },
    [isFavorited, onImport, onUnfavoriteByUrl, retrievedAtFor],
  )

  const typeOptions = useMemo(
    () =>
      LORA_CONTENT_TYPE_VALUES_BY_SOURCE[LORA_LIBRARY_SOURCES.HUGGINGFACE].map(
        (value) => ({ value, label: t(LORA_CONTENT_TYPE_LABEL_KEYS[value]) }),
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

  const familySlug = huggingFaceFamilyToFamilySlug(library.baseModelFamily)
  const familyLabel =
    familyOptions.find((option) => option.value === familySlug)?.label ?? ''
  const typeLabel =
    typeOptions.find((option) => option.value === library.contentType)?.label ??
    ''
  const baseFiltered = library.baseModelFamily !== 'all'
  const canRelaxBase = baseFiltered
  const typeFiltered = library.contentType !== DEFAULT_LORA_CONTENT_TYPE

  const settledEmpty =
    !library.isLoading &&
    !library.isRevalidating &&
    library.items.length === 0 &&
    !library.error
  const searching =
    library.debouncedSearch !== '' && (library.isReplacing || library.isLoading)
  const typeFallbackTerm =
    library.contentType !== 'all'
      ? getLoraContentTypeDefinition(library.contentType).searchFallbackTerm
      : null
  const scope = [
    t('librarySourceHuggingFace'),
    baseFiltered ? familyLabel : null,
    typeFiltered ? typeLabel : null,
  ]
    .filter(Boolean)
    .join(' · ')

  // 详情页：好几个文件时先落在装得上当前底模的那一个（选中的那一行看得见，不是暗挑）。
  const openVersions = useMemo(
    () =>
      openRepo
        ? openRepo.files.map((file) =>
            fileToLibraryItem(openRepo, file, retrievedAtFor(openRepo.repoId)),
          )
        : [],
    [openRepo, retrievedAtFor],
  )
  const openItem =
    openVersions.find((version) =>
      stage.base
        ? isLoraBaseModelMountCompatible(
            version.baseModelFamily,
            stage.base.family,
          )
        : false,
    ) ?? openVersions[0]

  const { scope: libraryScope, note: libraryNote } = useLoraLibraryScope()

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* 工具行（ui-spec §9）：（库整页）分组药丸 · 类型切换条 · 底模 · 来源 ……… 搜索 · 排序。Hugging Face 没有分级。 */}
      <div className="flex shrink-0 flex-col gap-3 pb-3">
        <LibraryToolbar
          scope={libraryScope}
          segments={
            <LiquidSegmented
              ariaLabel={t('typeFilterLabel')}
              value={library.contentType}
              items={typeOptions}
              onChange={library.setContentType}
            />
          }
          searchFilled={draft !== ''}
          searchLabel={t('huggingFaceSearchPlaceholder')}
          search={
            <LoraLibrarySearchBox
              value={draft}
              onChange={(value) => {
                setDraft(value)
                // 删光了当场回到浏览（同 Civitai）。
                if (!value.trim()) commitLibrarySearch('')
              }}
              onSubmit={() => commitSearch(draft)}
              onPickHistory={commitSearch}
              history={searchHistory.history}
              onClearHistory={searchHistory.clear}
              pending={draft.trim() !== library.debouncedSearch}
              searching={searching}
              placeholder={t('huggingFaceSearchPlaceholder')}
            />
          }
          pills={
            <>
              <LoraLibraryFilterCombobox
                label={t('libraryFamilyFilter')}
                ariaLabel={t('baseModelFilterLabel')}
                value={familySlug}
                options={familyOptions}
                onChange={(slug) =>
                  library.setBaseModelFamily(
                    familySlugToHuggingFaceFamily(slug),
                  )
                }
                changed={baseFiltered}
                searchable
                searchPlaceholder={t('baseModelSearchPlaceholder')}
                emptyText={t('baseModelSearchEmpty')}
              />
              {sourceSwitch}
            </>
          }
          end={
            <>
              {libraryNote}
              <LoraLibraryFilterCombobox
                label={t('communitySortFilter')}
                ariaLabel={t('communitySortFilter')}
                value={library.sort}
                options={sortOptions}
                onChange={(value) => {
                  if (isHuggingFaceLoraSort(value)) library.setSort(value)
                }}
                changed
              />
            </>
          }
        />
      </div>

      <div
        ref={scrollRef}
        aria-busy={library.isRevalidating}
        className="@container relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-1"
      >
        {library.isLoading ? (
          <LibraryTileSkeletonGrid />
        ) : library.error && library.items.length === 0 ? (
          <PageLoadError
            title={t('huggingFaceLoadFailed')}
            onRetry={() => void library.refresh()}
            retrying={library.isRevalidating}
            className="mt-10"
          />
        ) : settledEmpty ? (
          // 搜不到（ui-defaults §7）：与 Civitai 同一个「没找到「x」」+ 清除搜索 / 放宽一项。
          <LibraryNoResults
            query={library.debouncedSearch}
            onClearSearch={() => commitSearch('')}
            hint={scope}
            actions={[
              ...(canRelaxBase
                ? [
                    {
                      key: 'base',
                      label: tb('relaxBase', { label: familyLabel }),
                      onClick: () => library.setBaseModelFamily('all'),
                    },
                  ]
                : []),
              ...(typeFiltered
                ? [
                    {
                      key: 'type',
                      label: tb('relaxType', { label: typeLabel }),
                      onClick: () =>
                        library.setContentType(DEFAULT_LORA_CONTENT_TYPE),
                    },
                  ]
                : []),
            ]}
          />
        ) : (
          <>
            <LibraryGrid
              className={cn(
                'transition-opacity duration-base ease-linear',
                library.isReplacing && 'opacity-42',
              )}
            >
              {library.items.map((repo) => (
                <HuggingFaceTile
                  key={repo.repoId}
                  repo={repo}
                  mounted={repo.files.some((file) =>
                    isMounted({ loraUrl: file.downloadUrl }),
                  )}
                  onOpen={() => setOpenRepo(repo)}
                  onMount={() => {
                    const [only] = repo.files
                    if (repo.files.length === 1 && only) mountFile(repo, only)
                    else setOpenRepo(repo)
                  }}
                />
              ))}
            </LibraryGrid>
            {typeFiltered && library.items.length <= 5 && typeFallbackTerm ? (
              <div className="mt-4">
                <LoraLibraryTypeSparseCard
                  source={LORA_LIBRARY_SOURCES.HUGGINGFACE}
                  searchFallbackTerm={typeFallbackTerm}
                  onSearchFallback={() => {
                    commitSearch(typeFallbackTerm)
                    library.setContentType(DEFAULT_LORA_CONTENT_TYPE)
                  }}
                />
              </div>
            ) : null}
            <FeedTail
              loading={library.isLoadingMore}
              error={library.error ? t('huggingFaceLoadFailed') : null}
              ended={!library.hasNextPage}
              onRetry={() => void library.refresh()}
              placeholder={<LibraryTileSkeletonGrid count={4} />}
              className="mt-2.5 pb-6"
            />
            <div ref={sentinelRef} aria-hidden className="h-px" />
          </>
        )}
      </div>

      {/* 详情是一页：从下面升上来盖住库，关上回到原来滚到的位置（列表没动过）。 */}
      <AnimatePresence>
        {openRepo && openItem ? (
          <LoraLibraryDetailPage
            key={openRepo.repoId}
            item={openItem}
            versions={openVersions}
            origin="huggingface"
            isMounted={isMounted}
            mountingId={null}
            onMount={(target) => {
              const file = fileOf(openRepo, target.loraUrl)
              if (file) mountFile(openRepo, file)
            }}
            isFavorited={(target) => isFavorited(target.loraUrl)}
            onToggleFavorite={(target) => {
              const file = fileOf(openRepo, target.loraUrl)
              if (file) toggleFavorite(openRepo, file)
            }}
            characterLoraFor={(target) => {
              const file = fileOf(openRepo, target.loraUrl)
              return file
                ? buildHuggingFaceFavoriteRequest({
                    item: openRepo,
                    file,
                    retrievedAt: retrievedAtFor(openRepo.repoId),
                  })
                : buildLibraryFavoriteRequest(target)
            }}
            nsfwFilter={DEFAULT_LORA_NSFW_FILTER}
            onClose={() => setOpenRepo(null)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  )
}
