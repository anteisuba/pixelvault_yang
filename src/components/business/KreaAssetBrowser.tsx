'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  CheckCircle2,
  ChevronDown,
  Folder,
  FolderInput,
  Globe,
  Heart,
  Image as ImageIcon,
  LayoutGrid,
  FolderX,
  MoreHorizontal,
  PanelLeft,
  Pin,
  Trash2,
  UploadCloud,
  X,
} from '@/components/icons'
import { useTranslations } from 'next-intl'
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'motion/react'
import { toast } from 'sonner'

import { AssetDetailSheet } from '@/components/business/AssetDetailSheet'
import { AssetAddToFolderPanel } from '@/components/business/assets/AssetAddToFolderPanel'
import { AssetFacetBar } from '@/components/business/assets/AssetFacetBar'
import { AssetFolderMenu } from '@/components/business/assets/AssetFolderMenu'
import { AssetScopePopover } from '@/components/business/assets/AssetScopePopover'
import {
  AssetSelectionMorph,
  SelectionArmButton,
  SelectionLink,
} from '@/components/business/assets/AssetSelectionMorph'
import {
  AssetFolderSidebar,
  type AssetFolderScope,
} from '@/components/business/assets/AssetFolderSidebar'
import { AssetTile } from '@/components/business/assets/AssetTile'
import {
  AssetEmptyFolder,
  AssetEmptyLibrary,
  AssetEmptySearch,
} from '@/components/business/assets/AssetStateBlocks'
import { FeedTail } from '@/components/business/FeedTail'
import { PageLoadError } from '@/components/business/PageLoadError'
import { revealStep, useRevealBatchStart } from '@/components/ui/load-reveal'
import { Skeleton } from '@/components/ui/skeleton'
import { useSlowLoadingNotice } from '@/hooks/use-slow-loading-notice'
import { AssetUploadQueuePanel } from '@/components/business/assets/AssetUploadQueuePanel'
import { AssetUploadTile } from '@/components/business/assets/AssetUploadTile'
import { AssetViewer } from '@/components/business/assets/AssetViewer'
import { toMediaTransitionOrigin } from '@/components/business/MediaDetailViewer'
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
import { BlurSwap } from '@/components/ui/blur-swap'
import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyState as EmptyStateTemplate } from '@/components/ui/empty-state'
import {
  FeedbackButton,
  useButtonFeedback,
  type ButtonFeedback,
} from '@/components/ui/feedback-button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet'
import { RollingNumber } from '@/components/ui/rolling-number'
import { Spinner } from '@/components/ui/spinner'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import { useAssetFolders } from '@/hooks/use-asset-folders'
import { useGallery, type GalleryFilters } from '@/hooks/use-gallery'
import { useLocalPreference } from '@/hooks/use-local-preference'
import { useIsPhone } from '@/hooks/use-mobile'
import {
  useAssetUploadQueue,
  type UploadQueueItem,
  type UploadResult,
} from '@/hooks/use-asset-upload-queue'
import {
  useAssetGridViewport,
  useJustifiedGrid,
} from '@/hooks/use-justified-grid'
import { useStableDragState } from '@/hooks/use-stable-drag-state'
import { ROUTES } from '@/constants/routes'
import { PROJECT } from '@/constants/config'
import {
  DURATION_MS,
  LIQUID_SPRING,
  motionTransition,
} from '@/constants/motion'
import { ASSET_DND_MIME } from '@/constants/asset-dnd'
import {
  DEFAULT_AUDIO_ASSET_PREVIEW_IMAGE,
  getAudioAssetPreviewImage,
} from '@/constants/asset-previews'
import {
  ASSET_BROWSER_PAGE_SIZE,
  ASSET_FOLDER_RAIL_GAP,
  ASSET_FOLDER_RAIL_STORAGE_KEY,
  ASSET_FOLDER_RAIL_WIDTH,
  ASSET_VIEWER_MIN_COLUMN_WIDTH,
  ASSET_FOLDER_UNDO_DURATION_MS,
  ASSET_GRID_AUDIO_ASPECT_RATIO,
  ASSET_GRID_DEFAULT_DENSITY,
  ASSET_GRID_DENSITIES,
  ASSET_GRID_DENSITY_STORAGE_KEY,
  ASSET_GRID_GAP,
  ASSET_GRID_ROW_OVERSCAN,
  ASSET_GRID_SKELETON_ASPECT_RATIOS,
  ASSET_TAIL_SKELETON_COUNT,
  ASSET_GRID_TARGET_ROW_HEIGHT,
  ASSET_PICKER_UPLOAD_CELL_ASPECT_RATIO,
  type AssetGridDensity,
} from '@/constants/assets-grid'
import {
  CLIENT_AUDIO_UPLOAD_MAX_BYTES,
  CLIENT_VIDEO_UPLOAD_MAX_BYTES,
  USER_UPLOAD_ACCEPTED_MIME_TYPES,
  CLIENT_UPLOAD_MAX_BYTES,
  USER_UPLOAD_PROVIDER,
  USER_AUDIO_UPLOAD_ACCEPTED_MIME_TYPES,
  USER_VIDEO_UPLOAD_ACCEPTED_MIME_TYPES,
} from '@/constants/uploads'
import { Link, useRouter } from '@/i18n/navigation'
import {
  batchDeleteGenerationsAPI,
  batchSetLikeAPI,
  batchUpdateVisibilityAPI,
  fetchAssetSectionCounts,
} from '@/lib/api-client/gallery'
import { updateFolderItemsAPI } from '@/lib/api-client/projects'
import { toggleLikeAPI } from '@/lib/api-client/profile'
import {
  uploadAudioFileAPI,
  uploadImageFileAPI,
  uploadVideoFileAPI,
} from '@/lib/api-client/generation'
import { readAudioFileMetadata } from '@/lib/audio-metadata'
import { getApiErrorMessage } from '@/lib/api-error-message'
import { prepareImageUpload } from '@/lib/prepare-image-upload'
import { runUndoableAction } from '@/lib/undoable-action'
import { clearGalleryCache } from '@/lib/gallery-cache'
import {
  getChildFolders,
  getFolderPath,
  getFolderSubtreeIds,
} from '@/lib/folder-tree'
import { toLayoutAspectRatio } from '@/lib/justified-layout'
import { cn } from '@/lib/utils'
import { SearchGroundingPublishNote } from '@/components/business/studio-shared/search-grounding/SearchGroundingPublishNote'
import { isTouchPrimary } from '@/lib/touch'
import {
  captureVideoThumbnail,
  readVideoFileMetadata,
} from '@/lib/video-thumbnail'
import type {
  AssetSectionCounts,
  GenerationRecord,
  ProjectRecord,
} from '@/types'

type LockedMediaType = 'image' | 'video' | 'audio' | 'model_3d'

interface KreaAssetBrowserProps {
  initialGenerations?: GenerationRecord[]
  initialSelectedGeneration?: GenerationRecord | null
  initialPage?: number
  initialHasMore?: boolean
  initialNextCursor?: string | null
  initialTotal?: number
  initialFilters?: GalleryFilters
  className?: string
}

const DEFAULT_FILTERS: GalleryFilters = {
  search: '',
  models: [],
  sort: 'newest',
  types: [],
  timeRange: 'all',
  liked: false,
  published: false,
  projectId: '',
  provider: '',
}

const USER_UPLOAD_ACCEPT = USER_UPLOAD_ACCEPTED_MIME_TYPES.join(',')

/** 网格里排的一格：素材瓦片，或 picker 首格的内联上传格。 */
type GridItem =
  | { kind: 'upload' }
  | { kind: 'pending'; item: UploadQueueItem }
  | { kind: 'asset'; generation: GenerationRecord }

