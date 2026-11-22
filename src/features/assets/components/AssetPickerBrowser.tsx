'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  Lock,
  PanelLeft,
  Search,
  UploadCloud,
  X,
} from '@/components/icons'
import { useAuth } from '@clerk/nextjs'
import { useTranslations } from 'next-intl'

import { AssetTile } from '@/features/assets/components/AssetTile'
import {
  AssetEmptyFolder,
  AssetEmptyLibrary,
} from '@/features/assets/components/AssetStateBlocks'
import { FeedTail } from '@/components/business/FeedTail'
import { PageLoadError } from '@/components/business/PageLoadError'
import {
  LibraryNoResults,
  LibraryPillSelect,
  LibrarySearch,
} from '@/components/ui/library-kit'
import { Skeleton } from '@/components/ui/skeleton'
import {
  LIBRARY_PICKER_MAX_COLUMNS,
  LibraryPickBar,
  LibraryPickerHeader,
} from '@/components/ui/library-picker'
import {
  AssetPickerFolderNav,
  type PickerScope,
} from '@/features/assets/components/AssetPickerFolderNav'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { BlurSwap } from '@/components/ui/blur-swap'
import { Spinner } from '@/components/ui/spinner'
import { Input } from '@/components/ui/input'
import {
  ASSET_BROWSER_PAGE_SIZE,
  ASSET_GRID_AUDIO_ASPECT_RATIO,
  ASSET_GRID_GAP,
  ASSET_GRID_SKELETON_ASPECT_RATIOS,
  ASSET_PICKER_TARGET_ROW_HEIGHT,
  ASSET_PICKER_UPLOAD_CELL_ASPECT_RATIO,
  ASSET_TAIL_SKELETON_COUNT,
} from '@/constants/assets-grid'
import { getAudioPreviewCandidates } from '@/features/assets/audio-preview'
import { LIBRARY_GRID } from '@/constants/library-grid'
import {
  CLIENT_UPLOAD_MAX_BYTES,
  USER_IMAGE_UPLOAD_ACCEPTED_MIME_TYPES,
  USER_UPLOAD_PROVIDER,
} from '@/constants/uploads'
import { useGallery } from '@/hooks/use-gallery'
import {
  useAssetGridViewport,
  useJustifiedGrid,
} from '@/hooks/use-justified-grid'
import { useAssetPickerNavigation } from '@/features/assets/hooks/use-asset-picker-navigation'
import { uploadImageFileAPI } from '@/lib/api-client/generation'
import { getApiErrorMessage } from '@/lib/api-error-message'
import { prepareImageUpload } from '@/lib/prepare-image-upload'
import { toLayoutAspectRatio } from '@/lib/justified-layout'
import { cn } from '@/lib/utils'
import {
  GALLERY_SORT_OPTIONS,
  type GenerationRecord,
  type OutputTypeValue,
} from '@/types'

/**
 * picker 的**任务型 shell** —— `docs/references/pages/assets.md` §8。
 *
 * 与 `/assets` **不同构**（owner 2026-08-09 确认）：共享数据、筛选、网格、
 * 选择、上传的**行为/API/状态/可访问性**，但**不共享 shell 与信息架构**。
 * ⛔ 不把完整素材页缩进弹窗（现状病根）：这里**没有**文件夹门牌墙、**没有**
 * 密度控制、**没有**批量管理动作。
 *
 * 三条契约：
 * - **单选**：点瓦片 = 选中并立即关闭返回原任务；底部只有「取消」。
 * - **多选**：checkbox + 底部 `已选 N / 上限 M` + 「添加 N 张」；达到 `maxSelection`
 *   时**拒绝新增并就地红字提示**，⛔ 不静默吞掉点击。
 * - **mediaType 锁 = 不渲染，不是灰掉** —— 灰掉等于承诺「可选」，会误导。
 */

const PICKER_NAV_STORAGE_KEY = 'pv:assets:picker-nav'
const PICKER_RECENT_FOLDERS_KEY = 'pv:assets:picker-recent-folders'
const MAX_RECENT_FOLDERS = 3
/** 打字停 300ms 才写进筛选（与整页素材库同一拍）；回车立即搜。 */
const PICKER_SEARCH_DEBOUNCE_MS = 300

