'use client'

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  CheckCircle2,
  Folder,
  MoreHorizontal,
  Pin,
  Search,
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

import { AssetAddToFolderPanel } from '@/features/assets/components/AssetAddToFolderPanel'
import { AssetFolderMenu } from '@/features/assets/components/AssetFolderMenu'
import { AssetMobileActionBar } from '@/features/assets/components/AssetMobileActionBar'
import {
  AssetSelectionMorph,
  SelectionArmButton,
  SelectionLink,
} from '@/features/assets/components/AssetSelectionMorph'
import {
  AssetFolderSidebar,
  type AssetFolderScope,
} from '@/features/assets/components/AssetFolderSidebar'
import { AssetTile } from '@/features/assets/components/AssetTile'
import {
  AssetEmptyFolder,
  AssetEmptyLibrary,
  AssetEmptySearch,
} from '@/features/assets/components/AssetStateBlocks'
import { FeedTail } from '@/components/business/FeedTail'
import { PageLoadError } from '@/components/business/PageLoadError'
import { revealStep, useRevealBatchStart } from '@/components/ui/load-reveal'
import { Skeleton } from '@/components/ui/skeleton'
import { DropOverlay } from '@/components/ui/drop-overlay'
import { useSlowLoadingNotice } from '@/hooks/use-slow-loading-notice'
import { AssetUploadQueuePanel } from '@/features/assets/components/AssetUploadQueuePanel'
import { AssetUploadTile } from '@/features/assets/components/AssetUploadTile'
import { AssetViewer } from '@/features/assets/components/AssetViewer'
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
import { Button, buttonVariants } from '@/components/ui/button'
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
import { Switch } from '@/components/ui/switch'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  LIBRARY_YIELD_CLASS,
  LIBRARY_YIELD_HIDDEN_CLASS,
  LibraryNewTile,
  LibraryPillSelect,
  LibraryScopeMenuTrailing,
  LibraryScopeSelect,
  LibraryToolbar,
} from '@/components/ui/library-kit'
import { MediaTileMoreTrigger } from '@/components/ui/media-tile'
import { useHandToAssistant } from '@/features/assistant/hooks'
import { useAssetFolders } from '@/features/assets/hooks/use-asset-folders'
import { useAssistantSpeechScope } from '@/features/assets/hooks/use-assistant-speech-scope'
import { useGallery, type GalleryFilters } from '@/hooks/use-gallery'
import { useLocalPreference } from '@/hooks/use-local-preference'
import { useIsMobile } from '@/hooks/use-mobile'
import { usePinchStep } from '@/hooks/use-pinch-step'
import { useTouchLongPress } from '@/hooks/use-touch-long-press'
import { useHideMobileTabBar } from '@/hooks/use-mobile-tabbar-hidden'
import {
  useAssetUploadQueue,
  type UploadQueueItem,
  type UploadResult,
} from '@/features/assets/hooks/use-asset-upload-queue'
import {
  useAssetGridViewport,
  useJustifiedGrid,
} from '@/hooks/use-justified-grid'
import { useStableDragState } from '@/hooks/use-stable-drag-state'
import {
  useLibraryChanged,
  useLibraryShowRequest,
  useReportLibraryItem,
  useReportLibraryScreen,
} from '@/hooks/use-library-view'
import { studioLibraryPath } from '@/constants/studio-shell'
import { PROJECT } from '@/constants/config'
import {
  DURATION_MS,
  LIQUID_SPRING,
  motionTransition,
} from '@/constants/motion'
import { ASSET_DND_MIME } from '@/constants/asset-dnd'
import { LIBRARY_GRID } from '@/constants/library-grid'
import { getAudioPreviewCandidates } from '@/features/assets/audio-preview'
import {
  ASSET_BROWSER_PAGE_SIZE,
  ASSET_FOLDER_RAIL_GAP,
  ASSET_FOLDER_RAIL_WIDTH,
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
import { useRouter } from '@/i18n/navigation'
import {
  batchDeleteGenerationsAPI,
  batchSetLikeAPI,
  fetchGenerationByIdAPI,
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
import { buildGenerationTag } from '@/lib/generation-name'
import {
  generationScreenAbout,
  screenItemProps,
} from '@/lib/assistant-screen-scan'
import { getGenerationThumbnailUrl } from '@/lib/generation-media'
import { getApiErrorMessage } from '@/lib/api-error-message'
import { prepareImageUpload } from '@/lib/prepare-image-upload'
import { runUndoableAction } from '@/lib/undoable-action'
import { clearGalleryCache } from '@/lib/gallery-cache'
import {
  flattenFolderTree,
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
import {
  GALLERY_SORT_OPTIONS,
  type AssetSectionCounts,
  type GenerationRecord,
  type OutputTypeValue,
  type ProjectRecord,
} from '@/types'
import { ASSISTANT_LIBRARY_SCREEN_LIMIT } from '@/types/assistant-operator'
import { useErrorText } from '@/hooks/use-error-text'

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

function isDensity(value: string | null): value is AssetGridDensity {
  return (ASSET_GRID_DENSITIES as readonly string[]).includes(value ?? '')
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
  const errText = useErrorText()
  const router = useRouter()
  const reducedMotion = useReducedMotion()
  const toolbarRef = useRef<HTMLDivElement>(null)
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
    setFilters: setGalleryFilters,
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

  // 「含助手朗读」（11-19）：⭐ 下面所有改筛选的地方都经这个 `setFilters`（它按「开关 ×
  // 是否只看音频」带上 `includeAssistantSpeech`），⛔ 直接调 `setGalleryFilters`。
  const {
    setFilters,
    audioOnly,
    includeAssistantSpeech,
    speechPrefOn,
    setSpeechPrefOn,
  } = useAssistantSpeechScope(filters, setGalleryFilters)

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
  /** 生效的类型口径 = 类型分面本身（空 = 不限）。 */
  const scopedTypes: LockedMediaType[] = filters.types

  // Aggregate sidebar counts. One request per page load instead of one
  // per item — and the All count stays stable as the user filters down.
  const [counts, setCounts] = useState<AssetSectionCounts | null>(null)
  /**
   * 分组药丸上的数（全部 / 收藏 / 未归档 / 各文件夹）：⛔ 跟类型切换条、「含助手朗读」走 ——
   * 切换条一动就变的数不许写在分组上。类型不限、不含朗读时与 `counts` 同一份，省一次请求。
   */
  const [scopeCounts, setScopeCounts] = useState<AssetSectionCounts | null>(
    null,
  )
  const scopeNarrowed = scopedTypes.length > 0 || includeAssistantSpeech
  const loadCounts = useCallback(
    () =>
      Promise.all([
        fetchAssetSectionCounts(scopedTypes, { includeAssistantSpeech }),
        scopeNarrowed ? fetchAssetSectionCounts() : null,
      ]),
    [scopedTypes, includeAssistantSpeech, scopeNarrowed],
  )
  const refreshCounts = useCallback(async () => {
    // Scope counts to the active type facet so the badges match the grid.
    // Changing the facet re-runs this via the effect below.
    // 计数和网格同一口径：「含助手朗读」开着才把助手念的回复数进去。
    const [response, whole] = await loadCounts()
    if (response.success) setCounts(response.data)
    const wholeResponse = whole ?? response
    if (wholeResponse.success) setScopeCounts(wholeResponse.data)
  }, [loadCounts])
  useEffect(() => {
    // ⚠ setState 必须待在 async 闭包里（await 之后），否则就是「effect 里同步
    // setState」；顺带加了取消位 —— 快速切分面时旧响应不该盖掉新计数。
    let cancelled = false
    void (async () => {
      const [response, whole] = await loadCounts()
      if (cancelled) return
      if (response.success) setCounts(response.data)
      const wholeResponse = whole ?? response
      if (wholeResponse.success) setScopeCounts(wholeResponse.data)
    })()
    return () => {
      cancelled = true
    }
  }, [loadCounts])

  // Detail sheet — only used outside picker mode. In picker mode the
  // tile click resolves the asset picker via onSelect, so a detail
  // sheet would steal the click target.
  const [selectedGeneration, setSelectedGeneration] =
    useState<GenerationRecord | null>(initialSelectedGeneration)
  // 助手认得出「这张」（库开着时报给它，`use-library-view`）；没号的图报不了。
  const selectedTag = selectedGeneration
    ? buildGenerationTag(selectedGeneration)
    : undefined
  useReportLibraryItem(
    selectedTag ? { kind: 'picture', name: selectedTag } : null,
  )
  const imageGenerations = useMemo(
    () => generations.filter((generation) => generation.outputType === 'IMAGE'),
    [generations],
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
  }
  // 桌面 / 平板点开是就地查看器；手机是同一个查看器的整屏形态（左右滑、往下拉关、
  // 配方在底部上滑，owner 2026-10-14）。
  const isPhone = useIsMobile()
  const handToAssistant = useHandToAssistant()
  // 手机往下滚：筛选那一行收起，只留第一行；往上滚再出来（v10）。
  const [facetsHidden, setFacetsHidden] = useState(false)
  const lastScrollTopRef = useRef(0)
  const facetsCollapsed = isPhone && facetsHidden
  // 往下滑时底栏跟着收起（与分段条同一个判据），往上滑回来。
  useHideMobileTabBar(facetsCollapsed)
  // 换了夹或筛选 = 查看器关上再换范围（pages/assets.md §3「详情」）。
  const [viewerFilters, setViewerFilters] = useState(filters)
  if (viewerFilters !== filters) {
    setViewerFilters(filters)
    setSelectedGeneration(null)
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
  // One AlertDialog handles every confirm flow (bulk publish, favorite,
  // folder delete) and replaces the native window.confirm() pop-up. Bulk
  // delete has no dialog: tap twice to confirm, then 5s undo.
  type ConfirmAction =
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
  // 触屏长按一张 = 进多选并选上它；已在多选里就是勾 / 取消（v10，像系统相册）。
  const tileLongPress = useTouchLongPress<string>((id) => {
    if (selectionMode) toggleSelection(id)
    else enterSelectionWith(id)
  })
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
          toast.error(errText.api(result, t('bulkDeleteFailed')))
        } catch {
          toast.error(t('bulkDeleteFailed'))
        }
        restore()
      },
    })
  }, [
    errText,
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
        toast.error(errText.api(result, t('bulkPublishFailed')))
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
            // 站在库里就去库里的画廊（台不卸载）；`/gallery` 留给访客与外链。
            onClick: () => router.push(studioLibraryPath('gallery')),
          },
        })
      }
      exitSelectionMode()
    } finally {
      setIsBulkPublishing(false)
    }
  }, [
    errText,
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
        toast.error(errText.api(result, t('bulkFavoriteFailed')))
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
  }, [
    errText,
    selectedIds,
    t,
    updateGeneration,
    refreshCounts,
    exitSelectionMode,
  ])

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
        toast.error(errText.api(response, t('addToFolderFailed')))
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
      errText,
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
        setScopeCounts((previous) =>
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

  // 手机没有密度键：双指捏合换档（张开变大、捏拢变小），捏的时候正中露出档位。
  const [isPinching, setIsPinching] = useState(false)

  // ── 文件夹（文件夹 B：左边一列）───────────────────────────────
  // ⚠ 文件夹范围与收藏 / 发布 / 类型等筛选**叠加**（page §2「可叠加维度」）：
  //   换夹只改 `projectId`，其余筛选原样留着。地址栏跟着走，后退可用、刷新不丢。
  /**
   * 文件夹栏 = 素材库的左栏（库里只剩它有左栏）：分组药丸菜单末尾「管理文件夹…」开合，默认收着。
   */
  const [railOpen, setRailOpen] = useState(false)
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
    (scope: AssetFolderScope, extra?: Partial<GalleryFilters>) => {
      const projectId = folderScopeParam(scope)
      setFilters({ ...filters, ...extra, projectId })
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
  const railX = useTransform(railProgress, (p) => (p - 1) * railReserve)
  const riverX = useTransform(
    [railProgress, railLayoutLeft],
    ([p, left]: number[]) => p * railReserve - left,
  )

  /** 把文件夹拿出来：桌面上展开左栏，窄屏拉出左边抽屉。 */
  const revealFolders = useCallback(() => {
    if (window.matchMedia('(min-width: 768px)').matches) setRailOpen(true)
    else setIsFolderDrawerOpen(true)
  }, [])

  // 后退/前进：从地址栏读回范围，⛔ 不再 push（否则历史会自乘）。
  useEffect(() => {
    const handlePopState = () => {
      const projectId =
        new URLSearchParams(window.location.search).get('projectId') ?? ''
      // 返回手势关大图 / 抽屉（`useBackToClose`）也走 popstate，地址没变 = 不是换范围。
      if ((filtersRef.current.projectId ?? '') === projectId) return
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
          error: errText.thrown(error, t('uploadFailed')),
        }
      }
    },
    [errText, t, tErrors],
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
    // 段头 ⋯「新建子文件夹」：同栏里一样当场建「未命名文件夹」，栏打开（窄屏拉出抽屉）、那一行改名。
    onCreateChild: () => {
      revealFolders()
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
  // 库整页（桌面）第一格是虚线「上传」（ui-spec §9「库」）；手机上传在顶上胶囊里。
  const showUploadCell = !isPhone
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
  // 桌面 = 库骨架的等宽格（一行最多 8 张、3:4）；手机照旧 justified 真实比例。
  const gridGap = isPhone ? ASSET_GRID_GAP : LIBRARY_GRID.gap
  const { containerRef: gridContainerRef, rows: gridRows } = useJustifiedGrid({
    aspectRatios: gridAspectRatios,
    targetRowHeight,
    gap: gridGap,
    uniform: isPhone
      ? undefined
      : {
          minTileWidth: LIBRARY_GRID.minTileWidth,
          maxColumns: LIBRARY_GRID.maxColumns,
          aspectRatio: LIBRARY_GRID.aspectRatio,
        },
    // 外壳里叫出 / 收起助手会挤窄放宽整页（11-18）：宽度变化那一次整页格子重渲走 transition，⛔ 卡住页面。
    deferResize: true,
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

  usePinchStep(scrollElementRef, {
    enabled: isPhone,
    onStep: (direction) => {
      const index = ASSET_GRID_DENSITIES.indexOf(density) + direction
      const next = ASSET_GRID_DENSITIES[index]
      if (next) changeDensity(next)
    },
    onActiveChange: setIsPinching,
  })

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

  /**
   * 行高一变就让窗口化整体重算每行的起点（2026-11-17 生产实测：首屏下一行盖住上一行，过一会儿
   * 才归位）。⚠ `@tanstack/virtual-core` 的测量缓存只认 count / gap / scrollMargin / getItemKey /
   * lanes 这些选项，**不认 `estimateSize`**：容器宽度量到、骨架换真数据、密度 / 手机档切换让行高变了
   * 但行数没变时，每行的 `start` 还是旧高度排出来的，于是行与行叠在一起。
   * ⭐ 行高变了就换一个 `getItemKey`（键照旧是行号）：同一次渲染里就按新行高重排。
   * ⛔ 改回 layout effect 里 `rowVirtualizer.measure()` —— 那是提交期里再同步整页重渲一遍
   *（11-18 真机：外壳里叫出 / 收起助手，宽度一变就多出 ~160ms 的长任务）。
   */
  const gridRowHeightsKey = gridRows.map((row) => row.height).join(',')
  const getGridRowKey = useCallback(
    (index: number) => index,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 故意按行高换引用，见上
    [gridRowHeightsKey],
  )
  const rowVirtualizer = useVirtualizer({
    count: gridRows.length,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: (index) => gridRows[index]?.height ?? 0,
    getItemKey: getGridRowKey,
    gap: ASSET_GRID_GAP,
    overscan: ASSET_GRID_ROW_OVERSCAN,
    scrollMargin: gridOffsetTop,
  })

  // Per-section counts — fall back to live `total` only for the bucket the
  // user is currently viewing so the sidebar still moves on add/delete
  // before the next refreshCounts() lands.
  const favoritesCount =
    counts?.favorites ?? (filters.liked ? total : undefined)
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

  /** 手机抽屉里「收藏」是一行范围（iOS 稿）。 */
  const phoneFavoritesScope = folderScope.kind === 'all' && filters.liked

  /**
   * 手机搜索（iOS 稿）：点胶囊上的放大镜，整条胶囊换成搜索框；打字停 300ms
   * 才写进筛选（名字或提示词），「取消」清掉搜索词并收回。`null` = 没在搜。
   */
  const [phoneSearch, setPhoneSearch] = useState<string | null>(null)
  useEffect(() => {
    if (phoneSearch === null) return
    const next = phoneSearch.trim()
    if (next === filters.search) return
    const timer = window.setTimeout(
      () => setFilters({ ...filters, search: next }),
      PHONE_SEARCH_DEBOUNCE_MS,
    )
    return () => window.clearTimeout(timer)
  }, [phoneSearch, filters, setFilters])
  const closePhoneSearch = useCallback(() => {
    setPhoneSearch(null)
    if (filters.search) setFilters({ ...filters, search: '' })
  }, [filters, setFilters])
  /** 桌面顶上的搜索框（库骨架 `LibraryToolbar`，收放它自己管）：同样停 300ms 才写进筛选。 */
  const [deskSearch, setDeskSearch] = useState(filters.search)
  useEffect(() => {
    const next = deskSearch.trim()
    if (isPhone || next === filters.search) return
    const timer = window.setTimeout(
      () => setFilters({ ...filters, search: next }),
      PHONE_SEARCH_DEBOUNCE_MS,
    )
    return () => window.clearTimeout(timer)
  }, [deskSearch, filters, isPhone, setFilters])

  // 屏上那一页（owner 10-28）：哪个夹、哪些筛选、搜了什么、屏上前几张、多选了哪几张。
  const screenTags = (list: readonly GenerationRecord[]) =>
    list.flatMap((generation) => buildGenerationTag(generation) ?? [])
  useReportLibraryScreen({
    kind: 'picture',
    scope: [
      folderScope.kind === 'unassigned'
        ? 'pictures in no folder'
        : scopeFolder
          ? `folder 「${scopeFolder.name}」`
          : 'all their assets',
      filters.types.length ? `type ${filters.types.join('/')}` : '',
      filters.liked ? 'favorites only' : '',
      filters.published ? 'published only' : '',
      filters.provider === USER_UPLOAD_PROVIDER ? 'uploads only' : '',
      filters.models.length ? `models ${filters.models.join(', ')}` : '',
      filters.timeRange === 'all' ? '' : `time ${filters.timeRange}`,
    ]
      .filter(Boolean)
      .join(' · '),
    ...(filters.search ? { search: filters.search } : {}),
    total,
    visible: screenTags(generations).slice(0, ASSISTANT_LIBRARY_SCREEN_LIMIT),
    ...(selectedIds.size
      ? {
          selected: screenTags(
            generations.filter((generation) => selectedIds.has(generation.id)),
          ).slice(0, ASSISTANT_LIBRARY_SCREEN_LIMIT),
        }
      : {}),
  })
  // 助手改了素材（标签 / 收藏 / 建夹 / 放进夹，或撤销）：格子、夹、计数重读。
  useLibraryChanged('assets', () => {
    retryGallery()
    void refreshFolders()
    void refreshCounts()
  })
  // 助手翻给你看：打开那一张（⭐ 打开优先，不动筛选，免得一换筛选查看器就关上），或搜那个词。
  useLibraryShowRequest('assets', (show) => {
    if (show.itemId) {
      const id = show.itemId
      const loaded = generations.find((generation) => generation.id === id)
      if (loaded) {
        setSelectedGeneration(loaded)
        return
      }
      void fetchGenerationByIdAPI(id).then((response) => {
        if (response.success) setSelectedGeneration(response.data)
      })
      return
    }
    if (show.search === undefined) return
    setDeskSearch(show.search)
    setPhoneSearch(null)
    setFilters({ ...filters, search: show.search })
  })
  /** 桌面那条切换条：全部 · 图片 · 视频 · 音频 · 3D（一段 = 一个类型）。 */
  const deskTypeTab: DeskTypeTab =
    filters.types.length === 1
      ? (DESK_TYPE_TABS.find((tab) => tab.types[0] === filters.types[0])?.id ??
        'all')
      : 'all'
  /** 类型切换条（全部 · 图片 · 视频 · 音频 · 3D）：桌面在工具行里，手机是第二行，同一条。 */
  const typeSegmented = (
    <LiquidSegmented
      ariaLabel={t('phone.typeTabs')}
      value={deskTypeTab}
      items={DESK_TYPE_TABS.map((tab) => ({
        value: tab.id,
        label:
          tab.id === 'all'
            ? t('sidebarAll')
            : tab.id === 'image'
              ? t('sidebarImages')
              : tab.id === 'video'
                ? t('sidebarVideos')
                : tab.id === 'audio'
                  ? t('sidebarAudio')
                  : t('sidebarModel3D'),
      }))}
      onChange={(id) => {
        const tab = DESK_TYPE_TABS.find((item) => item.id === id)
        if (tab) setFilters({ ...filters, types: [...tab.types] })
      }}
    />
  )

  /** 「音频」分段里的「含助手朗读」开关（默认关；整行能点）。手机、桌面各挂一处。 */
  const speechSwitchId = useId()
  const renderSpeechToggle = (variant: 'desk' | 'phone') => (
    <div
      data-testid={`assets-assistant-speech-${variant}`}
      className="flex shrink-0 items-center gap-2"
    >
      <label
        htmlFor={`${speechSwitchId}-${variant}`}
        className="cursor-pointer text-xs text-muted-foreground"
      >
        {t('assistantSpeech.toggle')}
      </label>
      <Switch
        id={`${speechSwitchId}-${variant}`}
        checked={speechPrefOn}
        onCheckedChange={setSpeechPrefOn}
      />
    </div>
  )

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
      <span className="flex items-center gap-1.5 pr-1 text-2sm">
        {t('selectedPrefix')}
        <RollingNumber
          value={selectedIds.size}
          className="font-mono text-2sm font-semibold"
        />
      </span>
      <span
        className={cn(
          'ml-2 text-2xs text-muted-foreground transition-[opacity,filter] duration-fast ease-standard motion-reduce:transition-none',
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
        className="ml-1 inline-flex h-8 items-center rounded-full bg-foreground px-3.5 text-2sm font-semibold text-background transition-opacity duration-fast hover:opacity-90"
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

  /**
   * 桌面的分组药丸（ui-spec §9「库」）：全部素材 · 收藏 · 未归档，下面一组「文件夹」（选中 = 筛到
   * 那个夹，药丸上写夹名），组末「管理文件夹…」开合左栏的文件夹树（拖放在那边）。
   */
  const folderEntries = useMemo(() => flattenFolderTree(folders), [folders])
  const deskScopeValue: 'all' | 'favorites' | 'unassigned' | null =
    folderScope.kind === 'unassigned'
      ? 'unassigned'
      : folderScope.kind === 'folder'
        ? null
        : filters.liked
          ? 'favorites'
          : 'all'
  const deskScopeSelect = (
    <LibraryScopeSelect
      label={t('scopeTabsLabel')}
      value={deskScopeValue}
      items={[
        { value: 'all', label: t('sectionAllAssets'), meta: scopeCounts?.all },
        {
          value: 'favorites',
          label: t('sidebarFavorites'),
          meta: scopeCounts?.favorites,
        },
        {
          value: 'unassigned',
          label: t('sidebarUnassigned'),
          meta: scopeCounts?.unassigned,
        },
      ]}
      current={
        folderScope.kind === 'folder' && scopeFolder
          ? {
              label: scopeFolder.name,
              meta: scopeCounts?.byProject?.[scopeFolder.id],
            }
          : undefined
      }
      onChange={(scope) =>
        scope === 'favorites'
          ? openScope({ kind: 'all' }, { liked: true })
          : openScope({ kind: scope }, { liked: false })
      }
    >
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-2xs font-semibold text-muted-foreground">
        {t('sidebarFolders')}
      </DropdownMenuLabel>
      {folderEntries.length > 0 ? (
        <div className="max-h-80 overflow-y-auto">
          {folderEntries.map(({ folder, depth }) => (
            <DropdownMenuItem
              key={folder.id}
              onSelect={() =>
                openScope({ kind: 'folder', id: folder.id }, { liked: false })
              }
            >
              <span
                className="flex min-w-0 items-center gap-2"
                style={{ paddingLeft: depth * 12 }}
              >
                <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{folder.name}</span>
              </span>
              <LibraryScopeMenuTrailing
                meta={scopeCounts?.byProject?.[folder.id]}
                checked={
                  folderScope.kind === 'folder' && folderScope.id === folder.id
                }
              />
            </DropdownMenuItem>
          ))}
        </div>
      ) : null}
      <DropdownMenuItem
        data-testid="assets-manage-folders"
        onSelect={revealFolders}
      >
        {t('manageFolders')}
      </DropdownMenuItem>
    </LibraryScopeSelect>
  )

  /** 手机搜索（iOS 稿）：圆键点开，第一行整行换成搜索框 +「取消」；只有「取消」/ Esc 才收（清掉搜索词）。 */
  const phoneSearchField = (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full bg-muted px-3 coarse:h-11">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={phoneSearch ?? ''}
          onChange={(event) => setPhoneSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') closePhoneSearch()
          }}
          enterKeyHint="search"
          placeholder={t('phone.searchPlaceholder')}
          aria-label={t('phone.search')}
          data-testid="assets-phone-search-input"
          className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/80"
        />
      </label>
      <button
        type="button"
        onClick={closePhoneSearch}
        className="h-9 shrink-0 rounded-full px-3 text-2sm text-foreground transition-colors duration-fast ease-standard active:bg-muted coarse:h-11"
      >
        {t('phone.searchCancel')}
      </button>
    </div>
  )

  /**
   * 顶上那一行 = 库骨架 `LibraryToolbar`（ui-spec §9「库」）：分组药丸 · 类型切换条 ……… 搜索 · 排序 · 选择。
   * 桌面在大河那一栏上面；手机两行：分组药丸 ……… 搜索圆键 · 上传 · 选择 / 类型切换条。
   * 多选：桌面「选择」键往左拉长成选择条（`AssetSelectionMorph`，盖在整行上），底下几样先糊掉；
   * 手机分组药丸糊掉、同一位置写「已选 N」，上传换成「全选」，「选择」写「完成」。
   */
  const toolbar = (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: -6, scale: 0.995 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={motionTransition('slow', reducedMotion)}
      ref={toolbarRef}
      className="relative z-30 w-full shrink-0"
    >
      {/* 标题与总数：库顶上那一排已经写着「素材」，⛔ 再写一遍（ui-spec §9 ⛔ 副标题）。 */}
      <h1 className="sr-only">{t('title')}</h1>
      <LibraryToolbar
        scope={
          <div className="relative flex min-w-0 items-center">
            {/* 手机多选：分组药丸糊掉，同一位置写「已选 N」（PC 是「选择」键拉长成的条）。 */}
            {isPhone ? (
              <span
                aria-hidden={!selectionMode}
                className={cn(
                  'pointer-events-none absolute inset-y-0 left-0 flex items-center gap-1.5 whitespace-nowrap pl-1 text-sm font-medium text-foreground',
                  LIBRARY_YIELD_CLASS,
                  !selectionMode && LIBRARY_YIELD_HIDDEN_CLASS,
                )}
              >
                {t('selectedPrefix')}
                <RollingNumber
                  value={selectedIds.size}
                  className="font-mono text-sm"
                />
              </span>
            ) : null}
            <div
              inert={selectionMode}
              className={cn(
                'flex min-w-0',
                LIBRARY_YIELD_CLASS,
                selectionMode && LIBRARY_YIELD_HIDDEN_CLASS,
              )}
            >
              {deskScopeSelect}
            </div>
          </div>
        }
        segments={
          // 桌面多选时让位给选择条；手机第二行照常可点。「音频」那一档桌面多一颗助手朗读开关（手机在下面一行）。
          <div
            inert={selectionMode && !isPhone}
            className={cn(
              'flex items-center gap-2',
              LIBRARY_YIELD_CLASS,
              selectionMode && !isPhone && LIBRARY_YIELD_HIDDEN_CLASS,
            )}
          >
            {typeSegmented}
            {audioOnly && !isPhone ? renderSpeechToggle('desk') : null}
          </div>
        }
        search={
          isPhone
            ? phoneSearchField
            : {
                value: deskSearch,
                onChange: setDeskSearch,
                placeholder: t('phone.searchPlaceholder'),
                label: t('phone.search'),
              }
        }
        searchLabel={t('phone.search')}
        {...(isPhone
          ? {
              searchOpen: phoneSearch !== null,
              // 圆键点开才听；失焦 / 框空时的 Esc ⛔ 收（只有「取消」/ Esc 自己收，见上）。
              onSearchOpenChange: (open: boolean) => {
                if (open) setPhoneSearch(filters.search)
              },
            }
          : {})}
        searchYield={selectionMode}
        end={
          <>
            {/* 传着时还能再点：新选的文件并进这一轮（分母跟着变大）。手机才有（桌面上传在格子第一格）。 */}
            <FeedbackButton
              feedback={uploadButtonFeedback}
              onClick={handleUploadClick}
              inert={selectionMode}
              className={cn(
                buttonVariants({ size: 'sm' }),
                TOOLBAR_BUTTON_CLASS,
                'coarse:h-11 md:hidden',
                // 手机：一颗 36 圆键（同搜索圆键，库骨架），字给读屏。触屏上整颗就是 44 方：它自带
                // overflow-hidden（回执字的伸缩），`.touch-target` 的外扩会被自己裁掉。
                'max-md:size-9 max-md:coarse:size-11 max-md:bg-muted max-md:px-0 max-md:text-ink-2 max-md:shadow-none max-md:hover:tint-hover max-md:has-[>svg]:px-0',
                LIBRARY_YIELD_CLASS,
                selectionMode &&
                  cn(LIBRARY_YIELD_HIDDEN_CLASS, 'max-md:hidden'),
              )}
            >
              <UploadCloud className="size-3.5 max-md:size-4" aria-hidden />
              <span className="max-md:sr-only">{t('uploadButton')}</span>
            </FeedbackButton>
            {/* 手机多选：上传让位，同一处出「全选」。 */}
            {selectionMode ? (
              <button
                type="button"
                onClick={selectAllVisible}
                className="-ml-2 inline-flex h-8 items-center rounded-full px-2.5 text-sm text-muted-foreground transition-colors duration-fast ease-standard active:bg-muted coarse:h-11 md:hidden"
              >
                {t('selectAll')}
              </button>
            ) : null}
            <span
              inert={selectionMode}
              className={cn(
                'max-md:hidden',
                LIBRARY_YIELD_CLASS,
                selectionMode && LIBRARY_YIELD_HIDDEN_CLASS,
              )}
            >
              <LibraryPillSelect
                label={t('facetSort')}
                value={filters.sort}
                options={GALLERY_SORT_OPTIONS.map((value) => ({
                  value,
                  label:
                    value === 'newest'
                      ? t('facetSortNewest')
                      : t('facetSortOldest'),
                }))}
                onChange={(sort) => setFilters({ ...filters, sort })}
              />
            </span>
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
                'h-9 border-0 bg-muted hover:bg-muted hover:tint-hover',
                // 手机：「选择」字键，长相同药丸（36 · 浅灰无边，触屏 44），⛔ 勾。
                'max-md:h-9 max-md:border-0 max-md:bg-muted max-md:px-3 max-md:text-2sm max-md:font-normal max-md:coarse:h-11',
                selectionMode && 'bg-muted hover:bg-muted md:invisible',
              )}
            >
              {selectionMode ? (
                isPhone ? (
                  t('selectDone')
                ) : (
                  <>
                    <X className="size-3.5" />
                    {t('selectExit')}
                  </>
                )
              ) : (
                <>
                  <CheckCircle2 className="size-3.5 max-md:hidden" />
                  {t('selectMode')}
                </>
              )}
            </Button>
          </>
        }
      />

      {/* 「选择」键往左拉长成的选择条（≥768，从行首铺到「选择」键）；窄屏仍是底部浮条。 */}
      <div className="hidden md:contents">
        <AssetSelectionMorph
          open={selectionMode}
          containerRef={toolbarRef}
          startRef={toolbarRef}
          buttonRef={selectButtonRef}
        >
          {selectionBarContent}
        </AssetSelectionMorph>
      </div>
    </motion.div>
  )

  return (
    <div
      className={cn(
        // 整页白底（ui-spec §1，owner 2026-11-05「⛔ 板里再垫暖灰底」）：手机也和画廊 /
        // 角色 / 音色 / 提示词同一张白底，⛔ 留着工作台灰（那是 09-20 推灰时的残留）。
        'flex h-page flex-col bg-background',
        // 手机：图一直铺到屏幕底，从浮起的底栏后面滑过去（owner 2026-10-17）。
        'max-md:h-page-behind-tabbar',
        className,
      )}
      onDragEnter={handleRootDragEnter}
      onDragOver={handleRootDragOver}
      onDragLeave={handleRootDragLeave}
      onDrop={handleRootDrop}
    >
      {/* 左右边距同其余库（手机 16 / 桌面 22）。右边少 10：大河的滚动条槽（`assets-scroll-gutter`）
          占掉那 10，格子右缘才落在 22；工具行垫同一条槽（见下），两边一起对齐。 */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pt-4 md:pr-3 md:pl-5.5">
        {/* ─── 顶栏（默认单行）────────────────────────────────────
            page §3：`素材 + 总数` · 分面筛选 · ——弹性—— · 上传 · 选择 · 密度。
            文件夹 B：跨在栏和大河上面；栏收起（或窄屏）时标题旁多一颗范围胶囊，
            写着当前范围，点它把栏拿回来。 */}
        {/* 手机：工具行两行（第二行类型切换条，`LibraryToolbar` 自己折）。 */}
        {isPhone ? toolbar : null}
        {audioOnly ? (
          <div className="-mt-1 flex justify-end md:hidden">
            {renderSpeechToggle('phone')}
          </div>
        ) : null}

        {/* 桌面四周让出 4 再抵回：栏收放要裁，但工具行的焦点环（越出 4）不能被一起裁掉。 */}
        <div className="flex min-h-0 flex-1 overflow-hidden md:-m-1 md:p-1">
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
                layout="library"
                onScopeChange={(scope) => openScope(scope, { liked: false })}
                onCollapse={() => setRailOpen(false)}
                className="h-full"
              />
            </motion.div>
          </div>

          {/* ─── 大河 ────────────────────────────────────────────────
              `assets-scroll-gutter`：滚动条一出现容器就缩水，会把按旧宽度排好
              的 justified 行挤成横向溢出（page §5.7）。 */}
          {/* 大河那一列：滚动容器 + 盖在它上面的就地查看器，跟着栏的收放一起走。 */}
          <motion.div
            style={{ x: riverX }}
            className="relative flex min-w-0 flex-1 flex-col"
          >
            {/* 拖图上传（原型 T）：大河那一列上一圈虚线框接住，弹簧轻过冲进场。 */}
            <DropOverlay
              active={isFileDragging}
              label={t('uploadDropHint', { folder: uploadTargetLabel })}
              className="bottom-4 rounded-16"
            />
            {/* 捏合时正中露出「小 · 中 · 大」，松手后停一会儿再糊掉。 */}
            {isPhone ? (
              <div
                aria-hidden
                className={cn(
                  'pointer-events-none absolute left-1/2 top-24 z-30 flex -translate-x-1/2 gap-0.5 rounded-full border border-border bg-background p-1 shadow-pop',
                  'transition-[opacity,filter] duration-fast ease-standard motion-reduce:transition-none',
                  isPinching ? 'opacity-100' : 'opacity-0 blur-xs delay-500',
                )}
              >
                {ASSET_GRID_DENSITIES.map((step) => (
                  <span
                    key={step}
                    className={cn(
                      'grid h-6.5 w-8.5 place-items-center rounded-full text-xs text-muted-foreground transition-colors duration-fast ease-standard',
                      step === density && 'bg-foreground text-background',
                    )}
                  >
                    {t(
                      step === 's'
                        ? 'densityPinchS'
                        : step === 'm'
                          ? 'densityPinchM'
                          : 'densityPinchL',
                    )}
                  </span>
                ))}
              </div>
            ) : null}
            {/* 垫一条和大河一样的滚动条槽（不滚，只占位），工具行右缘 = 格子右缘；
                上下左右各让 4 再抵回，焦点环不被裁。 */}
            {isPhone ? null : (
              <div className="studio-scrollbar assets-scroll-gutter -mx-1 -mt-1 mb-2 shrink-0 overflow-hidden p-1">
                {toolbar}
              </div>
            )}
            <main
              ref={scrollElementRef}
              // 手机底栏认这个容器：回到这一格时还原滚到哪、再点一下回顶部（`MobileShell`）。
              data-mobile-scroll-root=""
              className={cn(
                'studio-scrollbar assets-scroll-gutter min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-4 max-md:touch-pan-y',
                // 最后一行能滑到底栏上面。
                'max-md:pb-mobile-tabbar',
              )}
              onScroll={(event) => {
                const top = event.currentTarget.scrollTop
                // 单次挪不到 6px 不算换方向（手指抖动）；页顶附近一直展开。
                const delta = top - lastScrollTopRef.current
                if (top < 40) setFacetsHidden(false)
                if (Math.abs(delta) < 6) return
                lastScrollTopRef.current = top
                if (!isPhone) return
                if (delta > 0 && top > 90) setFacetsHidden(true)
                else if (delta < 0) setFacetsHidden(false)
              }}
            >
              {/* ─── 段头：当前范围 + 张数；在夹里时多「在 X 里」与置顶 / ⋯ ─── */}
              {/* 手机：范围名与张数胶囊里已经有了（owner 2026-10-17「删掉不显示」），
                  只在文件夹里留置顶 / ⋯ 那几颗。 */}
              <div
                className={cn(
                  'mb-3 flex min-h-8.5 flex-wrap items-center gap-x-2.5 gap-y-1 px-0.5',
                  // 「全部 / 收藏 / 未归档」左栏已经写着，⛔ 再写一遍；只在夹里留夹名与置顶 / ⋯。
                  !scopeFolder && !isRenamingScope && 'hidden',
                )}
              >
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
                  <h2 className="flex min-w-0 items-baseline gap-1.5 text-md font-semibold text-foreground max-md:hidden">
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
                      variant="secondary"
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
              {galleryError && (
                <PageLoadError
                  title={galleryError}
                  description={t('errorKeepsLoaded')}
                  onRetry={retryGallery}
                  retrying={isLoading}
                  className="mb-3"
                />
              )}
              {isEmpty ? (
                hasActiveFilters ? (
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
                          gap: gridGap,
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
                                className="shrink-0 rounded-12 bg-muted"
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
                              // 与其它库第一格同一颗虚线「新建」（`LibraryNewTile`）；格子宽高由排版算好
                              //（手机按原比例铺），外面这层盒子吃 `boxStyle`，格子撑满它。
                              <div
                                key="upload-cell"
                                style={boxStyle}
                                className="shrink-0"
                              >
                                <LibraryNewTile
                                  label={t('uploadButton')}
                                  icon={
                                    isUploading ? (
                                      <Spinner size="md" />
                                    ) : (
                                      <UploadCloud aria-hidden />
                                    )
                                  }
                                  disabled={isUploading}
                                  onClick={handleUploadClick}
                                  className="aspect-auto h-full"
                                />
                              </div>
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
                            if (tileLongPress.swallow()) return
                            if (selectionMode) {
                              // Shift 点 = 从锚点到这里整段选中（§7.1）。
                              if (event.shiftKey) selectRangeTo(gen.id)
                              else toggleSelection(gen.id)
                              return
                            }
                            setSelectedGeneration(gen)
                          }
                          const handleTileContextMenu = (
                            e: React.MouseEvent<HTMLElement>,
                          ) => {
                            e.preventDefault()
                            if (tileLongPress.swallow()) return
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
                              draggable={!isTouchPrimary()}
                              audioCoverUrl={audioCoverUrl}
                              onAudioCoverError={handleAudioPreviewError}
                              onClick={handleTileClick}
                              onContextMenu={handleTileContextMenu}
                              onDragStart={handleTileDragStart}
                              onToggleFavorite={() =>
                                void toggleTileFavorite(gen.id)
                              }
                              favoritePending={favoritePendingIds.has(gen.id)}
                              onHandToAssistant={
                                handToAssistant && !isPhone
                                  ? () => handToAssistant(gen)
                                  : undefined
                              }
                              more={
                                isPhone ? undefined : (
                                  <DropdownMenu modal={false}>
                                    <DropdownMenuTrigger asChild>
                                      <MediaTileMoreTrigger
                                        label={t('viewer.more')}
                                      />
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start">
                                      <DropdownMenuItem
                                        onSelect={() =>
                                          enterSelectionWith(gen.id)
                                        }
                                      >
                                        {t('selectMode')}
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )
                              }
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
                              {...tileLongPress.bind(gen.id)}
                              {...screenItemProps(
                                'picture',
                                buildGenerationTag(gen),
                                audioCoverUrl ?? getGenerationThumbnailUrl(gen),
                                generationScreenAbout(gen),
                              )}
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
            {!isPhone && selectedGeneration ? (
              <AssetViewer
                generation={selectedGeneration}
                images={imageGenerations}
                onNavigate={setSelectedGeneration}
                onClose={() => setSelectedGeneration(null)}
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
            ) : null}
          </motion.div>
        </div>
      </div>
      {isPhone && selectedGeneration ? (
        <AssetViewer
          phone
          generation={selectedGeneration}
          images={imageGenerations}
          onNavigate={setSelectedGeneration}
          onClose={() => setSelectedGeneration(null)}
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
      ) : null}
      <AssetUploadQueuePanel
        items={uploadQueue.items}
        doneCount={uploadQueue.doneCount}
        errorCount={uploadQueue.errorCount}
        projects={folders}
        targetProjectId={
          uploadQueue.pendingItems[0]?.targetProjectId ?? uploadTargetProjectId
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
      {/* 窄屏（<768）：文件夹栏从左边拉出来，同一列内容（⋯ 常显、不拖动排序）。 */}
      <Sheet open={isFolderDrawerOpen} onOpenChange={setIsFolderDrawerOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="gap-0 px-3 pb-safe-inset-bottom pt-safe-inset-top"
        >
          <SheetTitle className="sr-only">{t('sidebarFolders')}</SheetTitle>
          <SheetDescription className="sr-only">
            {t('folderDrawerDescription')}
          </SheetDescription>
          {/* 整屏高的抽屉：外层让开刘海 / 底部横条，里面再留原来的 16 / 12px。 */}
          <div className="flex min-h-0 flex-1 flex-col pb-3 pt-4">
            <AssetFolderSidebar
              {...sidebarProps}
              touch
              // 手机上「收藏」是抽屉里的一行范围（iOS 稿）：选别的范围就退出收藏。
              onScopeChange={(scope) => openScope(scope, { liked: false })}
              favorites={{
                count: favoritesCount,
                active: phoneFavoritesScope,
                onSelect: () => openScope({ kind: 'all' }, { liked: true }),
              }}
              onCollapse={() => setIsFolderDrawerOpen(false)}
              className="h-full"
            />
          </div>
        </SheetContent>
      </Sheet>
      {/* Off-screen custom drag image for multi-select folder drags. */}
      <div
        ref={dragGhostRef}
        aria-hidden="true"
        style={{ position: 'fixed', left: '-9999px', top: '-9999px' }}
        className="pointer-events-none rounded-lg bg-foreground px-3 py-1.5 text-2xs font-semibold text-background shadow-lg"
      />
      {/* ─── 手机多选：底栏本身换成四格动作（手机稿 v10）──────────── */}
      {/* 选中的全是「先搜再画」出的图：「发布」置灰，原因浮在底栏上沿。 */}
      {isPhone && selectionMode && (
        <div className="pointer-events-none fixed inset-x-0 bottom-mobile-tabbar z-40 flex justify-center px-3 pb-2 md:hidden">
          <SearchGroundingPublishNote
            id="asset-bulk-publish-note"
            show={bulkPublishAllBlocked}
            variant="bulk"
            className="max-w-full"
            noteClassName="pointer-events-auto rounded-lg border border-border/60 bg-background/95 px-3 py-1.5 shadow-lg backdrop-blur-md"
          />
        </div>
      )}
      {isPhone && (
        <AssetMobileActionBar
          open={selectionMode}
          count={selectedIds.size}
          pending={isBulkActionPending}
          favoriting={isBulkFavoriting}
          publishing={isBulkPublishing}
          publishBlocked={bulkPublishAllBlocked}
          publishBlockedNoteId="asset-bulk-publish-note"
          addToFolder={(trigger) => (
            <AssetAddToFolderPanel
              assetIds={Array.from(selectedIds)}
              folders={folders}
              counts={folderCounts.byProject}
              onCreateFolder={(name) => createFolder(name, null)}
              onChanged={handleMembershipsChanged}
              onUndone={handleFolderUndone}
              trigger={trigger}
            />
          )}
          onFavorite={requestBulkFavorite}
          onPublish={requestBulkPublish}
          onDelete={performBulkDelete}
        />
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
                  {confirmAction.kind === 'publish-bulk'
                    ? t('bulkPublish')
                    : confirmAction.kind === 'favorite-bulk'
                      ? t('bulkFavorite')
                      : t('folderDeleteTitle', {
                          name: confirmAction.folder.name,
                        })}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {confirmAction.kind === 'publish-bulk'
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
                    if (action.kind === 'publish-bulk') {
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
      className="h-8 min-w-0 rounded-lg bg-background px-2 text-md font-semibold text-foreground outline-none ring-2 ring-inset ring-foreground"
    />
  )
}

/** 搜索框停手多久才写进筛选（手机 / 桌面同一个）。 */
const PHONE_SEARCH_DEBOUNCE_MS = 300

type DeskTypeTab = 'all' | 'image' | 'video' | 'audio' | 'model3d'

const DESK_TYPE_TABS: readonly {
  id: DeskTypeTab
  types: readonly OutputTypeValue[]
}[] = [
  { id: 'all', types: [] },
  { id: 'image', types: ['image'] },
  { id: 'video', types: ['video'] },
  { id: 'audio', types: ['audio'] },
  { id: 'model3d', types: ['model_3d'] },
]

/** 顶栏右边的字键（手机上传 · 选择）：胶囊，按下轻压一下。 */
const TOOLBAR_BUTTON_CLASS =
  'rounded-full px-3.5 has-[>svg]:px-3 transition-[background-color,transform] duration-fast ease-standard active:scale-[.98] motion-reduce:active:scale-100'
