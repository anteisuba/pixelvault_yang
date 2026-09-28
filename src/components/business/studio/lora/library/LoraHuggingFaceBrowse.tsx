'use client'

import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence } from 'motion/react'
import { useFormatter, useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { AlertCircle } from '@/components/icons'
import {
  DEFAULT_HUGGINGFACE_LORA_SORT,
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
import { getCompatibleBases } from '@/constants/lora-base-models'
import { useActiveLoraStack } from '@/hooks/use-active-lora-stack'
import { useHuggingFaceLoraLibraryWithUrl } from '@/hooks/use-huggingface-lora-library-url'
import { useHuggingFaceShowcaseCover } from '@/hooks/use-huggingface-showcase-cover'
import { useLoadMoreOnScroll } from '@/hooks/use-load-more-on-scroll'
import { useLoraSearchHistory } from '@/hooks/use-lora-search-history'
import { formatCompactNumber } from '@/lib/format-compact-number'
import { isLoraBaseModelMountCompatible } from '@/lib/lora-model-compatibility'
import {
  buildHuggingFaceFavoriteRequest,
  buildHuggingFaceSourceSnapshot,
  huggingFaceAuthor,
} from '@/lib/lora-source-snapshot'
import { cn } from '@/lib/utils'
import type {
  CivitaiLoraLibraryItem,
  FavoriteLoraRequest,
  HuggingFaceLoraFile,
  HuggingFaceLoraSearchItem,
  LoraAssetRecord,
} from '@/types'
import { Button } from '@/components/ui/button'

import { useLoraStage } from '../lora-stage-context'
import { LoraLibraryDetailPage } from './LoraLibraryDetailPage'
import {
  LORA_CONTENT_TYPE_LABEL_KEYS,
  LORA_LIBRARY_FAMILY_LABEL_KEYS,
} from './lora-library-filter-labels'
import { LoraLibraryFilterCombobox } from './LoraLibraryFilterCombobox'
import { LoraLibrarySearchBox } from './LoraLibrarySearchBox'
import { LoraLibraryTile } from './LoraLibraryTile'
import { LoraLibraryTypeSparseCard } from './LoraLibraryTypeStates'

/** 首屏还没有结果时铺几格占位（6 列 × 2 行）。 */
const SKELETON_TILES = 12

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
  const format = useFormatter()
  const stack = useActiveLoraStack()
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
    hasNextPage: library.hasNextPage,
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
      if (isMounted({ loraUrl: file.downloadUrl })) return
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
      stack.push(fileToLibraryItem(repo, file, retrievedAtFor(repo.repoId)))
    },
    [isMounted, retrievedAtFor, stack, t],
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
  const typeFiltered = library.contentType !== DEFAULT_LORA_CONTENT_TYPE

  const settledEmpty =
    !library.isLoading &&
    !library.isRevalidating &&
    library.items.length === 0 &&
    !library.error
  const searching =
    library.debouncedSearch !== '' && (library.isReplacing || library.isLoading)
  const shown = format.number(library.items.length)
  // 上游不报总数；到底了手上这些就是全部。
  const exactTotal =
    library.total ?? (library.hasNextPage ? null : library.items.length)
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

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* 一行筛选：搜索占满，其余按内容宽；Hugging Face 没有分级那一格。 */}
      <div className="flex shrink-0 items-center gap-2 px-5 pt-4">
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
        {sourceSwitch}
        <LoraLibraryFilterCombobox
          variant="bar"
          label={t('libraryTypeFilter')}
          ariaLabel={t('typeFilterLabel')}
          value={library.contentType}
          options={typeOptions}
          onChange={library.setContentType}
          changed={typeFiltered}
        />
        <LoraLibraryFilterCombobox
          variant="bar"
          label={t('libraryFamilyFilter')}
          ariaLabel={t('baseModelFilterLabel')}
          value={familySlug}
          options={familyOptions}
          onChange={(slug) =>
            library.setBaseModelFamily(familySlugToHuggingFaceFamily(slug))
          }
          changed={baseFiltered}
          searchable
          searchPlaceholder={t('baseModelSearchPlaceholder')}
          emptyText={t('baseModelSearchEmpty')}
        />
        <LoraLibraryFilterCombobox
          variant="bar"
          label={t('communitySortFilter')}
          ariaLabel={t('communitySortFilter')}
          value={library.sort}
          options={sortOptions}
          onChange={(value) => {
            if (isHuggingFaceLoraSort(value)) library.setSort(value)
          }}
          changed={library.sort !== DEFAULT_HUGGINGFACE_LORA_SORT}
        />
      </div>

      {/* 数量一行：有总数写总数，没有写「已显示 N 个」；搜着的时候写在搜什么。 */}
      {settledEmpty ? null : (
        <p
          role="status"
          className="flex shrink-0 items-baseline gap-2.5 px-5 pb-2.5 pt-3 text-xs text-muted-foreground"
        >
          {searching ? (
            <span>{tb('searching', { query: library.debouncedSearch })}</span>
          ) : library.isLoading ? null : exactTotal !== null ? (
            <>
              <b className="text-sm font-semibold tabular-nums text-foreground">
                {format.number(exactTotal)}
              </b>
              <span>{tb('countUnit', { count: exactTotal })}</span>
            </>
          ) : (
            <span>{tb('shownCount', { count: shown })}</span>
          )}
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
              {t('huggingFaceLoadFailed')}
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
                {baseFiltered || typeFiltered
                  ? tb('emptyBodyLoosen', { scope })
                  : tb('emptyBodyNoRelax', { scope })}
              </p>
              {baseFiltered || typeFiltered ? (
                <div className="mt-1.5 flex flex-wrap justify-center gap-2">
                  {baseFiltered ? (
                    <button
                      type="button"
                      onClick={() => library.setBaseModelFamily('all')}
                      className={relaxButton}
                    >
                      {tb('relaxBase', { label: familyLabel })}
                    </button>
                  ) : null}
                  {typeFiltered ? (
                    <button
                      type="button"
                      onClick={() =>
                        library.setContentType(DEFAULT_LORA_CONTENT_TYPE)
                      }
                      className={relaxButton}
                    >
                      {tb('relaxType', { label: typeLabel })}
                    </button>
                  ) : null}
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
            </div>
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
            {library.isLoadingMore ? (
              <p
                role="status"
                className="flex items-center justify-center gap-2 pb-5.5 pt-4.5 text-xs text-muted-foreground"
              >
                <span
                  aria-hidden
                  className="lora-breath size-1.5 rounded-full bg-foreground"
                />
                {tb('loadingMoreShown', { shown })}
              </p>
            ) : !library.hasNextPage ? (
              <p className="flex items-center gap-2.5 pb-6.5 pt-5.5 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
                {tb('end', { count: shown })}
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
            nsfwFilter={DEFAULT_LORA_NSFW_FILTER}
            onClose={() => setOpenRepo(null)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  )
}

const relaxButton =
  'inline-flex h-8.5 items-center gap-1.5 rounded-full border border-border px-3.25 text-2sm text-foreground transition-colors duration-fast ease-linear hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