export interface AssetPickerBrowserProps {
  mode: 'single' | 'multi'
  mediaType?: OutputTypeValue
  maxSelection?: number
  /**
   * 首屏 / 每页取几条。缺省 `ASSET_BROWSER_PAGE_SIZE`（24，整页素材库那一档）。
   *
   * ⚠ 改的只是**页大小**，不是上限：无限滚动照旧往下翻，文件夹分类照旧。
   * 助手那颗弹层传 10（`STUDIO_OPERATOR_LIBRARY_PAGE_SIZE`）—— 顺手挑一张的场景
   * 一屏不需要铺 24 格，首屏还快。
   */
  pageSize?: number
  initialGenerations?: GenerationRecord[]
  initialTotal?: number
  initialHasMore?: boolean
  initialNextCursor?: string | null
  onSelect?: (generation: GenerationRecord) => void
  onConfirmMany?: (generations: GenerationRecord[]) => void
  onCancel: () => void
  title: string
}

function readLocalPreference(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function readRecentFolders(): string[] {
  try {
    const raw = window.localStorage.getItem(PICKER_RECENT_FOLDERS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string')
      : []
  } catch {
    return []
  }
}

export function AssetPickerBrowser(props: AssetPickerBrowserProps) {
  const { userId } = useAuth()
  return (
    <AssetPickerBrowserContent
      key={userId ?? 'anonymous'}
      {...props}
      cacheScope={`picker:${userId ?? 'anonymous'}`}
    />
  )
}

function AssetPickerBrowserContent({
  mode,
  cacheScope,
  mediaType,
  maxSelection,
  pageSize = ASSET_BROWSER_PAGE_SIZE,
  initialGenerations = [],
  initialTotal = 0,
  initialHasMore = false,
  initialNextCursor = null,
  onSelect,
  onConfirmMany,
  onCancel,
  title,
}: AssetPickerBrowserProps & { cacheScope: string }) {
  const t = useTranslations('AssetsPage')
  const tCommon = useTranslations('Common')
  const tErrors = useTranslations('Errors')
  const viewport = useAssetGridViewport()
  const isMobile = viewport === 'mobile'

  const [scope, setScope] = useState<PickerScope>({ kind: 'all' })
  /**
   * ⚠ 懒初始化直接读 localStorage 是**这里**才安全的：picker 挂在 Radix 的
   * portal 里，只有用户点开才渲染，服务端从来不渲染这棵子树 —— 所以不存在
   * hydration mismatch，也就不需要「先默认值、再 effect 里纠正」那一套
   * （那套会触发 react-hooks 的 setState-in-effect 规则）。
   */
  const [navOpen, setNavOpen] = useState(
    () => readLocalPreference(PICKER_NAV_STORAGE_KEY) !== 'collapsed',
  )
  const [scopeSheetOpen, setScopeSheetOpen] = useState(false)
  const [searchDraft, setSearchDraft] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [limitWarning, setLimitWarning] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  /** 一次挑了好几张：上传格上写「上传中 3/12」（加载中 2026-10-08 · 按钮里）。 */
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 })
  const [recentFolders, setRecentFolders] = useState<string[]>(() =>
    readRecentFolders(),
  )

  const {
    generations,
    isLoading,
    hasLoaded,
    hasMore,
    sentinelRef,
    filters,
    setFilters,
    prependGeneration,
    error,
    appendError,
    retry,
    retryLoadMore,
  } = useGallery({
    initialGenerations,
    initialTotal,
    initialHasMore,
    initialNextCursor,
    initialFilters: { types: mediaType ? [mediaType] : [] },
    mine: true,
    includeTotal: false,
    cacheScope,
    limit: pageSize,
  })

  const { projects, counts, refreshCounts } = useAssetPickerNavigation(
    cacheScope,
    mediaType,
    hasLoaded,
  )

  const toggleNav = useCallback(() => {
    setNavOpen((prev) => {
      try {
        window.localStorage.setItem(
          PICKER_NAV_STORAGE_KEY,
          prev ? 'collapsed' : 'open',
        )
      } catch {
        // ignore
      }
      return !prev
    })
  }, [])

  // 没有 SSR 数据，挂载后主动取第一页。
  useEffect(() => {
    setFilters({ ...filters, types: mediaType ? [mediaType] : [] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const applyScope = useCallback(
    (next: PickerScope) => {
      setScope(next)
      setScopeSheetOpen(false)
      if (next.kind === 'project') {
        setRecentFolders((prev) => {
          const merged = [
            next.id,
            ...prev.filter((id) => id !== next.id),
          ].slice(0, MAX_RECENT_FOLDERS)
          try {
            window.localStorage.setItem(
              PICKER_RECENT_FOLDERS_KEY,
              JSON.stringify(merged),
            )
          } catch {
            // ignore
          }
          return merged
        })
      }
      setFilters({
        ...filters,
        liked: next.kind === 'favorites',
        projectId:
          next.kind === 'unassigned'
            ? 'none'
            : next.kind === 'project'
              ? next.id
              : '',
        provider: '',
      })
    },
    [filters, setFilters],
  )

  const toggleSelection = useCallback(
    (id: string) => {
      setSelectedIds((prev) => {
        if (prev.includes(id)) {
          setLimitWarning(false)
          return prev.filter((entry) => entry !== id)
        }
        // 达到上限：**拒绝新增并就地红字提示**，不静默吞掉点击。
        if (maxSelection != null && prev.length >= maxSelection) {
          setLimitWarning(true)
          return prev
        }
        return [...prev, id]
      })
    },
    [maxSelection],
  )

  const handleUpload = useCallback(
    async (files: File[]) => {
      const images = files.filter((file) =>
        (USER_IMAGE_UPLOAD_ACCEPTED_MIME_TYPES as readonly string[]).includes(
          file.type,
        ),
      )
      if (images.length === 0) return
      setIsUploading(true)
      setUploadProgress({ done: 0, total: images.length })
      try {
        for (const [index, image] of images.entries()) {
          setUploadProgress({ done: index, total: images.length })
          const maxMb = String(CLIENT_UPLOAD_MAX_BYTES / 1024 / 1024)
          const prepared = await prepareImageUpload(image, {
            maxBytes: CLIENT_UPLOAD_MAX_BYTES,
            // 上传格自己写「上传中 n/m」，压缩那一下 ⛔ 再弹转圈黑条。
            inlineProgress: true,
            messages: {
              compressing: t('uploadCompressing'),
              compressed: ({ from, to }) => t('uploadCompressed', { from, to }),
              gifTooLarge: t('uploadGifTooLarge', { maxMb }),
              tooLarge: t('uploadFileTooLarge', { maxMb }),
            },
          })
          if (!prepared) continue
          const response = await uploadImageFileAPI(prepared, {
            projectId: scope.kind === 'project' ? scope.id : undefined,
          })
          if (!response.success || !response.data) {
            getApiErrorMessage(tErrors, response, t('uploadFailed'))
            continue
          }
          const generation = response.data.generation
          prependGeneration(generation)
          // 首格内联上传：**上传完成即选中**（§8.2）。
          if (mode === 'multi') toggleSelection(generation.id)
          else onSelect?.(generation)
        }
      } finally {
        setIsUploading(false)
        void refreshCounts()
      }
    },
    [
      mode,
      onSelect,
      prependGeneration,
      refreshCounts,
      scope,
      t,
      tErrors,
      toggleSelection,
    ],
  )

  // mediaType 锁：**不进候选**（不是灰掉）。引擎已按类型过滤，这里再兜一层，
  // 防止缓存里混进别的类型。
  const candidates = useMemo(
    () =>
      mediaType
        ? generations.filter((generation) =>
            outputTypeMatches(generation.outputType, mediaType),
          )
        : generations,
    [generations, mediaType],
  )

  const uploadEnabled = !mediaType || mediaType === 'image'
  const gridItems = useMemo(
    () => [
      ...(uploadEnabled ? [{ kind: 'upload' as const }] : []),
      ...candidates.map((generation) => ({
        kind: 'asset' as const,
        generation,
      })),
    ],
    [uploadEnabled, candidates],
  )
  // 首屏还没回来：与网格同形的灰格（同整页素材库那副骨架），⛔ 单个转圈。
  // 首屏失败另走错误块，所以这里排除 `error`。
  const showSkeleton =
    candidates.length === 0 && !error && (isLoading || !hasLoaded)
  const isEmpty = candidates.length === 0 && !error && !showSkeleton
  const aspectRatios = useMemo(
    () =>
      showSkeleton
        ? ASSET_GRID_SKELETON_ASPECT_RATIOS
        : gridItems.map((item) =>
            item.kind === 'upload'
              ? ASSET_PICKER_UPLOAD_CELL_ASPECT_RATIO
              : item.generation.outputType === 'AUDIO'
                ? ASSET_GRID_AUDIO_ASPECT_RATIO
                : toLayoutAspectRatio(
                    item.generation.width,
                    item.generation.height,
                  ),
          ),
    [showSkeleton, gridItems],
  )
  // 桌面 = 挑选框（ui-spec ㉔）：库那副等宽格、一行 6 张 3:4；手机照旧 justified 真实比例。
  const { containerRef, rows } = useJustifiedGrid({
    aspectRatios,
    targetRowHeight:
      ASSET_PICKER_TARGET_ROW_HEIGHT[isMobile ? 'mobile' : 'desktop'],
    gap: isMobile ? ASSET_GRID_GAP : LIBRARY_GRID.gap,
    uniform: isMobile
      ? undefined
      : {
          minTileWidth: LIBRARY_GRID.minTileWidth,
          maxColumns: LIBRARY_PICKER_MAX_COLUMNS,
          aspectRatio: LIBRARY_GRID.aspectRatio,
        },
  })
  const gridGap = isMobile ? ASSET_GRID_GAP : LIBRARY_GRID.gap

  const typeLabel = mediaType
    ? {
        image: t('sidebarImages'),
        video: t('sidebarVideos'),
        audio: t('sidebarAudio'),
        model_3d: t('sidebarModel3D'),
      }[mediaType]
    : null
  const lockLabel = typeLabel ? t('pickerLocked', { type: typeLabel }) : null
  const scopeLabel =
    scope.kind === 'project'
      ? (projects.find((project) => project.id === scope.id)?.name ??
        t('sidebarFolders'))
      : scope.kind === 'favorites'
        ? t('sidebarFavorites')
        : scope.kind === 'unassigned'
          ? t('sidebarUnassigned')
          : t('sidebarAll')

  const nav = (
    <AssetPickerFolderNav
      projects={projects}
      scope={scope}
      onScopeChange={applyScope}
      recentProjectIds={recentFolders}
      counts={{
        all: counts?.all,
        favorites: counts?.favorites,
        unassigned: counts?.unassigned,
        byProject: counts?.byProject,
      }}
      className={isMobile ? 'h-full w-full border-r-0' : 'w-50'}
    />
  )

  const selectedGenerations = () =>
    selectedIds
      .map((id) => candidates.find((generation) => generation.id === id))
      .filter((gen): gen is GenerationRecord => Boolean(gen))

  const uploadLabel = isUploading
    ? t('uploadingProgress', {
        current: Math.min(uploadProgress.total, uploadProgress.done + 1),
        total: uploadProgress.total,
      })
    : t('uploadButton')
  const uploadInput = (
    <input
      type="file"
      multiple
      accept={USER_IMAGE_UPLOAD_ACCEPTED_MIME_TYPES.join(',')}
      className="sr-only"
      onChange={(event) => {
        const files = Array.from(event.target.files ?? [])
        event.target.value = ''
        void handleUpload(files)
      }}
    />
  )

  const grid = (
    <div
      ref={containerRef}
      className="flex flex-col"
      style={{ gap: gridGap }}
      aria-busy={showSkeleton || undefined}
    >
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="flex" style={{ gap: gridGap }}>
          {row.boxes.map((box) => {
            if (showSkeleton) {
              return (
                <div
                  key={`skeleton-${box.index}`}
                  aria-hidden
                  data-testid="picker-skeleton-cell"
                  style={{ width: box.width, height: box.height }}
                  className={cn(
                    'shrink-0 bg-muted',
                    isMobile ? 'rounded-lg' : 'rounded-12',
                  )}
                />
              )
            }
            const item = gridItems[box.index]
            if (!item) return null
            if (item.kind === 'upload') {
              return (
                <label
                  key="picker-upload"
                  style={{ width: box.width, height: box.height }}
                  className={
                    isMobile
                      ? 'flex shrink-0 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/60 bg-muted/20 text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground'
                      : 'flex shrink-0 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-12 border border-dashed border-input text-xs text-ink-2 transition-colors duration-fast ease-standard hover:tint-hover focus-within:shadow-focus'
                  }
                >
                  {isUploading ? (
                    <Spinner size="sm" />
                  ) : (
                    <UploadCloud className={isMobile ? 'size-4' : 'size-4.5'} />
                  )}
                  <span className={isMobile ? 'text-3xs font-medium' : ''}>
                    <BlurSwap
                      swapKey={
                        isUploading
                          ? `${uploadProgress.done}/${uploadProgress.total}`
                          : 'idle'
                      }
                    >
                      {uploadLabel}
                    </BlurSwap>
                  </span>
                  {uploadInput}
                </label>
              )
            }
            const generation = item.generation
            return (
              <AssetTile
                key={generation.id}
                generation={generation}
                width={box.width}
                height={box.height}
                selected={selectedIds.includes(generation.id)}
                showSelectionMark={mode === 'multi'}
                selectionMode={mode === 'multi'}
                selectionTone={isMobile ? 'ink' : 'highlight'}
                draggable={false}
                audioCoverUrl={
                  generation.outputType === 'AUDIO'
                    ? getAudioPreviewCandidates(generation)[0]
                    : undefined
                }
                onAudioCoverError={() => {}}
                onClick={() => {
                  // 单选：点一下就返回，**1 击**。
                  if (mode === 'single') onSelect?.(generation)
                  else toggleSelection(generation.id)
                }}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
  const applySearch = (value: string) => {
    const next = value.trim()
    if (next !== filters.search) setFilters({ ...filters, search: next })
  }
  // 打字停 300ms 才写进筛选（同整页素材库）；回车走 `applySearch` 立即搜。
  useEffect(() => {
    const next = searchDraft.trim()
    if (next === filters.search) return
    const timer = window.setTimeout(
      () => setFilters({ ...filters, search: next }),
      PICKER_SEARCH_DEBOUNCE_MS,
    )
    return () => window.clearTimeout(timer)
  }, [searchDraft, filters, setFilters])
  const clearSearch = () => {
    setSearchDraft('')
    if (filters.search) setFilters({ ...filters, search: '' })
  }

  const sortSelect = (
    <LibraryPillSelect
      label={t('facetSort')}
      value={filters.sort}
      options={GALLERY_SORT_OPTIONS.map((value) => ({
        value,
        label: value === 'newest' ? t('facetSortNewest') : t('facetSortOldest'),
      }))}
      onChange={(sort) => setFilters({ ...filters, sort })}
    />
  )

  // 三态（page §7 同一套块，弹框尺寸）：首屏失败 → 一句话 + 重试；搜了没有 → 回显搜索词 +
  // 清除；这个范围是空的 → 说是哪个范围；整个库都没有这类 → 空库块。上传格（锁图片时）照旧在
  // 网格首格（空态块排在它后面），空态里不再给第二个上传入口。
  const loadError = error ? (
    <PageLoadError
      title={error}
      onRetry={retry}
      retrying={isLoading}
      className="my-2"
    />
  ) : null
  const emptyState = isEmpty ? (
    filters.search ? (
      <LibraryNoResults query={filters.search} onClearSearch={clearSearch} />
    ) : scope.kind !== 'all' ? (
      <AssetEmptyFolder
        variant="picker"
        folderName={scopeLabel}
        hint={t('pickerEmptyScopeHint')}
      />
    ) : (
      <AssetEmptyLibrary
        variant="picker"
        title={
          typeLabel ? t('pickerEmptyTypeTitle', { type: typeLabel }) : undefined
        }
      />
    )
  ) : null
  // 无限滚动的尾巴：与整页素材库同一条 `FeedTail` —— 在拿 = 接一排灰块；这一批没拿到 = 灰块
  // 底下一句「这批没拿到 · 重试」，⭐ 已加载的内容一个都不动、⛔ 自动重试。
  const tailRowHeight =
    ASSET_PICKER_TARGET_ROW_HEIGHT[isMobile ? 'mobile' : 'desktop']
  const more = (
    <>
      <FeedTail
        loading={isLoading && candidates.length > 0}
        error={appendError}
        ended={false}
        onRetry={retryLoadMore}
        placeholder={
          <div
            aria-hidden
            className="flex w-full"
            style={{ gap: gridGap, height: tailRowHeight }}
          >
            {ASSET_GRID_SKELETON_ASPECT_RATIOS.slice(
              0,
              ASSET_TAIL_SKELETON_COUNT,
            ).map((ratio, index) => (
              <Skeleton
                key={index}
                className="h-full min-w-0 rounded-lg bg-muted"
                style={{ flex: `${ratio} 1 0` }}
              />
            ))}
          </div>
        }
      />
      {hasMore && !appendError && (
        <div ref={sentinelRef} className="h-2 shrink-0" />
      )}
    </>
  )

  if (!isMobile) {
    // 桌面 = 挑选框（ui-spec §9 ㉔，样件 E S16）：框顶标题 + 锁 + ×；左栏 200（智能视图 /
    // 最近用过 / 文件夹）；右边搜索 + 一行 6 张；挑了才浮出黑条。
    return (
      <div className="flex size-full flex-col">
        <LibraryPickerHeader
          title={title}
          lock={lockLabel}
          closeLabel={tCommon('close')}
          onClose={onCancel}
          start={
            <button
              type="button"
              onClick={toggleNav}
              aria-label={t('pickerNavToggle')}
              aria-expanded={navOpen}
              className="-ml-1.5 grid size-8 shrink-0 place-items-center rounded-full text-ink-2 transition-colors duration-fast ease-standard hover:tint-hover hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus"
            >
              <PanelLeft className="size-4" />
            </button>
          }
        />
        <div className="flex min-h-0 flex-1">
          {navOpen && nav}
          {/* `min-w-0`：网格行是定宽格（`shrink-0`），首帧按假定宽 1200 排；没有它，`<main>` 的
              最小内容宽被那排格子撑到 1200+，网格再量到的就是这个被撑开的宽 → 永远溢出弹框。 */}
          <main className="relative flex min-w-0 min-h-0 flex-1 flex-col">
            <div className="studio-scrollbar flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 pt-3.5 pb-20">
              {/* 顶部搜索只搜**素材内容**（提示词/模型）；搜文件夹在左栏自己的搜索框里。
                  排序跟在搜索右边（同整页素材库那颗药丸）。 */}
              <div className="flex shrink-0 items-center gap-2">
                <div className="min-w-0 flex-1">
                  <LibrarySearch
                    value={searchDraft}
                    onChange={setSearchDraft}
                    placeholder={t('search')}
                    label={t('search')}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return
                      event.preventDefault()
                      applySearch(searchDraft)
                    }}
                  />
                </div>
                {sortSelect}
              </div>
              {loadError}
              {grid}
              {emptyState}
              {more}
            </div>
            {mode === 'multi' ? (
              <LibraryPickBar
                count={selectedIds.length}
                countLabel={
                  maxSelection != null
                    ? t('pickerSelectedWithMax', {
                        count: selectedIds.length,
                        max: maxSelection,
                      })
                    : t('selectedCount', { count: selectedIds.length })
                }
                warning={
                  limitWarning && maxSelection != null
                    ? t('pickerMaxReachedInline', { max: maxSelection })
                    : null
                }
                cancelLabel={t('selectExit')}
                confirmLabel={t('pickerConfirmAdd', {
                  count: selectedIds.length,
                })}
                onCancel={onCancel}
                onConfirm={() => onConfirmMany?.(selectedGenerations())}
              />
            ) : null}
          </main>
        </div>
      </div>
    )
  }

  // 手机：照旧（等手机整体重设计）。
  return (
    <div className="flex size-full flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-2">
        <button
          type="button"
          onClick={() => setScopeSheetOpen(true)}
          aria-label={t('pickerNavToggle')}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          <PanelLeft className="size-3.5" />
        </button>
        <span className="min-w-0 truncate text-xs font-medium text-foreground">
          {title}
        </span>
        <span className="shrink-0 rounded-md border border-border/60 px-1.5 py-0.5 text-3xs text-muted-foreground">
          {scopeLabel}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {lockLabel && (
            <span className="flex items-center gap-1 rounded-md border border-border/60 px-1.5 py-0.5 text-3xs text-muted-foreground">
              <Lock className="size-2.5" />
              {lockLabel}
            </span>
          )}
          <button
            type="button"
            onClick={onCancel}
            aria-label={tCommon('close')}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="studio-scrollbar assets-scroll-gutter flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
          {/* 顶部搜索只搜**素材内容**（提示词/模型）；搜文件夹在导航栏自己的
              搜索框里，两者不混（§8.2）。排序药丸跟在搜索框右边。 */}
          <div className="mb-2 flex shrink-0 items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder={t('search')}
                aria-label={t('search')}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  applySearch(searchDraft)
                }}
                className="h-8 pl-8 pr-2"
              />
            </div>
            {sortSelect}
          </div>

          {loadError}
          {grid}
          {emptyState}
          {more}
        </main>
      </div>

      <footer className="flex shrink-0 items-center gap-2 border-t border-border/60 px-3 py-2">
        {mode === 'multi' ? (
          <>
            <span className="text-xs tabular-nums text-foreground">
              {maxSelection != null
                ? t('pickerSelectedWithMax', {
                    count: selectedIds.length,
                    max: maxSelection,
                  })
                : t('selectedCount', { count: selectedIds.length })}
            </span>
            {limitWarning && maxSelection != null && (
              <span className="min-w-0 truncate text-2xs text-destructive">
                {t('pickerMaxReachedInline', { max: maxSelection })}
              </span>
            )}
            <button
              type="button"
              onClick={onCancel}
              className="ml-auto rounded-lg px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {t('selectExit')}
            </button>
            <button
              type="button"
              disabled={selectedIds.length === 0}
              onClick={() => onConfirmMany?.(selectedGenerations())}
              className="flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <CheckCircle2 className="size-3.5" />
              {t('pickerConfirmAdd', { count: selectedIds.length })}
            </button>
          </>
        ) : (
          // 单选：底部**只有「取消」**（点瓦片就返回了，没有确认步骤）。
          <button
            type="button"
            onClick={onCancel}
            className="ml-auto rounded-lg px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {t('selectExit')}
          </button>
        )}
      </footer>

      {/* <768：导航栏塌成范围 sheet，**同一份数据换个壳**；选中即收起。 */}
      <Sheet open={scopeSheetOpen} onOpenChange={setScopeSheetOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">{t('sidebarFolders')}</SheetTitle>
          {nav}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function outputTypeMatches(
  outputType: GenerationRecord['outputType'],
  mediaType: OutputTypeValue,
): boolean {
  if (outputType === 'IMAGE') return mediaType === 'image'
  if (outputType === 'VIDEO') return mediaType === 'video'
  if (outputType === 'AUDIO') return mediaType === 'audio'
  return mediaType === 'model_3d'
}

/** 上传行只认图片 —— 音频/3D picker 用不上它。 */
export const PICKER_UPLOAD_PROVIDER = USER_UPLOAD_PROVIDER
