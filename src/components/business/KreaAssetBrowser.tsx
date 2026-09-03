'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle2,
  FolderInput,
  Globe,
  Heart,
  Image as ImageIcon,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { motion, useReducedMotion } from 'motion/react'
import { toast } from 'sonner'

import { AssetDetailSheet } from '@/components/business/AssetDetailSheet'
import { AssetFacetBar } from '@/components/business/assets/AssetFacetBar'
import {
  AssetFolderBreadcrumb,
  type BreadcrumbCrumb,
} from '@/components/business/assets/AssetFolderBreadcrumb'
import { AssetFolderOverview } from '@/components/business/assets/AssetFolderOverview'
import { AssetFolderRail } from '@/components/business/assets/AssetFolderRail'
import {
  AssetMoveTargetPicker,
  rememberMoveTarget,
} from '@/components/business/assets/AssetMoveTargetPicker'
import { AssetTile } from '@/components/business/assets/AssetTile'
import {
  AssetEmptyFolder,
  AssetEmptyLibrary,
  AssetEmptySearch,
  AssetPageError,
  AssetPaginationError,
} from '@/components/business/assets/AssetStateBlocks'
import { AssetUploadQueuePanel } from '@/components/business/assets/AssetUploadQueuePanel'
import { AssetUploadTile } from '@/components/business/assets/AssetUploadTile'
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
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ProjectCreateDialog } from '@/components/business/ProjectCreateDialog'
import { useGallery, type GalleryFilters } from '@/hooks/use-gallery'
import { useLocalPreference } from '@/hooks/use-local-preference'
import {
  useAssetUploadQueue,
  type UploadQueueItem,
  type UploadResult,
} from '@/hooks/use-asset-upload-queue'
import {
  useAssetGridViewport,
  useJustifiedGrid,
} from '@/hooks/use-justified-grid'
import { useProjects } from '@/hooks/use-projects'
import { useStableDragState } from '@/hooks/use-stable-drag-state'
import { ROUTES } from '@/constants/routes'
import { motionTransition } from '@/constants/motion'
import { ASSET_DND_MIME } from '@/constants/asset-dnd'
import {
  DEFAULT_AUDIO_ASSET_PREVIEW_IMAGE,
  getAudioAssetPreviewImage,
} from '@/constants/asset-previews'
import {
  ASSET_GRID_AUDIO_ASPECT_RATIO,
  BULK_MOVE_UNDO_DURATION_MS,
  ASSET_GRID_DEFAULT_DENSITY,
  ASSET_GRID_DENSITIES,
  ASSET_GRID_DENSITY_STORAGE_KEY,
  ASSET_GRID_GAP,
  ASSET_GRID_SKELETON_ASPECT_RATIOS,
  ASSET_GRID_TARGET_ROW_HEIGHT,
  ASSET_PICKER_UPLOAD_CELL_ASPECT_RATIO,
  PROJECT_COVER_TILE_COUNT,
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
import { Link } from '@/i18n/navigation'
import {
  batchAssignProjectAPI,
  batchDeleteGenerationsAPI,
  batchSetLikeAPI,
  batchUpdateVisibilityAPI,
  fetchAssetSectionCounts,
} from '@/lib/api-client/gallery'
import {
  uploadAudioFileAPI,
  uploadImageFileAPI,
  uploadVideoFileAPI,
} from '@/lib/api-client/generation'
import { readAudioFileMetadata } from '@/lib/audio-metadata'
import { getApiErrorMessage } from '@/lib/api-error-message'
import { prepareImageUpload } from '@/lib/prepare-image-upload'
import { clearGalleryCache } from '@/lib/gallery-cache'
import {
  DEFAULT_FOLDER_SORT_MODE,
  FOLDER_SORT_STORAGE_KEY,
  getChildFolders,
  getFolderPath,
  isFolderSortMode,
  type FolderSortMode,
} from '@/lib/folder-tree'
import { toLayoutAspectRatio } from '@/lib/justified-layout'
import { cn } from '@/lib/utils'
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
  /** 首屏落在哪个视图 —— 由 `?view=folders` 决定（刷新不丢位置）。 */
  initialView?: AssetsView
  className?: string
}

/** `library` = 大厅/夹内页（有网格）；`folders` = 文件夹总览页（只有门牌）。 */
export type AssetsView = 'library' | 'folders'

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

type Section =
  | { kind: 'all' }
  | { kind: 'favorites' }
  | { kind: 'published' }
  | { kind: 'uploads' }
  | { kind: 'unassigned' }
  | { kind: 'project'; id: string }

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