function getAudioPreviewCandidates(generation: GenerationRecord): string[] {
  const snapshot = isPlainObject(generation.snapshot)
    ? generation.snapshot
    : null
  const voiceId = getSnapshotString(snapshot, 'voiceId')
  const voiceCoverImage =
    getSnapshotString(snapshot, 'voiceCoverImage') ??
    getSnapshotString(snapshot, 'coverImage')

  return [
    generation.thumbnailUrl,
    generation.previewUrl,
    voiceCoverImage,
    getAudioAssetPreviewImage(generation.model, voiceId),
    DEFAULT_AUDIO_ASSET_PREVIEW_IMAGE,
  ].filter((url): url is string => Boolean(url))
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getSnapshotString(
  snapshot: Record<string, unknown> | null,
  key: string,
): string | null {
  if (!snapshot) return null
  const value = snapshot[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isDensity(value: string | null): value is AssetGridDensity {
  return (ASSET_GRID_DENSITIES as readonly string[]).includes(value ?? '')
}

/**
 * 用来判断「新素材还属不属于当前视图」的单一媒体类型。
 * ⚠ 类型分面是可叠加的，选了两种以上就没有「唯一类型」可言 —— 那种情况下
 * 返回 null，由 `shouldKeepAssetAfterPatch` 走 `types` 数组自己判。
 */
function getActiveMediaType(filters: GalleryFilters): LockedMediaType | null {
  return filters.types.length === 1 ? filters.types[0] : null
}

/** 文件夹范围 ⇄ 地址栏 `?projectId=`（`none` = 未归档）。 */
function folderScopeFromFilters(filters: GalleryFilters): AssetFolderScope {
  if (filters.projectId === 'none') return { kind: 'unassigned' }
  if (filters.projectId) return { kind: 'folder', id: filters.projectId }
  return { kind: 'all' }
}

function folderScopeParam(scope: AssetFolderScope): string {
  if (scope.kind === 'unassigned') return 'none'
  return scope.kind === 'folder' ? scope.id : ''
}

function outputTypeMatchesMediaType(
  outputType: GenerationRecord['outputType'],
  type: LockedMediaType,
): boolean {
  if (outputType === 'IMAGE') return type === 'image'
  if (outputType === 'VIDEO') return type === 'video'
  if (outputType === 'AUDIO') return type === 'audio'
  if (outputType === 'MODEL_3D') return type === 'model_3d'
  return false
}

/**
 * 改了收藏 / 发布 / 类型之后，这一件还留不留在当前筛选里。
 * ⚠ 文件夹不在这里判：归属只由「加入文件夹」改，那一路自己算谁离开当前范围。
 */
function shouldKeepAssetAfterPatch(
  filters: GalleryFilters,
  generation: GenerationRecord,
): boolean {
  if (
    filters.types.length > 0 &&
    !filters.types.some((type) =>
      outputTypeMatchesMediaType(generation.outputType, type),
    )
  ) {
    return false
  }
  if (filters.liked && !generation.isLiked) return false
  if (filters.published && !generation.isPublic) return false
  if (filters.provider && generation.provider !== filters.provider) return false
  return true
}

function getVisibilityDelta(
  before: boolean | undefined,
  after: boolean | undefined,
): number {
  if (after === undefined || before === after) return 0
  return after ? 1 : -1
}

function applyCountDelta(value: number, delta: number): number {
  return Math.max(value + delta, 0)
}

function updateCountsAfterAssetPatch(
  counts: AssetSectionCounts | null,
  generation: GenerationRecord,
  patch: Partial<GenerationRecord>,
): AssetSectionCounts | null {
  if (!counts) return counts

  const publishedDelta = getVisibilityDelta(generation.isPublic, patch.isPublic)
  const favoriteDelta = getVisibilityDelta(generation.isLiked, patch.isLiked)

  if (publishedDelta === 0 && favoriteDelta === 0) return counts

  return {
    ...counts,
    published: applyCountDelta(counts.published, publishedDelta),
    favorites: applyCountDelta(counts.favorites, favoriteDelta),
  }
}

/**
 * KreaAssetBrowser — full-page asset browser with a Krea-style right sidebar.
 *
 * Asset browsing uses two filter dimensions: the top media switcher controls
 * output type, while the right sidebar controls scope such as Favorites,
 * published assets, uploads, and folders.
 */
export function KreaAssetBrowser({
  initialGenerations = [],
  initialSelectedGeneration = null,
  initialPage = 1,
  initialHasMore = false,
  initialNextCursor = null,
  initialTotal = 0,
  initialFilters = DEFAULT_FILTERS,
  className,
}: KreaAssetBrowserProps) {
  const t = useTranslations('AssetsPage')
  const tErrors = useTranslations('Errors')
  const tSearch = useTranslations('SearchGrounding')
  const tFeedback = useTranslations('Feedback')
  const router = useRouter()
  const reducedMotion = useReducedMotion()
  const [isToolbarStuck, setIsToolbarStuck] = useState(false)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const facetStartRef = useRef<HTMLDivElement>(null)
  const selectButtonRef = useRef<HTMLButtonElement>(null)

  const effectiveInitialFilters: GalleryFilters = initialFilters
  const {
    generations,
    total,
    isLoading,
    hasMore,
    error: galleryError,
    appendError,
    retry: retryGallery,
    retryLoadMore,
    sentinelRef,
    filters,
    setFilters,
    removeGeneration,
    prependGeneration,
    insertGeneration,
    updateGeneration,
  } = useGallery({
    initialGenerations,
    initialPage,
    initialHasMore,
    initialNextCursor,
    initialTotal,
    initialFilters: effectiveInitialFilters,
    mine: true,
    limit: ASSET_BROWSER_PAGE_SIZE,
    // Page-level callers (AssetsPage) supply SSR data — the additional
    // initial fetch was double-loading every visit. Dialog callers pass
    // no SSR data, so we only refetch when the initial list is empty
    // AND there's no SSR-provided total to trust.
    //
    // `keepPreviousOnFilterChange` intentionally omitted: useGallery now
    // serves cached snapshots for previously-visited filter combinations
    // (instant switch back) and clears to the skeleton state on the
    // genuinely-uncached miss, which is the Krea-style feedback users
    // expect.
  })

  // When mounted without SSR data (e.g. inside AssetSelectorDialog),
  // re-apply the filters once so useGallery actually fetches the first
  // page — it doesn't auto-fetch on mount because page-level callers
  // already supply server-rendered initialGenerations.
  const ssrPrimed = initialGenerations.length > 0 || initialTotal > 0
  const didInitialFetchRef = useRef(false)
  useEffect(() => {
    if (didInitialFetchRef.current) return
    didInitialFetchRef.current = true
    if (!ssrPrimed) {
      setFilters(filters)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const folderStore = useAssetFolders()
  const { folders, refresh: refreshFolders } = folderStore
  const folderScope = useMemo(() => folderScopeFromFilters(filters), [filters])
  const scopeFolder =
    folderScope.kind === 'folder'
      ? (folders.find((folder) => folder.id === folderScope.id) ?? null)
      : null
  const scopeParent = scopeFolder?.parentId
    ? (folders.find((folder) => folder.id === scopeFolder.parentId) ?? null)
    : null
  /** 段头「在 A / B 里」：层数不限，写整条父路径（Esc 仍只退回直接父夹）。 */
  const scopeParentPath = scopeFolder
    ? getFolderPath(folders, scopeFolder.id)
        .slice(0, -1)
        .map((folder) => folder.name)
        .join(' / ')
    : ''
  const activeMediaType = getActiveMediaType(filters)
  /** 生效的类型口径 = 类型分面本身（空 = 不限）。 */
  const scopedTypes: LockedMediaType[] = filters.types

  // Aggregate sidebar counts. One request per page load instead of one
  // per item — and the All count stays stable as the user filters down.
  const [counts, setCounts] = useState<AssetSectionCounts | null>(null)
  const refreshCounts = useCallback(async () => {
    // Scope counts to the active type facet so the badges match the grid.
    // Changing the facet re-runs this via the effect below.
    const response = await fetchAssetSectionCounts(scopedTypes)
    if (response.success) setCounts(response.data)
  }, [scopedTypes])
  useEffect(() => {
    // ⚠ setState 必须待在 async 闭包里（await 之后），否则就是「effect 里同步
    // setState」；顺带加了取消位 —— 快速切分面时旧响应不该盖掉新计数。
    let cancelled = false
    void (async () => {
      const response = await fetchAssetSectionCounts(scopedTypes)
      if (!cancelled && response.success) setCounts(response.data)
    })()
    return () => {
      cancelled = true
    }
  }, [scopedTypes])

  // Detail sheet — only used outside picker mode. In picker mode the
  // tile click resolves the asset picker via onSelect, so a detail
  // sheet would steal the click target.
  const [selectedGeneration, setSelectedGeneration] =
    useState<GenerationRecord | null>(initialSelectedGeneration)
  const [selectedOriginRect, setSelectedOriginRect] = useState<{
    x: number
    y: number
    width: number
    height: number
  } | null>(null)
  const [imageNavigationDirection, setImageNavigationDirection] = useState<
    -1 | 1
  >(1)
  const imageGenerations = useMemo(
    () => generations.filter((generation) => generation.outputType === 'IMAGE'),
    [generations],
  )
  const selectedImageIndex = selectedGeneration
    ? imageGenerations.findIndex(
        (generation) => generation.id === selectedGeneration.id,
      )
    : -1
  const showImageNavigation =
    selectedGeneration?.outputType === 'IMAGE' && imageGenerations.length > 1
  const selectSiblingImage = useCallback(
    (offset: -1 | 1) => {
      if (selectedImageIndex < 0) return
      const nextGeneration = imageGenerations[selectedImageIndex + offset]
      if (!nextGeneration) return
      setImageNavigationDirection(offset)
      setSelectedOriginRect(null)
      setSelectedGeneration(nextGeneration)
    },
    [imageGenerations, selectedImageIndex],
  )
  const [failedAudioPreviewUrls, setFailedAudioPreviewUrls] = useState<
    ReadonlySet<string>
  >(() => new Set())
  const handleAudioPreviewError = useCallback((url: string) => {
    setFailedAudioPreviewUrls((current) => {
      if (current.has(url)) return current
      const next = new Set(current)
      next.add(url)
      return next
    })
  }, [])
  // deeplink（`?generationId=`）换了才重置详情面板。⚠ 用**渲染期调整**而不是
  // effect：effect 里同步 setState 会多跑一轮渲染，React 文档对「prop 变了要
  // 重置 state」给的正是这个写法。
  const [lastDeeplinkGeneration, setLastDeeplinkGeneration] = useState(
    initialSelectedGeneration,
  )
  if (lastDeeplinkGeneration !== initialSelectedGeneration) {
    setLastDeeplinkGeneration(initialSelectedGeneration)
    setSelectedGeneration(initialSelectedGeneration)
    setSelectedOriginRect(null)
  }
  // 桌面 / 平板点开是就地查看器，手机沿用全屏详情（owner 2026-09-29）。
  const isPhone = useIsPhone()
  // 换了夹或筛选 = 查看器关上再换范围（pages/assets.md §3「详情」）。
  const [viewerFilters, setViewerFilters] = useState(filters)
  if (viewerFilters !== filters) {
    setViewerFilters(filters)
    setSelectedGeneration(null)
    setSelectedOriginRect(null)
  }

  // ── Multi-select state ────────────────────────────────────────
  // Single-select picker mode (onSelect callback only) intentionally does
  // NOT support bulk selection — its click target must always resolve
  // onSelect. Multi-select picker mode (`pickerMultiSelect`) reuses this
  // state but keeps bulk-op action bars hidden; see the effect below.
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  /** Shift 范围选的锚点（上一次单击的那张）。 */
  const selectionAnchorRef = useRef<string | null>(null)
  /**
   * 当前列表的镜像 —— Shift 范围选要按**屏上顺序**取区间，撤销要取每一项
   * **移动前的原夹**。两处都在事件回调里跑，不能读渲染期的闭包快照。
   */
  const generationsRef = useRef(generations)
  useEffect(() => {
    generationsRef.current = generations
  }, [generations])
  /** popstate 在 effect 里读当前筛选 —— 不能读渲染期闭包。 */
  const filtersRef = useRef(filters)
  useEffect(() => {
    filtersRef.current = filters
  }, [filters])

  const fileInputRef = useRef<HTMLInputElement>(null)
  // Off-screen element used as a custom drag image when dragging a multi-select
  // batch onto a folder — shows the count instead of a lone thumbnail ghost.
  const dragGhostRef = useRef<HTMLDivElement>(null)
  const [isBulkPublishing, setIsBulkPublishing] = useState(false)
  const [isBulkFavoriting, setIsBulkFavoriting] = useState(false)
  /** 大河里正拖着几张（拖到左栏一行上时写「+ 加入 N 张」）。 */
  const [draggingCount, setDraggingCount] = useState(0)
  /** 刚离开当前范围、正在缩小淡出的那几张（200 后才从列表里拿掉）。 */
  const [leavingIds, setLeavingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  )

  // ── Confirm action state ──────────────────────────────────────
  // One AlertDialog handles every destructive flow (bulk delete, publish,
  // favorite, folder delete) — keeps the Krea-style modal consistent and
  // replaces the native window.confirm() pop-up which looked out of place.
  type ConfirmAction =
    | { kind: 'delete-bulk'; count: number }
    /** `kept` = 选中里用过「先搜再画」、只能留在私密的那几张。 */
    | { kind: 'publish-bulk'; count: number; kept: number }
    | { kind: 'favorite-bulk'; count: number }
    | { kind: 'delete-folder'; folder: ProjectRecord }
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)

  const toggleSelection = useCallback((id: string) => {
    // 每次单击都把锚点挪到这里 —— 下一次 Shift 点就从这张开始选。
    selectionAnchorRef.current = id
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
    selectionAnchorRef.current = null
  }, [])

  /**
   * Shift 范围选（§7.1）—— 全仓此前**零 `shiftKey`**，只能一张张点。
   * 点第一张设锚点，Shift 点最后一张把整段**一律置为选中**（不反选，符合
   * 文件管理器直觉）。
   */
  const selectRangeTo = useCallback((id: string) => {
    const order = generationsRef.current.map((generation) => generation.id)
    const anchor = selectionAnchorRef.current
    const to = order.indexOf(id)
    const from = anchor ? order.indexOf(anchor) : -1
    if (to < 0 || from < 0) {
      setSelectedIds((prev) => new Set(prev).add(id))
      selectionAnchorRef.current = id
      return
    }
    const [start, end] = from <= to ? [from, to] : [to, from]
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (let index = start; index <= end; index += 1) {
        next.add(order[index])
      }
      return next
    })
  }, [])

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false)
    clearSelection()
  }, [clearSelection])

  const enterSelectionWith = useCallback((id: string) => {
    setSelectionMode(true)
    setSelectedIds(new Set([id]))
  }, [])
  /** 删掉的那一张原来排第几（撤销时放回原处，owner 2026-10-08「提示与弹窗」）。 */
  const deletedIndexRef = useRef(new Map<string, number>())
  const handleAssetDeleted = useCallback(
    (id: string) => {
      const index = generations.findIndex((g) => g.id === id)
      if (index >= 0) deletedIndexRef.current.set(id, index)
      clearGalleryCache()
      removeGeneration(id)
      void refreshCounts()
    },
    [generations, removeGeneration, refreshCounts],
  )
  const handleAssetRestored = useCallback(
    (generation: GenerationRecord) => {
      const index = deletedIndexRef.current.get(generation.id) ?? 0
      deletedIndexRef.current.delete(generation.id)
      clearGalleryCache()
      insertGeneration(generation, index)
      void refreshCounts()
    },
    [insertGeneration, refreshCounts],
  )

  const selectAllVisible = useCallback(() => {
    setSelectedIds(new Set(generations.map((g) => g.id)))
  }, [generations])

  const requestBulkDelete = () => {
    const count = selectedIds.size
    if (count === 0) return
    setConfirmAction({ kind: 'delete-bulk', count })
  }

  /**
   * 批量删除与单张同一套（owner 2026-10-08「提示与弹窗」）：选中的那几张立刻从
   * 大河里拿掉，底部黑条「已删除 N 张 · 撤销」5 秒，过了才真的落库；点撤销 /
   * 落库失败都按原来的位置放回去。⛔ 不需要恢复接口。
   */
  const performBulkDelete = useCallback(() => {
    const removed = generations
      .map((generation, index) => ({ generation, index }))
      .filter(({ generation }) => selectedIds.has(generation.id))
    if (removed.length === 0) return
    const ids = removed.map(({ generation }) => generation.id)
    const restore = () => {
      clearGalleryCache()
      // 从前往后插，每一张回到它原来的序号。
      for (const { generation, index } of removed) {
        insertGeneration(generation, index)
      }
      void refreshCounts()
    }
    exitSelectionMode()
    runUndoableAction({
      message: t('bulkDeleteSuccess', { count: ids.length }),
      undoLabel: tFeedback('undo'),
      apply: () => {
        clearGalleryCache()
        ids.forEach((id) => removeGeneration(id))
        void refreshCounts()
      },
      undo: restore,
      commit: async () => {
        try {
          const result = await batchDeleteGenerationsAPI(ids)
          if (result.success) {
            clearGalleryCache()
            void refreshCounts()
            return
          }
          toast.error(result.error ?? t('bulkDeleteFailed'))
        } catch {
          toast.error(t('bulkDeleteFailed'))
        }
        restore()
      },
    })
  }, [
    generations,
    selectedIds,
    t,
    tFeedback,
    insertGeneration,
    removeGeneration,
    refreshCounts,
    exitSelectionMode,
  ])

  /**
   * 选中里用过「先搜再画」的那几张（按 Gemini API 条款不能公开）：混选只发能发的，
   * 全是这类图时「发布到画廊」置灰、工具条上方说一句原因。
   */
  const searchGroundedSelectedIds = useMemo(
    () =>
      new Set(
        generations
          .filter(
            (generation) =>
              selectedIds.has(generation.id) &&
              generation.searchGrounded &&
              !generation.isPublic,
          )
          .map((generation) => generation.id),
      ),
    [generations, selectedIds],
  )
  const bulkPublishAllBlocked =
    selectedIds.size > 0 && searchGroundedSelectedIds.size === selectedIds.size

  const requestBulkPublish = () => {
    const kept = searchGroundedSelectedIds.size
    const count = selectedIds.size - kept
    if (count <= 0) return
    setConfirmAction({ kind: 'publish-bulk', count, kept })
  }

  const performBulkPublish = useCallback(async () => {
    const kept = searchGroundedSelectedIds.size
    const ids = Array.from(selectedIds).filter(
      (id) => !searchGroundedSelectedIds.has(id),
    )
    if (ids.length === 0) return
    setIsBulkPublishing(true)
    try {
      const result = await batchUpdateVisibilityAPI(ids, 'isPublic', true)
      if (!result.success) {
        toast.error(result.error ?? t('bulkPublishFailed'))
        return
      }
      const updatedCount = result.data?.updatedCount ?? ids.length
      const blockedIds = new Set(result.data?.blockedIds ?? [])
      clearGalleryCache()
      ids
        .filter((id) => !blockedIds.has(id))
        .forEach((id) => updateGeneration(id, { isPublic: true }))
      void refreshCounts()
      if (blockedIds.size > 0) {
        toast.error(t('bulkPublishBlocked', { count: blockedIds.size }))
      }
      if (updatedCount > 0) {
        // 发完给一条回链：发布的结果长在画廊里，而用户此刻站在素材库。
        const message =
          kept > 0
            ? tSearch('bulkPublishedKept', { published: updatedCount, kept })
            : t('bulkPublishSuccess', { count: updatedCount })
        toast.success(message, {
          action: {
            label: t('bulkPublishView'),
            onClick: () => router.push(ROUTES.GALLERY),
          },
        })
      }
      exitSelectionMode()
    } finally {
      setIsBulkPublishing(false)
    }
  }, [
    selectedIds,
    searchGroundedSelectedIds,
    t,
    tSearch,
    updateGeneration,
    refreshCounts,
    exitSelectionMode,
    router,
  ])

  const requestBulkFavorite = () => {
    const count = selectedIds.size
    if (count === 0) return
    setConfirmAction({ kind: 'favorite-bulk', count })
  }

  const performBulkFavorite = useCallback(async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setIsBulkFavoriting(true)
    try {
      // Always set liked=true for the bulk path — Krea-style. Removing
      // favorites at scale is rare enough that single-tile unlike from
      // the detail sheet covers it.
      const result = await batchSetLikeAPI(ids, true)
      if (!result.success) {
        toast.error(result.error ?? t('bulkFavoriteFailed'))
        return
      }
      const updatedCount = result.data?.updatedCount ?? ids.length
      // Mirror the new liked state in the grid so heart indicators light
      // up immediately, without waiting for a refetch.
      clearGalleryCache()
      ids.forEach((id) => updateGeneration(id, { isLiked: true }))
      void refreshCounts()
      toast.success(t('bulkFavoriteSuccess', { count: updatedCount }))
      exitSelectionMode()
    } finally {
      setIsBulkFavoriting(false)
    }
  }, [selectedIds, t, updateGeneration, refreshCounts, exitSelectionMode])

  /** 那几张缩小淡出 200，再从大河里拿掉（动效表「从这个夹拿出」）。 */
  const removeLeaving = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return
      setLeavingIds((prev) => new Set([...prev, ...ids]))
      window.setTimeout(
        () => {
          ids.forEach((id) => removeGeneration(id))
          setLeavingIds((prev) => {
            const next = new Set(prev)
            ids.forEach((id) => next.delete(id))
            return next
          })
        },
        reducedMotion ? 0 : DURATION_MS.base,
      )
    },
    [removeGeneration, reducedMotion],
  )

  /**
   * 加入 / 拿出落库之后：计数与封面跟着变；已经不在当前范围里的那几张退出大河。
   * `memberships` = 这几张现在各在哪些夹里（面板刚读过、刚改过的那一份）。
   */
  const handleMembershipsChanged = useCallback(
    (memberships: Record<string, string[]>) => {
      clearGalleryCache()
      void refreshCounts()
      void refreshFolders()
      if (folderScope.kind === 'all') return
      // 看一个夹 = 它连同所有层的子孙夹（与服务端 `folderScopeWhere` 同一口径）。
      const scopeIds =
        folderScope.kind === 'folder'
          ? getFolderSubtreeIds(folders, folderScope.id)
          : null
      const leaving = Object.entries(memberships)
        .filter(([, folderIds]) =>
          scopeIds
            ? !folderIds.some((folderId) => scopeIds.has(folderId))
            : folderIds.length > 0,
        )
        .map(([id]) => id)
      removeLeaving(leaving)
    },
    [folderScope, folders, refreshCounts, refreshFolders, removeLeaving],
  )

  /** 撤销落库之后：谁回来了算不清，大河整页重拉。 */
  const handleFolderUndone = useCallback(() => {
    clearGalleryCache()
    void refreshCounts()
    void refreshFolders()
    retryGallery()
  }, [refreshCounts, refreshFolders, retryGallery])

  /** 把图拖到左栏一行上 = 也放进那个夹（⛔ 不是挪：图不离开原位）。 */
  const handleDropAssetsOnFolder = useCallback(
    async (folderId: string, ids: string[]) => {
      if (ids.length === 0) return
      const folderName =
        folders.find((folder) => folder.id === folderId)?.name ?? ''
      const response = await updateFolderItemsAPI(folderId, { add: ids })
      if (!response.success || !response.data) {
        toast.error(response.error ?? t('addToFolderFailed'))
        return
      }
      const added = response.data.added
      clearGalleryCache()
      void refreshCounts()
      void refreshFolders()
      // 未归档里拖出去的那几张已经归档了 —— 离开这一页。
      if (folderScope.kind === 'unassigned') removeLeaving(added)
      if (added.length === 0) return
      toast.success(t('addToFolderDone', { name: folderName }), {
        duration: ASSET_FOLDER_UNDO_DURATION_MS,
        action: {
          label: t('addToFolderUndo'),
          onClick: () => {
            void (async () => {
              const undone = await updateFolderItemsAPI(folderId, {
                remove: added,
              })
              if (!undone.success) toast.error(t('addToFolderFailed'))
              else toast.success(t('addToFolderUndone'))
              handleFolderUndone()
            })()
          },
        },
      })
    },
    [
      folders,
      folderScope,
      t,
      refreshCounts,
      refreshFolders,
      removeLeaving,
      handleFolderUndone,
    ],
  )

  const handleAssetUpdated = useCallback(
    (id: string, patch: Partial<GenerationRecord>) => {
      const current =
        generations.find((generation) => generation.id === id) ??
        (selectedGeneration?.id === id ? selectedGeneration : null)

      if (!current) {
        updateGeneration(id, patch)
        void refreshCounts()
        return
      }

      const nextGeneration = { ...current, ...patch }
      const changesSectionMembership =
        'isPublic' in patch ||
        'isLiked' in patch ||
        'provider' in patch ||
        'outputType' in patch

      if (changesSectionMembership) {
        clearGalleryCache()
        setCounts((previous) =>
          updateCountsAfterAssetPatch(previous, current, patch),
        )
      }

      if (!shouldKeepAssetAfterPatch(filters, nextGeneration)) {
        removeGeneration(id)
        setSelectedGeneration((prev) => (prev?.id === id ? null : prev))
        void refreshCounts()
        return
      }

      updateGeneration(id, patch)
      setSelectedGeneration((prev) =>
        prev && prev.id === id ? { ...prev, ...patch } : prev,
      )

      if (changesSectionMembership) {
        void refreshCounts()
      }
    },
    [
      generations,
      selectedGeneration,
      filters,
      updateGeneration,
      removeGeneration,
      refreshCounts,
    ],
  )

  /**
   * 瓦片上的 ♥（排布与详情 A）：点一下收藏 / 取消，不点开详情。请求在飞时那颗 ♥
   * 半透明、不接第二下；结果回来走与详情同一条 `handleAssetUpdated`（计数、
   * 「收藏」视图里取消后退出大河都在那里）。
   */
  const [favoritePendingIds, setFavoritePendingIds] = useState<
    ReadonlySet<string>
  >(() => new Set())
  const toggleTileFavorite = useCallback(
    async (id: string) => {
      setFavoritePendingIds((previous) => new Set(previous).add(id))
      try {
        const response = await toggleLikeAPI(id)
        if (response.success && response.data) {
          handleAssetUpdated(id, {
            isLiked: response.data.liked,
            likeCount: response.data.likeCount,
          })
        } else {
          toast.error(t('detailFavoriteFailed'))
        }
      } catch {
        toast.error(t('detailFavoriteFailed'))
      } finally {
        setFavoritePendingIds((previous) => {
          const next = new Set(previous)
          next.delete(id)
          return next
        })
      }
    },
    [handleAssetUpdated, t],
  )

  // Grid density = 目标行高（page §5.6），不再是固定列数。SSR 渲染默认档
  // 以免 hydration mismatch；存储的偏好在挂载后的 effect 里应用。
  const [storedDensity, setStoredDensity] = useLocalPreference(
    ASSET_GRID_DENSITY_STORAGE_KEY,
  )
  const density: AssetGridDensity = isDensity(storedDensity)
    ? storedDensity
    : ASSET_GRID_DEFAULT_DENSITY
  const changeDensity = setStoredDensity

  // ── 文件夹（文件夹 B：左边一列）───────────────────────────────
  // ⚠ 文件夹范围与收藏 / 发布 / 类型等筛选**叠加**（page §2「可叠加维度」）：
  //   换夹只改 `projectId`，其余筛选原样留着。地址栏跟着走，后退可用、刷新不丢。
  const [storedRail, setStoredRail] = useLocalPreference(
    ASSET_FOLDER_RAIL_STORAGE_KEY,
  )
  const railOpen = storedRail !== 'closed'
  const [isFolderDrawerOpen, setIsFolderDrawerOpen] = useState(false)
  /** 栏里正在改名的夹（Eagle 式新建：建好的「未命名文件夹」直接进这里）。 */
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [isRenamingScope, setIsRenamingScope] = useState(false)

  /** 把当前范围写进地址栏（用户点出来的都 push，后退才有东西可回）。 */
  const pushAssetsUrl = useCallback((projectId: string) => {
    const params = new URLSearchParams(window.location.search)
    if (projectId) params.set('projectId', projectId)
    else params.delete('projectId')
    params.delete('view')
    const query = params.toString()
    window.history.pushState(
      null,
      '',
      query ? `${window.location.pathname}?${query}` : window.location.pathname,
    )
  }, [])

  const openScope = useCallback(
    (scope: AssetFolderScope) => {
      const projectId = folderScopeParam(scope)
      setFilters({ ...filters, projectId })
      pushAssetsUrl(projectId)
      setIsFolderDrawerOpen(false)
    },
    [filters, setFilters, pushAssetsUrl],
  )

  /**
   * 栏的收起 / 展开（与图片台助手列让位同一套，owner 09-26 定）：点下去那一刻布局
   * 直接切到终态（大河只重排这一次），之后栏与大河**同一根弹簧**一起滑 —— 栏从左缘
   * 滑出 / 滑进，大河跟着让位，两者之间那 20 的空隙全程不变。⛔ 不逐帧改宽度：
   * justified 大河每帧重排会让图在行与行之间来回跳。
   */
  const railReserve = ASSET_FOLDER_RAIL_WIDTH + ASSET_FOLDER_RAIL_GAP
  const railProgress = useMotionValue(railOpen ? 1 : 0)
  const railLayoutLeft = useMotionValue(railOpen ? railReserve : 0)
  const railSettledRef = useRef(railOpen)
  useLayoutEffect(() => {
    if (railSettledRef.current === railOpen) return
    railSettledRef.current = railOpen
    railLayoutLeft.set(railOpen ? railReserve : 0)
    if (reducedMotion) {
      railProgress.jump(railOpen ? 1 : 0)
      return
    }
    const controls = animate(
      railProgress,
      railOpen ? 1 : 0,
      railOpen ? LIQUID_SPRING.unfold : LIQUID_SPRING.retract,
    )
    return () => controls.stop()
  }, [railOpen, railReserve, reducedMotion, railProgress, railLayoutLeft])
  // 大河那一列的宽度：窄于查看器要的最小宽度时，查看器连文件夹栏一起盖。
  const riverColumnRef = useRef<HTMLDivElement>(null)
  const [riverColumnWidth, setRiverColumnWidth] = useState(0)
  useEffect(() => {
    const node = riverColumnRef.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      setRiverColumnWidth(entries[0]?.contentRect.width ?? 0)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const viewerCoversRail =
    railOpen &&
    riverColumnWidth > 0 &&
    riverColumnWidth < ASSET_VIEWER_MIN_COLUMN_WIDTH
  const railX = useTransform(railProgress, (p) => (p - 1) * railReserve)
  const riverX = useTransform(
    [railProgress, railLayoutLeft],
    ([p, left]: number[]) => p * railReserve - left,
  )

  /** 顶栏那颗键：桌面上展开栏，窄屏拉出左边抽屉。 */
  const revealFolders = useCallback(() => {
    if (window.matchMedia('(min-width: 768px)').matches) setStoredRail('open')
    else setIsFolderDrawerOpen(true)
  }, [setStoredRail])

  // 后退/前进：从地址栏读回范围，⛔ 不再 push（否则历史会自乘）。
  useEffect(() => {
    const handlePopState = () => {
      const projectId =
        new URLSearchParams(window.location.search).get('projectId') ?? ''
      setFilters({ ...filtersRef.current, projectId })
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [setFilters])

  // ⛔ hover 预取随移动分组 chips 一起退役：门牌行/分面栏都是点了才切范围，
  // 没有「鼠标悬停在候选上」这个前置动作可用来预热缓存了。
  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  /**
   * 单个文件的上传动作 —— 队列注入它，队列只管调度与状态。
   * ⚠ 压缩规则与文案留在这里：它们跟页面绑定，不该被 hook 复制一份。
   */
  const uploadOneFile = useCallback(
    async (
      file: File,
      options: {
        projectId: string | null
        onProgress: (percent: number) => void
      },
    ): Promise<UploadResult> => {
      const isAcceptedType = (
        USER_UPLOAD_ACCEPTED_MIME_TYPES as readonly string[]
      ).includes(file.type)
      if (!isAcceptedType) {
        return { ok: false, error: t('uploadUnsupportedFile') }
      }

      try {
        const isAudio = (
          USER_AUDIO_UPLOAD_ACCEPTED_MIME_TYPES as readonly string[]
        ).includes(file.type)
        const isVideo = (
          USER_VIDEO_UPLOAD_ACCEPTED_MIME_TYPES as readonly string[]
        ).includes(file.type)

        if (isAudio) {
          const maxGb = String(
            CLIENT_AUDIO_UPLOAD_MAX_BYTES / 1024 / 1024 / 1024,
          )
          if (file.size > CLIENT_AUDIO_UPLOAD_MAX_BYTES) {
            return {
              ok: false,
              error: t('uploadAudioTooLarge', { maxGb }),
            }
          }

          const metadata = await readAudioFileMetadata(file)
          const response = await uploadAudioFileAPI(file, {
            duration: metadata?.duration,
            projectId: options.projectId ?? undefined,
            onProgress: options.onProgress,
          })
          if (!response.success || !response.data) {
            return {
              ok: false,
              error: getApiErrorMessage(tErrors, response, t('uploadFailed')),
            }
          }
          return { ok: true, generation: response.data.generation }
        }

        if (isVideo) {
          const maxGb = String(
            CLIENT_VIDEO_UPLOAD_MAX_BYTES / 1024 / 1024 / 1024,
          )
          if (file.size > CLIENT_VIDEO_UPLOAD_MAX_BYTES) {
            return {
              ok: false,
              error: t('uploadVideoTooLarge', { maxGb }),
            }
          }

          const [metadata, poster] = await Promise.all([
            readVideoFileMetadata(file),
            captureVideoThumbnail(file),
          ])
          const response = await uploadVideoFileAPI(file, {
            width: metadata?.width ?? 0,
            height: metadata?.height ?? 0,
            duration: metadata?.duration,
            poster,
            projectId: options.projectId ?? undefined,
            onProgress: options.onProgress,
          })
          if (!response.success || !response.data) {
            return {
              ok: false,
              error: getApiErrorMessage(tErrors, response, t('uploadFailed')),
            }
          }
          return { ok: true, generation: response.data.generation }
        }

        // Over-cap files get squeezed client-side instead of bouncing, so
        // pasting a Retina screenshot or dragging in a phone photo just
        // works. Server enforces its own cap as a safety net.
        const maxMb = String(CLIENT_UPLOAD_MAX_BYTES / 1024 / 1024)
        const uploadFile = await prepareImageUpload(file, {
          maxBytes: CLIENT_UPLOAD_MAX_BYTES,
          // 上传键自己写「上传中 3/12」，压缩那一下 ⛔ 再弹一条转圈黑条。
          inlineProgress: true,
          messages: {
            compressing: t('uploadCompressing'),
            compressed: ({ from, to }) => t('uploadCompressed', { from, to }),
            gifTooLarge: t('uploadGifTooLarge', { maxMb }),
            tooLarge: t('uploadFileTooLarge', { maxMb }),
          },
        })
        if (!uploadFile) return { ok: false, error: t('uploadFailed') }

        const response = await uploadImageFileAPI(uploadFile, {
          projectId: options.projectId ?? undefined,
          onProgress: options.onProgress,
        })
        if (!response.success || !response.data) {
          return {
            ok: false,
            error: getApiErrorMessage(tErrors, response, t('uploadFailed')),
          }
        }
        return { ok: true, generation: response.data.generation }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : t('uploadFailed'),
        }
      }
    },
    [t, tErrors],
  )

  const handleUploaded = useCallback(
    (generation: GenerationRecord) => {
      clearGalleryCache()
      // 只有属于当前视图的才插网格（§7.3.5）；不属于的由队列项给「查看」跳过去。
      // ⚠ 文件夹不用判：上传的落夹目标就是当前范围。
      if (shouldKeepAssetAfterPatch(filters, generation)) {
        prependGeneration(generation)
      }
      void refreshCounts()
      void refreshFolders()
    },
    [filters, prependGeneration, refreshCounts, refreshFolders],
  )

  /**
   * 上传的结果写在上传键上（owner 2026-10-08「提示与弹窗」第 1 题）：传着时
   * 「上传中 2/3」，这一轮传完「✓ 已上传 3 张」1.6 秒后缩回；失败的留在队列面板里重试。
   */
  const uploadDoneFeedback = useButtonFeedback()
  const showUploadDone = uploadDoneFeedback.show
  const handleUploadBatchSettled = useCallback(
    ({ done }: { done: number }) => {
      if (done > 0)
        showUploadDone({ label: t('uploadedCount', { count: done }) })
    },
    [showUploadDone, t],
  )

  const uploadQueue = useAssetUploadQueue({
    upload: uploadOneFile,
    onUploaded: handleUploaded,
    onBatchSettled: handleUploadBatchSettled,
  })
  const isUploading = uploadQueue.isUploading

  /** 上传落夹目标 = 当前范围（§7.3.4）。 */
  const uploadTargetProjectId =
    folderScope.kind === 'folder' ? folderScope.id : null

  const processUploadFiles = useCallback(
    (files: File[]) => {
      const acceptedFiles = files.filter((file) =>
        (USER_UPLOAD_ACCEPTED_MIME_TYPES as readonly string[]).includes(
          file.type,
        ),
      )
      if (acceptedFiles.length === 0) return
      uploadQueue.enqueue(acceptedFiles, uploadTargetProjectId)
    },
    [uploadQueue, uploadTargetProjectId],
  )

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) return
    processUploadFiles(files)
  }

  // ── Global drag-to-upload ─────────────────────────────────────
  // Dropping OS files anywhere on the page uploads them into the current
  // folder. Keyed off the "Files" payload so it never collides with the
  // in-page tile → folder drag (which carries ASSET_DND_MIME instead).
  const {
    isDragging: isFileDragging,
    resetDragging: resetFileDragging,
    handleDragEnter: markFileDragEnter,
    handleDragOver: markFileDragOver,
    handleDragLeave: markFileDragLeave,
  } = useStableDragState()

  const uploadDropEnabled = true
  /** picker 已迁去 `AssetPickerBrowser`（page §8 任务型 shell），这里恒为假。 */
  const isPickerMode = false
  const hasFilePayload = (dataTransfer: DataTransfer) =>
    Array.from(dataTransfer.types).includes('Files')
  const uploadTargetLabel = scopeFolder?.name ?? t('sidebarUnassigned')

  const handleRootDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    if (!uploadDropEnabled || !hasFilePayload(event.dataTransfer)) return
    markFileDragEnter(event)
  }
  const handleRootDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!uploadDropEnabled || !hasFilePayload(event.dataTransfer)) return
    markFileDragOver(event)
  }
  const handleRootDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (!uploadDropEnabled) return
    markFileDragLeave(event)
  }
  const handleRootDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!uploadDropEnabled || !hasFilePayload(event.dataTransfer)) return
    event.preventDefault()
    resetFileDragging()
    const files = Array.from(event.dataTransfer.files)
    if (files.length > 0) processUploadFiles(files)
  }

  // Paste-to-upload: ⌘V / Ctrl+V uploads a clipboard image into the current
  // folder (and, in an image picker, selects it). Skipped when the user is
  // typing in a field so the rename inputs still work.
  useEffect(() => {
    if (!uploadDropEnabled) return

    const handlePaste = (event: globalThis.ClipboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
          return
        }
      }
      const clipboard = event.clipboardData
      if (!clipboard) return
      const imageFile = Array.from(clipboard.files).find((file) =>
        file.type.startsWith('image/'),
      )
      if (!imageFile) return
      event.preventDefault()
      processUploadFiles([imageFile])
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [uploadDropEnabled, processUploadFiles])

  const createFolder = useCallback(
    async (name: string, parentId: string | null) => {
      const folder = await folderStore.create(name, parentId)
      if (folder) void refreshCounts()
      return folder
    },
    [folderStore, refreshCounts],
  )

  const performDeleteFolder = useCallback(
    async (folder: ProjectRecord) => {
      // 正在看的就是它（或它任何一层的子孙夹）→ 大河回到「全部素材」。
      const viewingIt =
        folderScope.kind === 'folder' &&
        getFolderSubtreeIds(folders, folder.id).has(folderScope.id)
      if (viewingIt) openScope({ kind: 'all' })
      const ok = await folderStore.remove(folder.id)
      if (ok) void refreshCounts()
    },
    [folderScope, folders, openScope, folderStore, refreshCounts],
  )

  const folderMenuActions = (folder: ProjectRecord) => ({
    onRename: () => setRenamingFolderId(folder.id),
    onTogglePin: () =>
      void folderStore.setPinned(folder.id, folder.pinnedOrder === null),
    // 段头 ⋯「新建子文件夹」：同栏里一样当场建「未命名文件夹」，栏打开、那一行改名。
    onCreateChild: () => {
      setStoredRail('open')
      void createFolder(t('folderUntitled'), folder.id).then((created) => {
        if (created) setRenamingFolderId(created.id)
      })
    },
    onMove: (parentId: string | null) =>
      void folderStore.moveTo(folder.id, parentId),
    onDelete: () => setConfirmAction({ kind: 'delete-folder', folder }),
  })

  /** 删夹确认那一句：图不删；有子夹就说它们往上挪一层（画板 `AfB_Delete`）。 */
  const folderDeleteDescription = (folder: ProjectRecord) =>
    t('folderDeleteBody', {
      count: counts?.byProject[folder.id] ?? 0,
      children: getChildFolders(folders, folder.id).length,
    })

  const isEmpty = !isLoading && generations.length === 0
  /**
   * 空库 = 没有任何筛选、也不在某个夹里，却还是零素材。
   * §7 明写这种情况下**文件夹段一并隐藏** —— 一个新用户不该先看见一排空门牌。
   */
  const isBulkActionPending = isBulkPublishing || isBulkFavoriting

  // ── justified 真实比例网格（page §5）────────────────────────────
  // 密度控制的是目标行高，行高刻度按视口断点各有一套。picker 的小网格自成
  // 一档（§8.2 桌面 132 / 移动 104），不吃密度控制。
  const gridViewport = useAssetGridViewport()
  const targetRowHeight = ASSET_GRID_TARGET_ROW_HEIGHT[gridViewport][density]

  // picker 的内联上传格是网格的第一格，所以它得跟着一起排 —— 否则它
  // 会被挤出行外，第一行就铺不满。
  const showUploadCell = false
  const gridItems = useMemo<GridItem[]>(() => {
    const items: GridItem[] = showUploadCell ? [{ kind: 'upload' }] : []
    uploadQueue.pendingItems.forEach((item) => {
      items.push({ kind: 'pending', item })
    })
    generations.forEach((generation) => {
      items.push({ kind: 'asset', generation })
    })
    return items
  }, [showUploadCell, uploadQueue.pendingItems, generations])

  const showSkeleton = generations.length === 0 && isLoading
  // 等太久（6 秒）底部黑条「网有点慢，还在加载」，数据到了自己收掉。
  useSlowLoadingNotice(isLoading)
  const gridAspectRatios = useMemo(
    () =>
      showSkeleton
        ? ASSET_GRID_SKELETON_ASPECT_RATIOS
        : gridItems.map((item) => {
            if (item.kind === 'upload') {
              return ASSET_PICKER_UPLOAD_CELL_ASPECT_RATIO
            }
            // 占位瓦片按**文件本地读到的真实比例**参与排版（§7.3.6），
            // 拿到真图后这一行自然会重排。
            if (item.kind === 'pending') return item.item.aspectRatio
            // 音频恒 1:1 封面卡（page §6）—— 显式锁死，不靠「音频行的
            // width/height 恰好是 0，兜底成 1:1」这种巧合。
            if (item.generation.outputType === 'AUDIO') {
              return ASSET_GRID_AUDIO_ASPECT_RATIO
            }
            return toLayoutAspectRatio(
              item.generation.width,
              item.generation.height,
            )
          }),
    [showSkeleton, gridItems],
  )
  const { containerRef: gridContainerRef, rows: gridRows } = useJustifiedGrid({
    aspectRatios: gridAspectRatios,
    targetRowHeight,
  })
  // 数据到了每张图由糊变清，一批之内从左上往右下错开（「这一行第几格 + 离这一批第一行
  // 几行」）。justified 排版每行格数不一样，所以按「这一格在第几行」来数。
  const batchStartOf = useRevealBatchStart(gridItems.length)
  const gridRowOfItem = useMemo(() => {
    const rowOf: number[] = []
    gridRows.forEach((row, rowIndex) => {
      row.boxes.forEach((box) => {
        rowOf[box.index] = rowIndex
      })
    })
    return rowOf
  }, [gridRows])

  // ─── justified 行的窗口化（2026-09-03）──────────────────────────
  // 素材库是「滚到底就再追加 24 条」的无限流，退役前所有瓦片都留在 DOM 里，
  // 翻几屏就是几百个 `<img>`。这里比画廊简单得多：justified 排版**已经**把每行
  // 的精确高度算出来了（`row.height`），不用挂进 DOM 再量，估高即真值。
  // ⚠ 滚动容器是下面那个 `<main>`（`overflow-y-auto`），不是窗口。
  const scrollElementRef = useRef<HTMLElement | null>(null)
  const gridElementRef = useRef<HTMLDivElement | null>(null)
  const [gridOffsetTop, setGridOffsetTop] = useState(0)

  // 网格上方还有顶栏/面包屑/门牌行，高度会变（筛选条换行、门牌行出现），
  // 所以偏移量得跟着量，否则整片行会整体错位。
  const setGridElement = useCallback(
    (node: HTMLDivElement | null) => {
      gridElementRef.current = node
      gridContainerRef(node)
    },
    [gridContainerRef],
  )

  useLayoutEffect(() => {
    const grid = gridElementRef.current
    const scroller = scrollElementRef.current
    if (!grid || !scroller) return

    const measure = () => {
      const next =
        grid.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop
      setGridOffsetTop((previous) => (previous === next ? previous : next))
    }
    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(scroller)
    observer.observe(grid)
    return () => observer.disconnect()
  }, [gridRows, isEmpty])

  const rowVirtualizer = useVirtualizer({
    count: gridRows.length,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: (index) => gridRows[index]?.height ?? 0,
    gap: ASSET_GRID_GAP,
    overscan: ASSET_GRID_ROW_OVERSCAN,
    scrollMargin: gridOffsetTop,
  })

  // Per-section counts — fall back to live `total` only for the bucket the
  // user is currently viewing so the sidebar still moves on add/delete
  // before the next refreshCounts() lands.
  /**
   * 顶栏那个数 = **整库大小**，不随筛选变；`byType` 是唯一不吃类型口径的
   * 聚合，所以从它加起来。段头那个数则是**当前口径的命中数**（live `total`）
   * —— 两个数各自诚实。⚠ 别把 `counts.all` 放到段头：它只跟类型口径走，
   * 时间/模型分面一生效就会出现「全部素材 129」压着一张瓦片的画面。
   */
  const libraryTotal = counts
    ? counts.image + counts.video + counts.audio + (counts.model_3d ?? 0)
    : total
  const favoritesCount =
    counts?.favorites ?? (filters.liked ? total : undefined)
  const publishedCount =
    counts?.published ?? (filters.published ? total : undefined)
  const imageCount =
    counts?.image ?? (activeMediaType === 'image' ? total : undefined)
  const videoCount =
    counts?.video ?? (activeMediaType === 'video' ? total : undefined)
  const audioCount =
    counts?.audio ?? (activeMediaType === 'audio' ? total : undefined)
  const model3DCount =
    counts?.model_3d ?? (activeMediaType === 'model_3d' ? total : undefined)
  /** 左栏的数字跟着类型口径走（与大河同一口径），连子夹、同一张只算一次。 */
  const folderCounts = useMemo(
    () => ({
      all: counts?.all,
      unassigned: counts?.unassigned,
      byProject: counts?.byProject ?? {},
    }),
    [counts],
  )

  const scopeTitle =
    folderScope.kind === 'folder'
      ? (scopeFolder?.name ?? '')
      : folderScope.kind === 'unassigned'
        ? t('sidebarUnassigned')
        : t('sectionAllAssets')

  /** 「搜索无结果」要回显当前全部生效筛选（§7）。 */
  const activeFilterLabels = useMemo(() => {
    const labels: string[] = []
    if (filters.search) labels.push(`“${filters.search}”`)
    filters.types.forEach((type) =>
      labels.push(
        {
          image: t('sidebarImages'),
          video: t('sidebarVideos'),
          audio: t('sidebarAudio'),
          model_3d: t('sidebarModel3D'),
        }[type],
      ),
    )
    if (filters.liked) labels.push(t('sidebarFavorites'))
    if (filters.published) labels.push(t('sidebarPublished'))
    if (filters.provider === USER_UPLOAD_PROVIDER) {
      labels.push(t('sidebarUploads'))
    }
    filters.models.forEach((model) => labels.push(model))
    if (filters.timeRange !== 'all') labels.push(filters.timeRange)
    return labels
  }, [filters, t])
  const hasActiveFilters = activeFilterLabels.length > 0

  const clearAllFilters = useCallback(() => {
    setFilters({
      ...filters,
      search: '',
      types: [],
      models: [],
      timeRange: 'all',
      liked: false,
      published: false,
      provider: '',
    })
  }, [filters, setFilters])

  /** `Esc` = 返回上一级（子夹 → 父夹 → 全部素材）。 */
  useEffect(() => {
    if (folderScope.kind === 'all') return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }
      if (scopeParent) openScope({ kind: 'folder', id: scopeParent.id })
      else openScope({ kind: 'all' })
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [folderScope, scopeParent, openScope])

  // 拖着的图松手（落在哪都算）→ 左栏的「+ 加入 N 张」收掉。
  useEffect(() => {
    if (draggingCount === 0) return
    const reset = () => setDraggingCount(0)
    window.addEventListener('dragend', reset)
    window.addEventListener('drop', reset)
    return () => {
      window.removeEventListener('dragend', reset)
      window.removeEventListener('drop', reset)
    }
  }, [draggingCount])

  const uploadButtonFeedback: ButtonFeedback | null = uploadQueue.batchProgress
    ? {
        label: t('uploadingProgress', uploadQueue.batchProgress),
        tone: 'progress',
      }
    : uploadDoneFeedback.feedback

  /** ≥768 顶栏选择条里的内容（窄屏是底部浮条，见文件尾）。 */
  const selectionBarContent = (
    <>
      <span className="flex items-center gap-1.5 pr-1 text-xs">
        {t('selectedPrefix')}
        <RollingNumber
          value={selectedIds.size}
          className="font-mono text-xs font-medium"
        />
      </span>
      <span
        className={cn(
          'ml-2 text-xs text-muted-foreground transition-[opacity,filter] duration-fast ease-standard motion-reduce:transition-none',
          selectedIds.size > 0 && 'opacity-0 blur-xs',
        )}
      >
        {t('selectHint')}
      </span>
      <span className="flex-1" />
      <SelectionLink onClick={selectAllVisible}>{t('selectAll')}</SelectionLink>
      <AssetAddToFolderPanel
        assetIds={Array.from(selectedIds)}
        folders={folders}
        counts={folderCounts.byProject}
        onCreateFolder={(name) => createFolder(name, null)}
        onChanged={handleMembershipsChanged}
        onUndone={handleFolderUndone}
        trigger={
          <SelectionLink
            disabled={isBulkActionPending || selectedIds.size === 0}
          >
            {t('addToFolder')}
          </SelectionLink>
        }
      />
      <SelectionLink
        onClick={requestBulkFavorite}
        disabled={isBulkActionPending || selectedIds.size === 0}
      >
        {isBulkFavoriting ? <Spinner size="sm" /> : null}
        {t('bulkFavorite')}
      </SelectionLink>
      <SelectionLink
        onClick={requestBulkPublish}
        disabled={
          isBulkActionPending || selectedIds.size === 0 || bulkPublishAllBlocked
        }
        title={
          bulkPublishAllBlocked ? tSearch('bulkAllBlockedShort') : undefined
        }
      >
        {isBulkPublishing ? <Spinner size="sm" /> : null}
        {t('bulkPublish')}
      </SelectionLink>
      <SelectionArmButton
        label={t('bulkDelete')}
        armedLabel={t('bulkDeleteArm', { count: selectedIds.size })}
        disabled={isBulkActionPending || selectedIds.size === 0}
        resetKey={`${selectionMode}:${selectedIds.size}`}
        onConfirm={performBulkDelete}
      />
      <button
        type="button"
        onClick={exitSelectionMode}
        className="ml-1 inline-flex h-7 items-center rounded-full bg-foreground px-3.5 text-xs font-medium text-background transition-opacity duration-fast hover:opacity-90"
      >
        {t('selectDone')}
      </button>
    </>
  )

  const sidebarProps = {
    folders,
    isLoading: folderStore.isLoading,
    counts: folderCounts,
    scope: folderScope,
    onScopeChange: openScope,
    renamingId: renamingFolderId,
    onRenamingChange: setRenamingFolderId,
    onCreate: createFolder,
    onRename: (id: string, name: string) => void folderStore.rename(id, name),
    onTogglePin: (folder: ProjectRecord) =>
      void folderStore.setPinned(folder.id, folder.pinnedOrder === null),
    onMove: (id: string, parentId: string | null) =>
      void folderStore.moveTo(id, parentId),
    onRequestDelete: (folder: ProjectRecord) =>
      setConfirmAction({ kind: 'delete-folder', folder }),
    onReorder: (input: Parameters<typeof folderStore.reorder>[0]) =>
      void folderStore.reorder(input),
    onPlace: (plan: Parameters<typeof folderStore.place>[0]) =>
      void folderStore.place(plan),
    draggingCount,
    onDropAssets: (folderId: string, ids: string[]) =>
      void handleDropAssetsOnFolder(folderId, ids),
  }

  return (
    <div
      className={cn('flex h-page flex-col bg-surface-workbench', className)}
      onDragEnter={handleRootDragEnter}
      onDragOver={handleRootDragOver}
      onDragLeave={handleRootDragLeave}
      onDrop={handleRootDrop}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-2 pt-4 sm:px-6">
        {/* ─── 顶栏（默认单行）────────────────────────────────────
            page §3：`素材 + 总数` · 分面筛选 · ——弹性—— · 上传 · 选择 · 密度。
            文件夹 B：跨在栏和大河上面；栏收起（或窄屏）时左端多一颗键，
            标题旁写着当前范围，点它把栏拿回来。 */}
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: -6, scale: 0.995 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={motionTransition('slow', reducedMotion)}
          ref={toolbarRef}
          data-stuck={isToolbarStuck || undefined}
          className={cn(
            'relative z-30 flex min-h-14 w-full shrink-0 flex-wrap items-center gap-2 rounded-2xl border bg-background px-4 py-2 transition-[border-color,box-shadow] duration-base ease-standard',
            isToolbarStuck
              ? 'border-border shadow-md'
              : 'border-border/70 shadow-sm',
          )}
        >
          <div className="flex min-w-0 items-center gap-1.5">
            {/* 栏收起（或窄屏）时才在：宽度与透明度跟着栏一起走，⛔ 不突然冒出来。 */}
            <button
              type="button"
              aria-label={t('folderRailExpand')}
              onClick={revealFolders}
              className={cn(
                'mr-1 grid size-9 max-w-9 shrink-0 place-items-center overflow-hidden rounded-xl text-muted-foreground ring-1 ring-inset ring-border transition-[max-width,margin,opacity,visibility,background-color] duration-slow ease-standard hover:bg-muted hover:text-foreground motion-reduce:transition-none',
                railOpen &&
                  'md:invisible md:mr-0 md:max-w-0 md:opacity-0 md:ring-0',
              )}
            >
              <PanelLeft className="size-4" />
            </button>
            <h1 className="truncate text-base font-semibold text-foreground">
              {t('title')}
            </h1>
            <RollingNumber
              value={libraryTotal}
              className="font-mono text-xs text-muted-foreground"
            />
            <AssetScopePopover
              folders={folders}
              counts={folderCounts}
              scope={folderScope}
              onScopeChange={openScope}
              onTriggerIntercept={() => {
                // 窄屏没有栏可收：胶囊照旧把文件夹抽屉拿出来。
                if (window.matchMedia('(min-width: 768px)').matches)
                  return false
                setIsFolderDrawerOpen(true)
                return true
              }}
              trigger={
                <button
                  type="button"
                  aria-label={t('folderScopeChip', { name: scopeTitle })}
                  className={cn(
                    'ml-1.5 inline-flex h-8 min-w-0 max-w-44 items-center gap-1.5 overflow-hidden rounded-full border border-border bg-background pl-1.5 pr-2.5 text-xs font-medium whitespace-nowrap text-foreground transition-[max-width,margin,padding,opacity,visibility,background-color] duration-slow ease-standard hover:bg-muted data-[state=open]:bg-muted motion-reduce:transition-none',
                    railOpen &&
                      'md:invisible md:ml-0 md:max-w-0 md:px-0 md:opacity-0',
                  )}
                >
                  {folderScope.kind === 'folder' ? (
                    scopeFolder?.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- R2 缩略图，已是小图
                      <img
                        src={scopeFolder.coverUrl}
                        alt=""
                        className="size-5 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                    )
                  ) : folderScope.kind === 'unassigned' ? (
                    <FolderX className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <LayoutGrid className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <BlurSwap swapKey={scopeTitle} className="min-w-0">
                    <span className="truncate">{scopeTitle}</span>
                  </BlurSwap>
                  <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
                </button>
              }
            />
          </div>

          {!isPickerMode && (
            <div
              ref={facetStartRef}
              inert={selectionMode}
              className={cn(
                'order-3 w-full min-w-0 sm:order-none sm:w-auto sm:flex-1',
                SELECTION_YIELD_CLASS,
                selectionMode && SELECTION_YIELD_HIDDEN_CLASS,
              )}
            >
              <AssetFacetBar
                filters={filters}
                onFiltersChange={setFilters}
                typeCounts={{
                  image: imageCount,
                  video: videoCount,
                  audio: audioCount,
                  model_3d: model3DCount,
                }}
                statusCounts={{
                  favorites: favoritesCount,
                  published: publishedCount,
                }}
                modelCounts={counts?.byModel ?? {}}
              />
            </div>
          )}

          {!isPickerMode && (
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {/* 传着时还能再点：新选的文件并进这一轮（分母跟着变大）。 */}
              <FeedbackButton
                feedback={uploadButtonFeedback}
                onClick={handleUploadClick}
                inert={selectionMode}
                className={cn(
                  buttonVariants({ size: 'sm' }),
                  TOOLBAR_BUTTON_CLASS,
                  SELECTION_YIELD_CLASS,
                  selectionMode && SELECTION_YIELD_HIDDEN_CLASS,
                )}
              >
                <UploadCloud className="size-3.5" aria-hidden />
                {t('uploadButton')}
              </FeedbackButton>
              <Button
                ref={selectButtonRef}
                type="button"
                size="sm"
                variant="ghost"
                aria-pressed={selectionMode}
                onClick={() => {
                  if (selectionMode) exitSelectionMode()
                  else setSelectionMode(true)
                }}
                className={cn(
                  TOOLBAR_BUTTON_CLASS,
                  'border border-border',
                  selectionMode && 'bg-muted hover:bg-muted md:invisible',
                )}
              >
                {selectionMode ? (
                  <>
                    <X className="size-3.5" />
                    {t('selectExit')}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="size-3.5" />
                    {t('selectMode')}
                  </>
                )}
              </Button>
              <DensityToggle density={density} onChange={changeDensity} />
            </div>
          )}

          {/* 「选择」键往左拉长成的选择条（≥768）；窄屏仍是底部浮条。 */}
          {!isPickerMode && (
            <div className="hidden md:contents">
              <AssetSelectionMorph
                open={selectionMode}
                containerRef={toolbarRef}
                startRef={facetStartRef}
                buttonRef={selectButtonRef}
              >
                {selectionBarContent}
              </AssetSelectionMorph>
            </div>
          )}
        </motion.div>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* ─── 左栏（≥768）：宽度在点下去那一刻就落到终态，栏卡片按弹簧从左缘
              滑进 / 滑出（见 `railProgress`）。 */}
          <div
            className="hidden shrink-0 md:block"
            style={{ width: railOpen ? railReserve : 0 }}
          >
            <motion.div
              inert={!railOpen}
              className="h-full pb-4"
              style={{ width: ASSET_FOLDER_RAIL_WIDTH, x: railX }}
            >
              <AssetFolderSidebar
                {...sidebarProps}
                onCollapse={() => setStoredRail('closed')}
                className="h-full rounded-2xl border border-border/70 bg-background px-2 pb-2 pt-2.5 shadow-sm"
              />
            </motion.div>
          </div>

          {/* ─── 大河 ────────────────────────────────────────────────
              `assets-scroll-gutter`：滚动条一出现容器就缩水，会把按旧宽度排好
              的 justified 行挤成横向溢出（page §5.7）。 */}
          {/* 大河那一列：滚动容器 + 盖在它上面的就地查看器，跟着栏的收放一起走。 */}
          <motion.div
            ref={riverColumnRef}
            style={{ x: riverX }}
            className="relative flex min-w-0 flex-1 flex-col"
          >
            {/* 拖图上传（原型 T）：大河那一列上一圈虚线框接住，弹簧轻过冲进场。 */}
            <div
              aria-hidden={!isFileDragging}
              className={cn(
                'pointer-events-none absolute inset-0 bottom-4 z-30 grid place-items-center rounded-2xl border-2 border-dashed border-muted-foreground/50 bg-background/70',
                'transition-[opacity,scale] duration-spring-slot ease-spring-slot motion-reduce:transition-none',
                isFileDragging ? 'scale-100 opacity-100' : 'scale-96 opacity-0',
              )}
            >
              <div className="flex flex-col items-center gap-2 text-center">
                <UploadCloud className="size-6 text-foreground/70" />
                <p className="text-sm font-medium text-foreground">
                  {t('uploadDropHint', { folder: uploadTargetLabel })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('uploadDropHintSub')}
                </p>
              </div>
            </div>
            <main
              ref={scrollElementRef}
              className="studio-scrollbar assets-scroll-gutter min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-4"
              onScroll={(event) => {
                setIsToolbarStuck(event.currentTarget.scrollTop > 8)
              }}
            >
              {/* ─── 段头：当前范围 + 张数；在夹里时多「在 X 里」与置顶 / ⋯ ─── */}
              <div className="mb-3 flex min-h-8.5 flex-wrap items-center gap-x-2.5 gap-y-1 px-0.5">
                {isRenamingScope && scopeFolder ? (
                  <ScopeNameInput
                    initial={scopeFolder.name}
                    onCommit={(name) => {
                      setIsRenamingScope(false)
                      if (name && name !== scopeFolder.name) {
                        void folderStore.rename(scopeFolder.id, name)
                      }
                    }}
                  />
                ) : (
                  <h2 className="flex min-w-0 items-baseline gap-1.5 text-base font-semibold text-foreground">
                    <span className="truncate">{scopeTitle}</span>
                    <RollingNumber
                      value={total}
                      className="font-mono text-2sm font-normal text-muted-foreground"
                    />
                  </h2>
                )}
                {scopeParentPath ? (
                  <span className="min-w-0 truncate text-2sm text-muted-foreground">
                    {t('folderInParent', { name: scopeParentPath })}
                  </span>
                ) : null}
                <span className="flex-1" />
                {scopeFolder ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-pressed={scopeFolder.pinnedOrder !== null}
                      onClick={() =>
                        void folderStore.setPinned(
                          scopeFolder.id,
                          scopeFolder.pinnedOrder === null,
                        )
                      }
                      className="h-8 rounded-lg px-3"
                    >
                      <Pin className="size-3.5" />
                      {scopeFolder.pinnedOrder === null
                        ? t('folderPin')
                        : t('folderPinned')}
                    </Button>
                    <AssetFolderMenu
                      folder={scopeFolder}
                      folders={folders}
                      align="end"
                      {...folderMenuActions(scopeFolder)}
                      onRename={() => setIsRenamingScope(true)}
                      trigger={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={t('folderMenu')}
                          className="size-8 rounded-lg"
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      }
                    />
                  </>
                ) : null}
              </div>

              {/* Hidden upload input — rendered wherever uploading is allowed
              (main page always, media picker) so both the top-bar upload
              button and the picker's inline dashed cell can trigger it. */}
              {uploadDropEnabled && (
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={USER_UPLOAD_ACCEPT}
                  multiple
                  className="sr-only"
                  aria-label={t('uploadInputLabel')}
                  onChange={handleFileChange}
                />
              )}

              {/* Krea-style switching: useGallery serves cached snapshots
              instantly (0ms) and falls through to the grid skeleton on
              the genuinely-uncached miss. No top banner / pill — the
              skeleton is the feedback. Errored fetches still show via
              the existing error path below. */}
              {/* 整页加载失败 —— 弱化面 + 重试，已加载内容不丢（§7）。 */}
              {galleryError && !isPickerMode && (
                <PageLoadError
                  title={galleryError}
                  description={t('errorKeepsLoaded')}
                  onRetry={retryGallery}
                  retrying={isLoading}
                  className="mb-3"
                />
              )}
              {isEmpty ? (
                isPickerMode ? (
                  <EmptyState />
                ) : hasActiveFilters ? (
                  <AssetEmptySearch
                    activeFilterLabels={activeFilterLabels}
                    onClearFilters={clearAllFilters}
                  />
                ) : folderScope.kind === 'folder' ? (
                  <AssetEmptyFolder
                    folderName={scopeTitle}
                    onUpload={handleUploadClick}
                  />
                ) : (
                  <AssetEmptyLibrary onUpload={handleUploadClick} />
                )
              ) : (
                <div
                  ref={setGridElement}
                  className="relative"
                  style={{ height: rowVirtualizer.getTotalSize() }}
                >
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const row = gridRows[virtualRow.index]
                    if (!row) return null
                    return (
                      <div
                        key={virtualRow.index}
                        className="absolute top-0 left-0 flex w-full"
                        style={{
                          gap: ASSET_GRID_GAP,
                          height: row.height,
                          transform: `translateY(${virtualRow.start - gridOffsetTop}px)`,
                        }}
                      >
                        {row.boxes.map((box, column) => {
                          // 行内每格的尺寸由 justified 排版算出来，瓦片按它自己的
                          // 真实比例占位 —— 所以 object-cover 在这里不裁任何东西。
                          const boxStyle = {
                            width: box.width,
                            height: box.height,
                          }
                          if (showSkeleton) {
                            return (
                              <div
                                key={`skeleton-${box.index}`}
                                style={boxStyle}
                                className="shrink-0 rounded-lg bg-muted"
                              />
                            )
                          }
                          const item = gridItems[box.index]
                          if (!item) return null
                          if (item.kind === 'pending') {
                            return (
                              <AssetUploadTile
                                key={item.item.id}
                                item={item.item}
                                width={box.width}
                                height={box.height}
                                onRetry={uploadQueue.retry}
                                onRemove={uploadQueue.remove}
                              />
                            )
                          }
                          // Picker inline upload: drop/click uploads an image and
                          // selects it, so users don't have to leave the dialog.
                          if (item.kind === 'upload') {
                            return (
                              <button
                                key="upload-cell"
                                type="button"
                                onClick={handleUploadClick}
                                disabled={isUploading}
                                aria-label={t('uploadButton')}
                                style={boxStyle}
                                className="flex shrink-0 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 bg-muted/20 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
                              >
                                {isUploading ? (
                                  <Spinner size="lg" />
                                ) : (
                                  <UploadCloud className="size-5" />
                                )}
                                <span className="text-2xs font-medium">
                                  {t('uploadButton')}
                                </span>
                              </button>
                            )
                          }
                          const gen = item.generation
                          const isSelected = selectedIds.has(gen.id)
                          const audioCoverUrl = getAudioPreviewCandidates(
                            gen,
                          ).find((url) => !failedAudioPreviewUrls.has(url))
                          const handleTileClick = (
                            event: React.MouseEvent<HTMLButtonElement>,
                          ) => {
                            if (selectionMode) {
                              // Shift 点 = 从锚点到这里整段选中（§7.1）。
                              if (event.shiftKey) selectRangeTo(gen.id)
                              else toggleSelection(gen.id)
                              return
                            }
                            setSelectedOriginRect(
                              toMediaTransitionOrigin(
                                event.currentTarget.getBoundingClientRect(),
                              ),
                            )
                            setImageNavigationDirection(1)
                            setSelectedGeneration(gen)
                          }
                          const handleTileContextMenu = (
                            e: React.MouseEvent<HTMLElement>,
                          ) => {
                            e.preventDefault()
                            if (selectionMode) toggleSelection(gen.id)
                            else enterSelectionWith(gen.id)
                          }
                          // Drag-to-folder: outside picker mode a tile can be dragged
                          // onto a folder in the sidebar. Dragging a selected tile
                          // carries the whole selection; otherwise just this asset.
                          const handleTileDragStart = (
                            event: React.DragEvent<HTMLElement>,
                          ) => {
                            const ids =
                              selectionMode && isSelected
                                ? Array.from(selectedIds)
                                : [gen.id]
                            event.dataTransfer.setData(
                              ASSET_DND_MIME,
                              JSON.stringify(ids),
                            )
                            event.dataTransfer.setData(
                              'text/plain',
                              ids.join(','),
                            )
                            // 拖到左栏 = 也放进那个夹（加，不是挪）。
                            event.dataTransfer.effectAllowed = 'copy'
                            setDraggingCount(ids.length)
                            // Multi-select batch: show a "N selected" chip instead of
                            // a single tile ghost so the user sees the drag scope.
                            if (ids.length > 1 && dragGhostRef.current) {
                              dragGhostRef.current.textContent = t(
                                'selectedCount',
                                {
                                  count: ids.length,
                                },
                              )
                              event.dataTransfer.setDragImage(
                                dragGhostRef.current,
                                16,
                                16,
                              )
                            }
                          }
                          const tile = (
                            <AssetTile
                              generation={gen}
                              width={box.width}
                              height={box.height}
                              selected={isSelected}
                              showSelectionMark={selectionMode}
                              selectionMode={selectionMode}
                              draggable={!isPickerMode && !isTouchPrimary()}
                              audioCoverUrl={audioCoverUrl}
                              onAudioCoverError={handleAudioPreviewError}
                              onClick={handleTileClick}
                              onContextMenu={handleTileContextMenu}
                              onDragStart={
                                isPickerMode ? undefined : handleTileDragStart
                              }
                              onToggleFavorite={
                                isPickerMode
                                  ? undefined
                                  : () => void toggleTileFavorite(gen.id)
                              }
                              favoritePending={favoritePendingIds.has(gen.id)}
                              revealStep={revealStep(
                                column,
                                virtualRow.index -
                                  (gridRowOfItem[batchStartOf(box.index)] ?? 0),
                              )}
                            />
                          )
                          // 从当前夹里拿出去的那几张：缩小淡出 200 再离开。
                          return (
                            <div
                              key={gen.id}
                              className={cn(
                                'shrink-0 transition-[scale,opacity] duration-base ease-standard motion-reduce:transition-none',
                                leavingIds.has(gen.id) && 'scale-95 opacity-0',
                              )}
                            >
                              {tile}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              )}
              {/* 无限滚动的尾巴（加载中 2026-10-08）：在拿 = 接一排灰块；这一批没拿到 = 灰块
                  底下一句「这批没拿到 · 重试」，⭐ 已加载的内容一个都不动。 */}
              <FeedTail
                loading={isLoading && generations.length > 0}
                error={appendError}
                ended={false}
                onRetry={retryLoadMore}
                className="mt-1"
                placeholder={
                  <div
                    aria-hidden
                    className="flex w-full"
                    style={{ gap: ASSET_GRID_GAP, height: targetRowHeight }}
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
                <div ref={sentinelRef} className="h-2" />
              )}
            </main>
            {!isPickerMode && !isPhone && selectedGeneration ? (
              <div
                className="absolute inset-y-0 right-0 z-30"
                style={{ left: viewerCoversRail ? -railReserve : 0 }}
              >
                <AssetViewer
                  generation={selectedGeneration}
                  images={imageGenerations}
                  onNavigate={(next) => {
                    setSelectedOriginRect(null)
                    setSelectedGeneration(next)
                  }}
                  onClose={() => {
                    setSelectedGeneration(null)
                    setSelectedOriginRect(null)
                  }}
                  folders={folders}
                  onCreateFolder={(name) => createFolder(name, null)}
                  onFoldersChanged={handleMembershipsChanged}
                  onFoldersUndone={handleFolderUndone}
                  onDeleted={handleAssetDeleted}
                  onRestored={handleAssetRestored}
                  onUpdated={handleAssetUpdated}
                  audioCoverUrl={
                    selectedGeneration.outputType === 'AUDIO'
                      ? getAudioPreviewCandidates(selectedGeneration).find(
                          (url) => !failedAudioPreviewUrls.has(url),
                        )
                      : undefined
                  }
                />
              </div>
            ) : null}
          </motion.div>
        </div>
      </div>
      {!isPickerMode && isPhone && (
        <AssetDetailSheet
          generation={selectedGeneration}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedGeneration(null)
              setSelectedOriginRect(null)
              setImageNavigationDirection(1)
            }
          }}
          folders={folders}
          onCreateFolder={(name) => createFolder(name, null)}
          onFoldersChanged={handleMembershipsChanged}
          onFoldersUndone={handleFolderUndone}
          onDeleted={handleAssetDeleted}
          onRestored={handleAssetRestored}
          onUpdated={handleAssetUpdated}
          transitionOrigin={selectedOriginRect}
          imageNavigation={
            showImageNavigation
              ? {
                  canGoPrevious: selectedImageIndex > 0,
                  canGoNext: selectedImageIndex < imageGenerations.length - 1,
                  direction: imageNavigationDirection,
                  onPrevious: () => selectSiblingImage(-1),
                  onNext: () => selectSiblingImage(1),
                }
              : undefined
          }
        />
      )}
      {!isPickerMode && (
        <AssetUploadQueuePanel
          items={uploadQueue.items}
          doneCount={uploadQueue.doneCount}
          errorCount={uploadQueue.errorCount}
          projects={folders}
          targetProjectId={
            uploadQueue.pendingItems[0]?.targetProjectId ??
            uploadTargetProjectId
          }
          onChangeTarget={uploadQueue.changeTarget}
          onRetry={uploadQueue.retry}
          onRetryAll={uploadQueue.retryAll}
          onRemove={uploadQueue.remove}
          onClearCompleted={uploadQueue.clearCompleted}
          onReveal={(item) =>
            openScope(
              item.targetProjectId
                ? { kind: 'folder', id: item.targetProjectId }
                : { kind: 'unassigned' },
            )
          }
        />
      )}
      {/* 窄屏（<768）：文件夹栏从左边拉出来，同一列内容（⋯ 常显、不拖动排序）。 */}
      {!isPickerMode && (
        <Sheet open={isFolderDrawerOpen} onOpenChange={setIsFolderDrawerOpen}>
          <SheetContent
            side="left"
            showCloseButton={false}
            className="gap-0 px-3 pb-3 pt-4"
          >
            <SheetTitle className="sr-only">{t('sidebarFolders')}</SheetTitle>
            <SheetDescription className="sr-only">
              {t('folderDrawerDescription')}
            </SheetDescription>
            <AssetFolderSidebar
              {...sidebarProps}
              touch
              onCollapse={() => setIsFolderDrawerOpen(false)}
              className="h-full"
            />
          </SheetContent>
        </Sheet>
      )}
      {/* Off-screen custom drag image for multi-select folder drags. */}
      <div
        ref={dragGhostRef}
        aria-hidden="true"
        style={{ position: 'fixed', left: '-9999px', top: '-9999px' }}
        className="pointer-events-none rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background shadow-lg"
      />
      {/* ─── Bulk selection action bar ─────────────────────────── */}
      {/* ⭐ **进入选择模式即出现**（§7.1）：以前要 `selectedIds.size > 0` 才渲染，
          于是「点了『选择』什么都没发生」，用户不知道进没进选择模式。 */}
      {!isPickerMode && selectionMode && (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-center px-3 md:hidden"
          style={{
            paddingBottom:
              'calc(max(var(--keyboard-safe-area-bottom, 0px), 1rem) + var(--keyboard-inset, 0px))',
          }}
        >
          {/* 选中的全是「先搜再画」出的图：「发布到画廊」置灰，原因长在工具条上方。 */}
          <SearchGroundingPublishNote
            id="asset-bulk-publish-note"
            show={bulkPublishAllBlocked}
            variant="bulk"
            className="max-w-full"
            noteClassName="pointer-events-auto mb-1.5 rounded-lg border border-border/60 bg-background/95 px-3 py-1.5 shadow-lg backdrop-blur-md"
          />
          <div className="pointer-events-auto flex max-w-full items-center gap-2 overflow-x-auto rounded-xl border border-border/60 bg-background/95 px-3 py-2 shadow-2xl backdrop-blur-md">
            <span className="px-2 text-xs font-medium tabular-nums">
              {t('selectedCount', { count: selectedIds.size })}
            </span>
            {selectedIds.size === 0 && (
              <span className="hidden px-1 text-2xs text-muted-foreground sm:inline">
                {t('selectHint')}
              </span>
            )}
            <span className="h-4 w-px bg-border/60" />
            <button
              type="button"
              onClick={selectAllVisible}
              className="rounded-full px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            >
              {t('selectAll')}
            </button>
            <button
              type="button"
              onClick={clearSelection}
              disabled={selectedIds.size === 0}
              className="rounded-full px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground disabled:opacity-40"
            >
              {t('selectClear')}
            </button>
            <span className="h-4 w-px bg-border/60" />
            {/* 加入文件夹（一张图可以同时在好几个夹里）：勾上 = 放进去，再点 = 拿出。 */}
            <AssetAddToFolderPanel
              assetIds={Array.from(selectedIds)}
              folders={folders}
              counts={folderCounts.byProject}
              onCreateFolder={(name) => createFolder(name, null)}
              onChanged={handleMembershipsChanged}
              onUndone={handleFolderUndone}
              trigger={
                <button
                  type="button"
                  disabled={isBulkActionPending || selectedIds.size === 0}
                  className="flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground disabled:opacity-40 data-[state=open]:bg-muted data-[state=open]:text-foreground"
                >
                  <FolderInput className="size-3.5" />
                  {t('addToFolder')}
                </button>
              }
            />
            <button
              type="button"
              onClick={requestBulkFavorite}
              disabled={isBulkActionPending || selectedIds.size === 0}
              className="flex items-center gap-1.5 rounded-full border border-primary/40 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
            >
              {isBulkFavoriting ? (
                <Spinner size="sm" />
              ) : (
                <Heart className="size-3.5" />
              )}
              {t('bulkFavorite')}
            </button>
            <button
              type="button"
              onClick={requestBulkPublish}
              disabled={
                isBulkActionPending ||
                selectedIds.size === 0 ||
                bulkPublishAllBlocked
              }
              aria-describedby={
                bulkPublishAllBlocked ? 'asset-bulk-publish-note' : undefined
              }
              className="flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isBulkPublishing ? (
                <Spinner size="sm" />
              ) : (
                <Globe className="size-3.5" />
              )}
              {t('bulkPublish')}
            </button>
            <button
              type="button"
              onClick={requestBulkDelete}
              disabled={isBulkActionPending || selectedIds.size === 0}
              className="flex items-center gap-1.5 rounded-full border border-status-risk/40 px-3 py-1.5 text-xs font-medium text-status-risk transition-colors hover:bg-status-risk-surface disabled:opacity-50"
            >
              <Trash2 className="size-3.5" />
              {t('bulkDelete')}
            </button>
          </div>
        </div>
      )}

      {/* ─── Confirm dialog for destructive flows ──────────────── */}
      <AlertDialog
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null)
        }}
      >
        <AlertDialogContent>
          {confirmAction && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {confirmAction.kind === 'delete-bulk'
                    ? t('bulkDelete')
                    : confirmAction.kind === 'publish-bulk'
                      ? t('bulkPublish')
                      : confirmAction.kind === 'favorite-bulk'
                        ? t('bulkFavorite')
                        : t('folderDeleteTitle', {
                            name: confirmAction.folder.name,
                          })}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {confirmAction.kind === 'delete-bulk'
                    ? t('bulkDeleteConfirm', { count: confirmAction.count })
                    : confirmAction.kind === 'publish-bulk'
                      ? confirmAction.kept > 0
                        ? `${tSearch('bulkConfirmTitle', { count: confirmAction.count })} ${tSearch('bulkSomeKept', { count: confirmAction.kept })}`
                        : t('bulkPublishConfirm', {
                            count: confirmAction.count,
                          })
                      : confirmAction.kind === 'favorite-bulk'
                        ? t('bulkFavoriteConfirm', {
                            count: confirmAction.count,
                          })
                        : folderDeleteDescription(confirmAction.folder)}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  {confirmAction.kind === 'delete-folder'
                    ? t('folderDeleteCancel')
                    : t('selectExit')}
                </AlertDialogCancel>
                <AlertDialogAction
                  variant={
                    confirmAction.kind === 'publish-bulk' ||
                    confirmAction.kind === 'favorite-bulk'
                      ? 'default'
                      : 'destructive'
                  }
                  onClick={() => {
                    const action = confirmAction
                    setConfirmAction(null)
                    if (action.kind === 'delete-bulk') {
                      performBulkDelete()
                    } else if (action.kind === 'publish-bulk') {
                      void performBulkPublish()
                    } else if (action.kind === 'favorite-bulk') {
                      void performBulkFavorite()
                    } else {
                      void performDeleteFolder(action.folder)
                    }
                  }}
                >
                  {confirmAction.kind === 'publish-bulk'
                    ? confirmAction.kept > 0
                      ? tSearch('bulkConfirmAction', {
                          count: confirmAction.count,
                        })
                      : t('bulkPublish')
                    : confirmAction.kind === 'favorite-bulk'
                      ? t('bulkFavorite')
                      : t('folderDelete')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** 段头上就地改名：回车存、Esc 或空着 = 不改。 */
function ScopeNameInput({
  initial,
  onCommit,
}: {
  initial: string
  onCommit: (name: string | null) => void
}) {
  const t = useTranslations('AssetsPage')
  const doneRef = useRef(false)
  const finish = (value: string) => {
    if (doneRef.current) return
    doneRef.current = true
    onCommit(value.trim() || null)
  }
  return (
    <input
      autoFocus
      defaultValue={initial}
      maxLength={PROJECT.NAME_MAX_LENGTH}
      aria-label={t('folderRenameInput')}
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          finish(event.currentTarget.value)
        } else if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          finish('')
        }
      }}
      onBlur={(event) => finish(event.currentTarget.value)}
      className="h-8.5 min-w-0 rounded-lg bg-background px-2 text-base font-semibold text-foreground outline-none ring-2 ring-inset ring-foreground"
    />
  )
}