function sectionFromFilters(filters: GalleryFilters): Section {
  if (filters.liked) return { kind: 'favorites' }
  if (filters.published) return { kind: 'published' }
  if (filters.provider === USER_UPLOAD_PROVIDER) return { kind: 'uploads' }
  if (filters.projectId === 'none') return { kind: 'unassigned' }
  if (filters.projectId) return { kind: 'project', id: filters.projectId }
  return { kind: 'all' }
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

function shouldKeepAssetAfterPatch(
  section: Section,
  generation: GenerationRecord,
  /** 生效的类型分面；空数组 = 不限类型，什么都留得住。 */
  allowedTypes: readonly LockedMediaType[],
): boolean {
  if (
    allowedTypes.length > 0 &&
    !allowedTypes.some((type) =>
      outputTypeMatchesMediaType(generation.outputType, type),
    )
  ) {
    return false
  }

  switch (section.kind) {
    case 'all':
      return true
    case 'favorites':
      return !!generation.isLiked
    case 'published':
      return generation.isPublic
    case 'uploads':
      return generation.provider === USER_UPLOAD_PROVIDER
    case 'unassigned':
      return generation.projectId == null
    case 'project':
      return generation.projectId === section.id
  }
}

function shouldKeepAssetAfterProjectMove(
  section: Section,
  projectId: string | null,
): boolean {
  if (
    section.kind === 'all' ||
    section.kind === 'favorites' ||
    section.kind === 'published' ||
    section.kind === 'uploads'
  ) {
    return true
  }
  if (section.kind === 'unassigned') return projectId === null
  return section.id === projectId
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
  initialView = 'library',
  className,
}: KreaAssetBrowserProps) {
  const t = useTranslations('AssetsPage')
  const tErrors = useTranslations('Errors')
  const reducedMotion = useReducedMotion()
  const [isToolbarStuck, setIsToolbarStuck] = useState(false)

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
    updateGeneration,
  } = useGallery({
    initialGenerations,
    initialPage,
    initialHasMore,
    initialNextCursor,
    initialTotal,
    initialFilters: effectiveInitialFilters,
    mine: true,
    limit: 24,
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

  const {
    projects,
    refresh: refreshProjects,
    update: updateProject,
    remove: removeProject,
  } = useProjects({ loadHistoryOnMount: false })
  const section = useMemo(() => sectionFromFilters(filters), [filters])
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

  const fileInputRef = useRef<HTMLInputElement>(null)
  // Off-screen element used as a custom drag image when dragging a multi-select
  // batch onto a folder — shows the count instead of a lone thumbnail ghost.
  const dragGhostRef = useRef<HTMLDivElement>(null)
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [isBulkPublishing, setIsBulkPublishing] = useState(false)
  const [isBulkFavoriting, setIsBulkFavoriting] = useState(false)
  const [isBulkMoving, setIsBulkMoving] = useState(false)

  // ── Confirm action state ──────────────────────────────────────
  // One AlertDialog handles every destructive flow (bulk delete, publish,
  // favorite, folder delete) — keeps the Krea-style modal consistent and
  // replaces the native window.confirm() pop-up which looked out of place.
  type ConfirmAction =
    | { kind: 'delete-bulk'; count: number }
    | { kind: 'publish-bulk'; count: number }
    | { kind: 'favorite-bulk'; count: number }
    | { kind: 'delete-folder'; id: string; name: string }
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
  const handleAssetDeleted = useCallback(
    (id: string) => {
      clearGalleryCache()
      removeGeneration(id)
      void refreshCounts()
    },
    [removeGeneration, refreshCounts],
  )

  const selectAllVisible = useCallback(() => {
    setSelectedIds(new Set(generations.map((g) => g.id)))
  }, [generations])

  const requestBulkDelete = () => {
    const count = selectedIds.size
    if (count === 0) return
    setConfirmAction({ kind: 'delete-bulk', count })
  }

  const performBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setIsBulkDeleting(true)
    clearGalleryCache()
    ids.forEach((id) => removeGeneration(id))
    exitSelectionMode()
    void refreshCounts()
    try {
      const result = await batchDeleteGenerationsAPI(ids)
      if (!result.success) {
        toast.error(result.error ?? t('bulkDeleteFailed'))
        return
      }
      const deletedCount = result.data?.deletedCount ?? ids.length
      void refreshCounts()
      toast.success(t('bulkDeleteSuccess', { count: deletedCount }))
    } finally {
      setIsBulkDeleting(false)
    }
  }, [selectedIds, t, removeGeneration, refreshCounts, exitSelectionMode])

  const requestBulkPublish = () => {
    const count = selectedIds.size
    if (count === 0) return
    setConfirmAction({ kind: 'publish-bulk', count })
  }

  const performBulkPublish = useCallback(async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setIsBulkPublishing(true)
    try {
      const result = await batchUpdateVisibilityAPI(ids, 'isPublic', true)
      if (!result.success) {
        toast.error(result.error ?? t('bulkPublishFailed'))
        return
      }
      const updatedCount = result.data?.updatedCount ?? ids.length
      clearGalleryCache()
      ids.forEach((id) => updateGeneration(id, { isPublic: true }))
      void refreshCounts()
      toast.success(t('bulkPublishSuccess', { count: updatedCount }))
      exitSelectionMode()
    } finally {
      setIsBulkPublishing(false)
    }
  }, [selectedIds, t, updateGeneration, refreshCounts, exitSelectionMode])

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

  // Core move: reassign a set of assets to a project (or unassigned) and
  // reconcile the grid + sidebar counts. Shared by the bulk-action bar and
  // the drag-to-folder drop target.
  const moveAssets = useCallback(
    async (ids: string[], projectId: string | null) => {
      if (ids.length === 0) return
      // ⛔ 撤销**必须按每一项原来的 projectId 分别回写**（§7.2）：选中的 4 项
      // 可能来自 4 个不同的夹，写成「全部丢回未分类」就是数据损坏。
      const originById = new Map(
        ids.map((id) => [
          id,
          generationsRef.current.find((generation) => generation.id === id)
            ?.projectId ?? null,
        ]),
      )
      const result = await batchAssignProjectAPI(ids, projectId)
      if (!result.success) {
        toast.error(result.error ?? t('bulkMoveFailed'))
        return
      }
      const updatedCount = result.data?.updatedCount ?? ids.length
      const shouldKeep = shouldKeepAssetAfterProjectMove(section, projectId)
      clearGalleryCache()
      ids.forEach((id) => {
        if (shouldKeep) updateGeneration(id, { projectId })
        else removeGeneration(id)
      })
      void refreshCounts()
      rememberMoveTarget(projectId)

      const undo = async () => {
        // 按「原夹」分组，一组一次请求。
        const byOrigin = new Map<string | null, string[]>()
        originById.forEach((origin, id) => {
          const bucket = byOrigin.get(origin) ?? []
          bucket.push(id)
          byOrigin.set(origin, bucket)
        })
        for (const [origin, groupIds] of byOrigin) {
          await batchAssignProjectAPI(groupIds, origin)
        }
        clearGalleryCache()
        void refreshCounts()
        retryGallery()
        toast.success(t('bulkMoveUndone'))
      }
      toast.success(t('bulkMoveSuccess', { count: updatedCount }), {
        duration: BULK_MOVE_UNDO_DURATION_MS,
        action: { label: t('bulkMoveUndo'), onClick: () => void undo() },
      })
    },
    [
      section,
      t,
      updateGeneration,
      removeGeneration,
      refreshCounts,
      retryGallery,
    ],
  )

  const performBulkMove = useCallback(
    async (projectId: string | null) => {
      const ids = Array.from(selectedIds)
      if (ids.length === 0) return
      setIsBulkMoving(true)
      try {
        await moveAssets(ids, projectId)
        exitSelectionMode()
      } finally {
        setIsBulkMoving(false)
      }
    },
    [selectedIds, moveAssets, exitSelectionMode],
  )

  const handleDropAssetsOnFolder = useCallback(
    (projectId: string | null, ids: string[]) => {
      void moveAssets(ids, projectId)
    },
    [moveAssets],
  )

  // Folder reassignment may push the asset out of the current section
  // (e.g. user is viewing "Unassigned" and moves into a folder). Drop
  // it locally so the grid reflects the move without a refetch, then
  // refresh the sidebar counts so both buckets update.
  const handleAssetMoved = useCallback(
    (id: string) => {
      clearGalleryCache()
      removeGeneration(id)
      void refreshCounts()
    },
    [removeGeneration, refreshCounts],
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
        'projectId' in patch ||
        'provider' in patch ||
        'outputType' in patch

      if (changesSectionMembership) {
        clearGalleryCache()
        setCounts((previous) =>
          updateCountsAfterAssetPatch(previous, current, patch),
        )
      }

      if (!shouldKeepAssetAfterPatch(section, nextGeneration, scopedTypes)) {
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
      section,
      scopedTypes,
      updateGeneration,
      removeGeneration,
      refreshCounts,
    ],
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

  const filtersForSection = useCallback(
    (next: Section): GalleryFilters => {
      const base: GalleryFilters = {
        ...filters,
        // 文件夹范围只改范围。类型是独立的可叠加维度，切范围不该把它清掉
        // ——「收藏 + 视频」「某个夹 + 图片」都要能同时成立。
        liked: false,
        published: false,
        projectId: '',
        provider: '',
        types: filters.types,
      }
      switch (next.kind) {
        case 'all':
          return base
        case 'favorites':
          return { ...base, liked: true }
        case 'published':
          return { ...base, published: true }
        case 'uploads':
          return { ...base, provider: USER_UPLOAD_PROVIDER }
        case 'unassigned':
          return { ...base, projectId: 'none' }
        case 'project':
          return { ...base, projectId: next.id }
      }
    },
    [filters],
  )

  const setSection = useCallback(
    (next: Section) => {
      setFilters(filtersForSection(next))
    },
    [filtersForSection, setFilters],
  )

  // ── 文件夹体系：门牌行 / 夹内页 / 总览页（page §3 末 + §4）──────
  // ⚠ 夹内页与总览页是**路由**，不是 overlay：全局左侧导航始终可见，
  // 浏览器后退可用、URL 可分享、刷新不丢位置。
  const [view, setView] = useState<AssetsView>(initialView)
  const [storedFolderSort, setStoredFolderSort] = useLocalPreference(
    FOLDER_SORT_STORAGE_KEY,
  )
  const folderSortMode: FolderSortMode = isFolderSortMode(storedFolderSort)
    ? storedFolderSort
    : DEFAULT_FOLDER_SORT_MODE
  // `undefined` = 弹窗关着；`null`/id = 开着并指定父夹。
  const [createFolderParentId, setCreateFolderParentId] = useState<
    string | null | undefined
  >(undefined)
  const isFolderScoped =
    section.kind === 'project' || section.kind === 'unassigned'

  // ⚠ 排序档以前是纯 useState，刷新就掉回默认（page §4.1 的「另一处小缺陷」）。
  const changeFolderSortMode = setStoredFolderSort

  /** 把当前范围写进地址栏（用户点出来的都 push，后退才有东西可回）。 */
  const pushAssetsUrl = useCallback(
    (next: { projectId?: string; view?: AssetsView }) => {
      const params = new URLSearchParams(window.location.search)
      if (next.projectId) params.set('projectId', next.projectId)
      else params.delete('projectId')
      if (next.view === 'folders') params.set('view', 'folders')
      else params.delete('view')
      const query = params.toString()
      window.history.pushState(
        null,
        '',
        query
          ? `${window.location.pathname}?${query}`
          : window.location.pathname,
      )
    },
    [],
  )

  const openFolder = useCallback(
    (projectId: string) => {
      setView('library')
      setSection({ kind: 'project', id: projectId })
      pushAssetsUrl({ projectId })
    },
    [setSection, pushAssetsUrl],
  )
  const openUnassigned = useCallback(() => {
    setView('library')
    setSection({ kind: 'unassigned' })
    pushAssetsUrl({ projectId: 'none' })
  }, [setSection, pushAssetsUrl])
  const openFolderOverview = useCallback(() => {
    setView('folders')
    pushAssetsUrl({ view: 'folders' })
  }, [pushAssetsUrl])
  const openLibrary = useCallback(() => {
    setView('library')
    setSection({ kind: 'all' })
    pushAssetsUrl({})
  }, [setSection, pushAssetsUrl])

  // 后退/前进：从地址栏读回范围，⛔ 不再 push（否则历史会自乘）。
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search)
      const projectId = params.get('projectId')
      setView(params.get('view') === 'folders' ? 'folders' : 'library')
      if (projectId === 'none') setSection({ kind: 'unassigned' })
      else if (projectId) setSection({ kind: 'project', id: projectId })
      else setSection({ kind: 'all' })
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [setSection])

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
      if (shouldKeepAssetAfterPatch(section, generation, scopedTypes)) {
        prependGeneration(generation)
      }
      void refreshCounts()
    },
    [section, scopedTypes, prependGeneration, refreshCounts],
  )

  const uploadQueue = useAssetUploadQueue({
    upload: uploadOneFile,
    onUploaded: handleUploaded,
  })
  const isUploading = uploadQueue.isUploading

  /** 上传落夹目标 = 当前范围（§7.3.4）。 */
  const uploadTargetProjectId = section.kind === 'project' ? section.id : null

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
  const uploadTargetLabel =
    section.kind === 'project'
      ? (projects.find((project) => project.id === section.id)?.name ??
        t('sidebarUnassigned'))
      : t('sidebarUnassigned')

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

  const handleRenameProject = useCallback(
    async (id: string, newName: string) => {
      const ok = await updateProject(id, { name: newName })
      if (ok) void refreshCounts()
      return ok
    },
    [updateProject, refreshCounts],
  )

  const requestDeleteProject = (id: string, name: string) => {
    setConfirmAction({ kind: 'delete-folder', id, name })
  }

  const handleProjectCreated = (project: ProjectRecord) => {
    void refreshProjects()
    void refreshCounts()
    setCreateFolderParentId(undefined)
    // 新建完直接进这个夹 —— 用户下一步多半就是往里放东西。
    openFolder(project.id)
  }

  const performDeleteProject = async (id: string) => {
    const ok = await removeProject(id)
    if (!ok) return
    // If the user was viewing this folder, snap them back to All.
    if (section.kind === 'project' && section.id === id) {
      setSection({ kind: 'all' })
    }
    void refreshCounts()
  }

  const isEmpty = !isLoading && generations.length === 0
  /**
   * 空库 = 没有任何筛选、也不在某个夹里，却还是零素材。
   * §7 明写这种情况下**文件夹段一并隐藏** —— 一个新用户不该先看见一排空门牌。
   */
  const isLibraryEmpty =
    isEmpty && section.kind === 'all' && projects.length === 0
  const isBulkActionPending =
    isBulkDeleting || isBulkPublishing || isBulkFavoriting || isBulkMoving

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
    counts?.favorites ?? (section.kind === 'favorites' ? total : undefined)
  const publishedCount =
    counts?.published ?? (section.kind === 'published' ? total : undefined)
  const imageCount =
    counts?.image ?? (activeMediaType === 'image' ? total : undefined)
  const videoCount =
    counts?.video ?? (activeMediaType === 'video' ? total : undefined)
  const audioCount =
    counts?.audio ?? (activeMediaType === 'audio' ? total : undefined)
  const model3DCount =
    counts?.model_3d ?? (activeMediaType === 'model_3d' ? total : undefined)
  const unassignedCount =
    counts?.unassigned ?? (section.kind === 'unassigned' ? total : undefined)
  const projectCount = useCallback(
    (id: string): number | undefined =>
      counts?.byProject[id] ??
      (section.kind === 'project' && section.id === id ? total : undefined),
    [counts, section, total],
  )

  /**
   * 「未分类」不是 Project，服务端不会给它 `coverUrls` —— 用当前列表里
   * 未归夹的素材凑 2×2（它们本来就在屏上，零额外请求）。
   */
  const unassignedCovers = useMemo(
    () =>
      generations
        .filter((generation) => generation.projectId == null)
        .map(
          (generation) =>
            generation.thumbnailUrl ??
            generation.previewUrl ??
            (generation.outputType === 'IMAGE' ? generation.url : null),
        )
        .filter((url): url is string => Boolean(url))
        .slice(0, PROJECT_COVER_TILE_COUNT),
    [generations],
  )

  // ── 面包屑 `素材 › 鸣潮 › 弗洛洛`（page §3 末）───────────────────
  const currentFolderPath = useMemo(
    () =>
      section.kind === 'project' ? getFolderPath(projects, section.id) : [],
    [projects, section],
  )
  const currentFolderChildren = useMemo(
    () =>
      section.kind === 'project' ? getChildFolders(projects, section.id) : [],
    [projects, section],
  )
  const breadcrumbCrumbs: BreadcrumbCrumb[] = [
    { key: 'library', label: t('title'), onClick: openLibrary },
    ...(view === 'folders'
      ? []
      : currentFolderPath.slice(0, -1).map((folder) => ({
          key: folder.id,
          label: folder.name,
          onClick: () => openFolder(folder.id),
        }))),
  ]
  const breadcrumbCurrent =
    view === 'folders'
      ? t('sidebarFolders')
      : section.kind === 'unassigned'
        ? t('sidebarUnassigned')
        : (currentFolderPath[currentFolderPath.length - 1]?.name ?? t('title'))

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

  /** `Esc` = 返回上一级（子夹 → 父夹 → 素材大厅）。 */
  useEffect(() => {
    if (isPickerMode) return
    if (view !== 'folders' && !isFolderScoped) return
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
      const parent = currentFolderPath[currentFolderPath.length - 2]
      if (view === 'library' && parent) openFolder(parent.id)
      else openLibrary()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    isPickerMode,
    view,
    isFolderScoped,
    currentFolderPath,
    openFolder,
    openLibrary,
  ])

  /** 拖门牌进门牌 = 变子夹（环形父子由 service 兜底拒绝）。 */
  const handleMoveFolder = useCallback(
    async (folderId: string, parentId: string | null) => {
      const ok = await updateProject(folderId, { parentId })
      if (ok) {
        void refreshProjects()
        void refreshCounts()
      }
    },
    [updateProject, refreshProjects, refreshCounts],
  )

  return (
    <div
      className={cn(
        'flex h-[calc(100svh-3rem)] flex-col bg-background',
        className,
      )}
      onDragEnter={handleRootDragEnter}
      onDragOver={handleRootDragOver}
      onDragLeave={handleRootDragLeave}
      onDrop={handleRootDrop}
    >
      {isFileDragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-foreground/40 bg-background/60 px-10 py-8 text-center">
            <UploadCloud className="size-8 text-foreground/70" />
            <p className="text-sm font-medium text-foreground">
              {t('uploadDropHint', { folder: uploadTargetLabel })}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('uploadDropHintSub')}
            </p>
          </div>
        </div>
      )}
      <div className="flex flex-1 min-h-0 gap-4 px-2 sm:px-6">
        {/* ─── Main grid area ────────────────────────────────────── */}
        {/* `assets-scroll-gutter`：滚动条一出现容器就缩水，会把按旧宽度排好
            的 justified 行挤成横向溢出（page §5.7）。 */}
        <main
          className="studio-scrollbar assets-scroll-gutter flex-1 min-w-0 overflow-x-hidden overflow-y-auto py-4"
          onScroll={(event) => {
            setIsToolbarStuck(event.currentTarget.scrollTop > 8)
          }}
        >
          {/* ─── 顶栏（默认单行）──────────────────────────────────
              page §3：`素材 + 总数` · 分面筛选 · ——弹性—— · 上传 · 选择 · 密度。
              条件生效时，可删除的筛选 chips 留在同一个吸顶框内并自然增加一行。 */}
          <motion.div
            initial={
              reducedMotion ? false : { opacity: 0, y: -6, scale: 0.995 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={motionTransition('slow', reducedMotion)}
            data-stuck={isToolbarStuck || undefined}
            className={cn(
              'sticky top-0 z-30 mx-auto mb-3 flex min-h-14 w-full flex-wrap items-center gap-2 rounded-2xl border bg-background px-4 py-2 transition-[border-color,box-shadow] duration-(--duration-base) ease-standard sm:w-11/12 sm:max-w-screen-2xl',
              isToolbarStuck
                ? 'border-border shadow-md'
                : 'border-border/70 shadow-sm',
            )}
          >
            <div className="flex min-w-0 items-center gap-1.5">
              <h1 className="truncate text-base font-semibold text-foreground">
                {t('title')}
              </h1>
              <span className="text-xs tabular-nums text-muted-foreground">
                {libraryTotal}
              </span>
            </div>

            {!isPickerMode && (
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
                className="order-3 w-full min-w-0 sm:order-none sm:w-auto sm:flex-1"
              />
            )}

            {!isPickerMode && (
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleUploadClick}
                  disabled={isUploading}
                  className="h-9 rounded-lg px-4 shadow-none transition-[transform,box-shadow] duration-(--duration-fast) ease-standard hover:-translate-y-px hover:shadow-sm active:translate-y-0"
                >
                  {isUploading ? (
                    <Spinner size="sm" />
                  ) : (
                    <UploadCloud className="size-3.5" />
                  )}
                  <span>
                    {isUploading ? t('uploading') : t('uploadButton')}
                  </span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={selectionMode ? 'secondary' : 'outline'}
                  aria-pressed={selectionMode}
                  onClick={() => {
                    if (selectionMode) exitSelectionMode()
                    else setSelectionMode(true)
                  }}
                  className={cn(
                    'h-9 rounded-lg px-4 transition-transform duration-(--duration-fast) ease-standard hover:-translate-y-px active:translate-y-0',
                    selectionMode &&
                      'border-foreground/20 bg-muted text-foreground hover:bg-muted/80',
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
          </motion.div>

          {/* ─── 段一 · 文件夹门牌行（page §3 / §4）──────────────────
              ⚠ 夹内页/总览页**不是全屏 overlay** —— 它们就在这块内容区里换一段，
              全局左侧导航始终可见；URL 跟着走，后退可用、刷新不丢位置。 */}
          {!isPickerMode &&
            !isFolderScoped &&
            view === 'library' &&
            !isLibraryEmpty && (
              <AssetFolderRail
                projects={projects}
                sortMode={folderSortMode}
                unassignedCount={unassignedCount}
                unassignedCovers={unassignedCovers}
                countFor={projectCount}
                activeProjectId={null}
                isUnassignedActive={false}
                onOpenFolder={(id) => openFolder(id)}
                onOpenUnassigned={openUnassigned}
                onOpenOverview={openFolderOverview}
                onCreateFolder={() => setCreateFolderParentId(null)}
                onDropAssets={handleDropAssetsOnFolder}
                className="mb-3"
              />
            )}

          {/* 夹内页 / 总览页的面包屑（每级可点回；`Esc` 等价于返回上一级）。 */}
          {!isPickerMode && (view === 'folders' || isFolderScoped) && (
            <div className="mb-3 grid gap-3">
              <AssetFolderBreadcrumb
                crumbs={breadcrumbCrumbs}
                current={breadcrumbCurrent}
                count={view === 'folders' ? projects.length : total}
              />
              {/* 路径二：子夹小门牌置顶。 */}
              {view === 'library' && currentFolderChildren.length > 0 && (
                <AssetFolderRail
                  projects={projects}
                  folders={currentFolderChildren}
                  sortMode={folderSortMode}
                  showUnassigned={false}
                  showViewAll={false}
                  countFor={projectCount}
                  activeProjectId={
                    section.kind === 'project' ? section.id : null
                  }
                  onOpenFolder={(id) => openFolder(id)}
                  onCreateFolder={() =>
                    setCreateFolderParentId(
                      section.kind === 'project' ? section.id : null,
                    )
                  }
                  onDropAssets={handleDropAssetsOnFolder}
                />
              )}
            </div>
          )}

          {/* 文件夹总览页（治理 2）—— 全部夹的门牌网格，夹的专属管理页。 */}
          {!isPickerMode && view === 'folders' && (
            <AssetFolderOverview
              projects={projects}
              sortMode={folderSortMode}
              onSortModeChange={changeFolderSortMode}
              countFor={projectCount}
              unassignedCount={unassignedCount}
              activeProjectId={section.kind === 'project' ? section.id : null}
              onOpenFolder={(id) => openFolder(id)}
              onOpenUnassigned={openUnassigned}
              onCreateFolder={() => setCreateFolderParentId(null)}
              onDropAssets={handleDropAssetsOnFolder}
              onMoveFolder={handleMoveFolder}
              onRenameFolder={handleRenameProject}
              onRequestDeleteFolder={requestDeleteProject}
            />
          )}

          {/* ─── 段二段头（page §3.1）──────────────────────────────
              分面筛选已合入吸顶顶栏，这里只保留当前内容口径。 */}
          {!isPickerMode && view === 'library' && !isFolderScoped && (
            <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="text-sm font-medium text-foreground">
                {t('sectionAllAssets')}
              </h2>
              <span className="text-xs tabular-nums text-muted-foreground">
                {total}
              </span>
            </div>
          )}

          {/* ⛔ 移动端那个「分组」折叠器已退役：视图那组并进了分面栏（§3.1
              「不另做一套移动 chips」），文件夹那组由门牌行承担（它在 <768
              本来就是固定宽横滚）。 */}
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
              the existing error path below.
              ⚠ 总览页是「夹的管理页」，本来就没有素材网格。 */}
          {/* 整页加载失败 —— 弱化面 + 重试，已加载内容不丢（§7）。 */}
          {galleryError && !isPickerMode && (
            <AssetPageError
              message={galleryError}
              onRetry={retryGallery}
              className="mb-3"
            />
          )}
          {view === 'folders' ? null : isEmpty ? (
            isPickerMode ? (
              <EmptyState />
            ) : hasActiveFilters ? (
              <AssetEmptySearch
                activeFilterLabels={activeFilterLabels}
                onClearFilters={clearAllFilters}
              />
            ) : section.kind === 'project' ? (
              <AssetEmptyFolder
                folderName={breadcrumbCurrent}
                onUpload={handleUploadClick}
              />
            ) : (
              <AssetEmptyLibrary onUpload={handleUploadClick} />
            )
          ) : (
            <div
              ref={gridContainerRef}
              className="flex flex-col"
              style={{ gap: ASSET_GRID_GAP }}
            >
              {gridRows.map((row, rowIndex) => (
                <div
                  key={rowIndex}
                  className="flex"
                  style={{ gap: ASSET_GRID_GAP }}
                >
                  {row.boxes.map((box) => {
                    // 行内每格的尺寸由 justified 排版算出来，瓦片按它自己的
                    // 真实比例占位 —— 所以 object-cover 在这里不裁任何东西。
                    const boxStyle = { width: box.width, height: box.height }
                    if (showSkeleton) {
                      return (
                        <div
                          key={`skeleton-${box.index}`}
                          style={boxStyle}
                          className="shrink-0 animate-pulse rounded-lg bg-muted/40"
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
                    const audioCoverUrl = getAudioPreviewCandidates(gen).find(
                      (url) => !failedAudioPreviewUrls.has(url),
                    )
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
                      e: React.MouseEvent<HTMLButtonElement>,
                    ) => {
                      e.preventDefault()
                      if (selectionMode) toggleSelection(gen.id)
                      else enterSelectionWith(gen.id)
                    }
                    // Drag-to-folder: outside picker mode a tile can be dragged
                    // onto a folder in the sidebar. Dragging a selected tile
                    // carries the whole selection; otherwise just this asset.
                    const handleTileDragStart = (
                      event: React.DragEvent<HTMLButtonElement>,
                    ) => {
                      const ids =
                        selectionMode && isSelected
                          ? Array.from(selectedIds)
                          : [gen.id]
                      event.dataTransfer.setData(
                        ASSET_DND_MIME,
                        JSON.stringify(ids),
                      )
                      event.dataTransfer.setData('text/plain', ids.join(','))
                      event.dataTransfer.effectAllowed = 'move'
                      // Multi-select batch: show a "N selected" chip instead of
                      // a single tile ghost so the user sees the drag scope.
                      if (ids.length > 1 && dragGhostRef.current) {
                        dragGhostRef.current.textContent = t('selectedCount', {
                          count: ids.length,
                        })
                        event.dataTransfer.setDragImage(
                          dragGhostRef.current,
                          16,
                          16,
                        )
                      }
                    }
                    return (
                      <AssetTile
                        key={gen.id}
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
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          )}
          {/* ⭐ 分页失败只挡这一段：已加载的内容一个都不动。 */}
          {view === 'library' && appendError && (
            <AssetPaginationError
              message={appendError}
              onRetry={retryLoadMore}
              className="mt-3"
            />
          )}
          {view === 'library' && hasMore && !appendError && (
            <div ref={sentinelRef} className="h-2" />
          )}

          {isLoading && generations.length > 0 && (
            <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
              <Spinner size="md" />
            </div>
          )}
        </main>

        {/* ⛔ 常驻右栏文件夹树已退役（page §2：不增加第二个永久左/右栏）。
            文件夹现在走「段一门牌行 → 夹内页 → 总览页」三段式，CRUD 收进
            总览页。picker 的文件夹导航栏是另一件事，见切片 6b。 */}
      </div>
      {!isPickerMode && (
        <AssetDetailSheet
          generation={selectedGeneration}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedGeneration(null)
              setSelectedOriginRect(null)
              setImageNavigationDirection(1)
            }
          }}
          projects={projects}
          onDeleted={handleAssetDeleted}
          onMoved={handleAssetMoved}
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
          projects={projects}
          targetProjectId={
            uploadQueue.pendingItems[0]?.targetProjectId ??
            uploadTargetProjectId
          }
          onChangeTarget={uploadQueue.changeTarget}
          onRetry={uploadQueue.retry}
          onRetryAll={uploadQueue.retryAll}
          onRemove={uploadQueue.remove}
          onClearCompleted={uploadQueue.clearCompleted}
          onReveal={(item) => {
            if (item.targetProjectId) openFolder(item.targetProjectId)
            else openUnassigned()
          }}
        />
      )}
      {/* 门牌行 / 总览页的「新建文件夹」卡是布局里的一格，塞不进
          DialogTrigger，所以这里用受控实例，由那两处直接开。 */}
      {!isPickerMode && (
        <ProjectCreateDialog
          open={createFolderParentId !== undefined}
          onOpenChange={(next) => {
            if (!next) setCreateFolderParentId(undefined)
          }}
          parentId={createFolderParentId ?? null}
          onCreated={handleProjectCreated}
        />
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
          className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 md:pb-6"
          style={{
            paddingBottom:
              'calc(max(var(--keyboard-safe-area-bottom, 0px), 1rem) + var(--keyboard-inset, 0px))',
          }}
        >
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
            {/* §7.2：扁平下拉 → 可搜索目标选择器（搜索 / 最近移入过 / 移出 /
                全部文件夹 / 新建并移入）。 */}
            <AssetMoveTargetPicker
              projects={projects}
              onMove={(projectId) => void performBulkMove(projectId)}
              onCreateAndMove={() => setCreateFolderParentId(null)}
              trigger={
                <button
                  type="button"
                  disabled={isBulkActionPending || selectedIds.size === 0}
                  className="flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground disabled:opacity-40"
                >
                  {isBulkMoving ? (
                    <Spinner size="sm" />
                  ) : (
                    <FolderInput className="size-3.5" />
                  )}
                  {t('bulkMove')}
                </button>
              }
            />
            <button
              type="button"
              onClick={requestBulkFavorite}
              disabled={isBulkActionPending || selectedIds.size === 0}
              className="flex items-center gap-1.5 rounded-full border border-rose-500/40 px-3 py-1.5 text-xs font-medium text-rose-500 transition-colors hover:bg-rose-500/10 disabled:opacity-50"
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
              disabled={isBulkActionPending || selectedIds.size === 0}
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
              className="flex items-center gap-1.5 rounded-full border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
            >
              {isBulkDeleting ? (
                <Spinner size="sm" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
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
                        : t('folderDelete')}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {confirmAction.kind === 'delete-bulk'
                    ? t('bulkDeleteConfirm', { count: confirmAction.count })
                    : confirmAction.kind === 'publish-bulk'
                      ? t('bulkPublishConfirm', { count: confirmAction.count })
                      : confirmAction.kind === 'favorite-bulk'
                        ? t('bulkFavoriteConfirm', {
                            count: confirmAction.count,
                          })
                        : t('folderDeleteConfirm')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('selectExit')}</AlertDialogCancel>
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
                      void performBulkDelete()
                    } else if (action.kind === 'publish-bulk') {
                      void performBulkPublish()
                    } else if (action.kind === 'favorite-bulk') {
                      void performBulkFavorite()
                    } else {
                      void performDeleteProject(action.id)
                    }
                  }}
                >
                  {confirmAction.kind === 'publish-bulk'
                    ? t('bulkPublish')
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

interface DensityToggleProps {
  density: AssetGridDensity
  onChange: (next: AssetGridDensity) => void
}

function DensityToggle({ density, onChange }: DensityToggleProps) {
  const t = useTranslations('AssetsPage')
  const reducedMotion = useReducedMotion()
  const labels: Record<AssetGridDensity, string> = {
    s: t('densitySmall'),
    m: t('densityMedium'),
    l: t('densityLarge'),
  }
  return (
    <div className="hidden shrink-0 items-center gap-2 sm:inline-flex">
      <span className="hidden text-2xs font-medium uppercase tracking-wide text-muted-foreground/70 xl:inline">
        {t('densityLabel')}
      </span>
      <ToggleGroup
        type="single"
        value={density}
        onValueChange={(value) => {
          if (isDensity(value)) onChange(value)
        }}
        className="rounded-xl border border-border/60 bg-muted/60 p-0.5"
        aria-label={t('densityLabel')}
      >
        {ASSET_GRID_DENSITIES.map((d) => (
          <ToggleGroupItem
            key={d}
            value={d}
            aria-label={labels[d]}
            title={labels[d]}
            className="relative h-8 w-10 rounded-lg px-0 text-sm font-medium uppercase text-muted-foreground transition-colors duration-(--duration-base) ease-standard data-[state=on]:bg-transparent data-[state=on]:text-background"
          >
            {density === d && (
              <motion.span
                layoutId="asset-density-indicator"
                className="absolute inset-0 rounded-lg bg-foreground shadow-sm"
                transition={motionTransition('base', reducedMotion)}
              />
            )}
            <span className="relative z-10">{d}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

function EmptyState() {
  const t = useTranslations('AssetsPage')
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-muted/40 text-muted-foreground">
        <ImageIcon className="size-6" />
      </div>
      <h2 className="text-xl font-medium">{t('emptyTitle')}</h2>
      <p className="text-sm text-muted-foreground">{t('emptyDescription')}</p>
      <Link
        href={ROUTES.STUDIO_IMAGE}
        className="mt-2 inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
      >
        {t('emptyAction')}
      </Link>
    </div>
  )
}