/**
 * 顶栏右侧的按钮：胶囊、与左边筛选键同高 32px；上传是这页唯一的实心键，选择是
 * 无框文字键（悬停才出灰底）。
 */
/** 进选择模式时让位的那几样（分面、上传）：先糊掉，条再长出来。 */
const SELECTION_YIELD_CLASS =
  'transition-[opacity,filter] duration-fast ease-standard motion-reduce:transition-none'
const SELECTION_YIELD_HIDDEN_CLASS = 'pointer-events-none opacity-0 blur-xs'

const TOOLBAR_BUTTON_CLASS =
  'rounded-full px-3.5 has-[>svg]:px-3 transition-[background-color,transform] duration-fast ease-standard active:scale-[.98] motion-reduce:active:scale-100'

interface DensityToggleProps {
  density: AssetGridDensity
  onChange: (next: AssetGridDensity) => void
}

function DensityToggle({ density, onChange }: DensityToggleProps) {
  const t = useTranslations('AssetsPage')
  const titles: Record<AssetGridDensity, string> = {
    s: t('densitySmall'),
    m: t('densityMedium'),
    l: t('densityLarge'),
  }
  return (
    <div className="hidden shrink-0 items-center gap-2 sm:inline-flex">
      <span className="hidden text-2xs font-medium uppercase tracking-wide text-muted-foreground/70 xl:inline">
        {t('densityLabel')}
      </span>
      <LiquidSegmented
        items={ASSET_GRID_DENSITIES.map((d) => ({
          value: d,
          label: d.toUpperCase(),
          title: titles[d],
        }))}
        value={density}
        onChange={onChange}
        ariaLabel={t('densityLabel')}
        semantics="radio"
        size="row"
        fill
        className="w-30"
      />
    </div>
  )
}

/** 素材库空库（无文件夹上下文那一档）—— 走全站空态原语（ui-defaults §7）。 */
function EmptyState() {
  const t = useTranslations('AssetsPage')
  return (
    <EmptyStateTemplate
      className="my-4"
      icon={<ImageIcon aria-hidden />}
      title={t('emptyTitle')}
      description={t('emptyDescription')}
      action={
        <Button asChild className="rounded-full">
          <Link href={ROUTES.STUDIO_IMAGE}>{t('emptyAction')}</Link>
        </Button>
      }
    />
  )
}
