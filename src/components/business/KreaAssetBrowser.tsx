'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  Folder,
  FolderInput,
  FolderOpen,
  FolderX,
  Globe,
  Heart,
  Image as ImageIcon,
  Lock,
  Mic,
  Plus,
  Box,
  Trash2,
  UploadCloud,
  Video,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import NextImage from 'next/image'
import { toast } from 'sonner'

import { AssetDetailSheet } from '@/components/business/AssetDetailSheet'
import { AssetFolderTree } from '@/components/business/AssetFolderTree'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Spinner } from '@/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ProjectCreateDialog } from '@/components/business/ProjectCreateDialog'
import { useGallery, type GalleryFilters } from '@/hooks/use-gallery'
import { useProjects } from '@/hooks/use-projects'
import { useStableDragState } from '@/hooks/use-stable-drag-state'
import { ROUTES } from '@/constants/routes'
import { ASSET_DND_MIME } from '@/constants/asset-dnd'
import {
  DEFAULT_AUDIO_ASSET_PREVIEW_IMAGE,
  getAudioAssetPreviewImage,
} from '@/constants/asset-previews'
import {
  USER_UPLOAD_ACCEPTED_MIME_TYPES,
  CLIENT_UPLOAD_MAX_BYTES,
  USER_UPLOAD_PROVIDER,
} from '@/constants/uploads'
import { Link } from '@/i18n/navigation'
import {
  batchAssignProjectAPI,
  batchDeleteGenerationsAPI,
  batchSetLikeAPI,
  batchUpdateVisibilityAPI,
  fetchAssetSectionCounts,
  fetchGalleryImages,
} from '@/lib/api-client/gallery'
import { uploadImageFileAPI } from '@/lib/api-client/generation'
import { getApiErrorMessage } from '@/lib/api-error-message'
import { prepareImageUpload } from '@/lib/prepare-image-upload'
import {
  clearGalleryCache,
  makeGalleryCacheKey,
  readGalleryCache,
  writeGalleryCache,
} from '@/lib/gallery-cache'
import { getGenerationThumbnailUrl } from '@/lib/generation-media'
import { cn } from '@/lib/utils'
import { isTouchPrimary } from '@/lib/touch'
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
  /**
   * When provided, thumbnails become buttons that call onSelect instead of
   * links into the gallery — used by AssetSelectorDialog so the Studio Image
   * chip can pick a reference asset without navigating away.
   */
  onSelect?: (generation: GenerationRecord) => void
  /**
   * Picker multi-select mode (independent of the gallery's own bulk-ops
   * selectionMode). When true: tile clicks toggle a selection set, bulk-op
   * action bars (delete/publish/favorite/move) stay hidden, and a dedicated
   * "Add N" confirmation bar appears at the bottom. Used by LoRA training
   * to let users grab multiple assets in one go.
   */
  pickerMultiSelect?: boolean
  /** Confirmation callback for picker multi-select. Receives the full
   *  selected generations in click order. */
  onPickerConfirmMany?: (generations: GenerationRecord[]) => void
  /** Optional hard cap on the picker selection. Toggling beyond this limit
   *  is rejected with a toast. Default: no limit. */
  pickerMaxSelection?: number
  /**
   * Lock the browser to a single media type. The Tools sidebar group is
   * hidden, sections always reset to this type instead of 'all', and
   * initialFilters.type is overridden. Used by ReferenceImageChip so a
   * caller asking for an *image* reference can never receive a video/audio
   * asset (which would be silently dropped downstream by addFromUrl).
   */
  mediaType?: LockedMediaType
  className?: string
}

const DEFAULT_FILTERS: GalleryFilters = {
  search: '',
  model: '',
  sort: 'newest',
  type: 'all',
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

type Density = 'comfortable' | 'normal' | 'compact'
const DENSITIES: readonly Density[] = ['comfortable', 'normal', 'compact']
const DENSITY_STORAGE_KEY = 'pv:assets:density'
const DENSITY_GRID_CLASS: Record<Density, string> = {
  comfortable: 'grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4',
  normal: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6',
  compact: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8',
}
const DENSITY_IMAGE_SIZES: Record<Density, string> = {
  comfortable: '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw',
  normal: '(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw',
  compact: '(max-width: 640px) 33vw, (max-width: 1024px) 16vw, 12vw',
}
const USER_UPLOAD_ACCEPT = USER_UPLOAD_ACCEPTED_MIME_TYPES.join(',')
const DENSITY_XL_COLS: Record<Density, number> = {
  comfortable: 4,
  normal: 6,
  compact: 8,
}

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

function isDensity(value: string | null): value is Density {
  return value === 'comfortable' || value === 'normal' || value === 'compact'
}

function isMediaTypeFilter(
  value: GalleryFilters['type'],
): value is LockedMediaType {
  return (
    value === 'image' ||
    value === 'video' ||
    value === 'audio' ||
    value === 'model_3d'
  )
}

function getActiveMediaType(
  filters: GalleryFilters,
  lockedMediaType?: LockedMediaType,
): LockedMediaType | null {
  if (lockedMediaType) return lockedMediaType
  return isMediaTypeFilter(filters.type) ? filters.type : null
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
  activeMediaType: LockedMediaType | null,
): boolean {
  if (
    activeMediaType &&
    !outputTypeMatchesMediaType(generation.outputType, activeMediaType)
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
  onSelect,
  mediaType,
  pickerMultiSelect = false,
  onPickerConfirmMany,
  pickerMaxSelection,
  className,
}: KreaAssetBrowserProps) {
  const t = useTranslations('AssetsPage')
  const tErrors = useTranslations('Errors')

  const effectiveInitialFilters: GalleryFilters = mediaType
    ? { ...initialFilters, type: mediaType }
    : initialFilters

  const isPickerMode = !!onSelect || pickerMultiSelect
  const {
    generations,
    total,
    isLoading,
    hasMore,
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
  const activeMediaType = getActiveMediaType(filters, mediaType)

  // Aggregate sidebar counts. One request per page load instead of one
  // per item — and the All count stays stable as the user filters down.
  const [counts, setCounts] = useState<AssetSectionCounts | null>(null)
  const refreshCounts = useCallback(async () => {
    // Scope counts to the active type tab so the badges match the grid.
    // Changing the type tab re-runs this via the effect below.
    const response = await fetchAssetSectionCounts(filters.type)
    if (response.success) setCounts(response.data)
  }, [filters.type])
  useEffect(() => {
    void refreshCounts()
  }, [refreshCounts])

  // Detail sheet — only used outside picker mode. In picker mode the
  // tile click resolves the asset picker via onSelect, so a detail
  // sheet would steal the click target.
  const [selectedGeneration, setSelectedGeneration] =
    useState<GenerationRecord | null>(
      isPickerMode ? null : initialSelectedGeneration,
    )
  const [selectedOriginRect, setSelectedOriginRect] = useState<{
    x: number
    y: number
    width: number
    height: number
  } | null>(null)
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
  useEffect(() => {
    if (!isPickerMode) {
      setSelectedGeneration(initialSelectedGeneration)
      setSelectedOriginRect(null)
    }
  }, [initialSelectedGeneration, isPickerMode])

  // ── Multi-select state ────────────────────────────────────────
  // Single-select picker mode (onSelect callback only) intentionally does
  // NOT support bulk selection — its click target must always resolve
  // onSelect. Multi-select picker mode (`pickerMultiSelect`) reuses this
  // state but keeps bulk-op action bars hidden; see the effect below.
  const [selectionMode, setSelectionMode] = useState(false)
  const [mobileSectionPickerOpen, setMobileSectionPickerOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  // Picker multi-select keeps selectionMode latched on so checkboxes stay
  // visible. There's no "exit selection" UI in picker mode — the user
  // either confirms (and we close) or cancels (and we drop the set).
  useEffect(() => {
    if (pickerMultiSelect) setSelectionMode(true)
  }, [pickerMultiSelect])
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Off-screen element used as a custom drag image when dragging a multi-select
  // batch onto a folder — shows the count instead of a lone thumbnail ghost.
  const dragGhostRef = useRef<HTMLDivElement>(null)
  const [isUploading, setIsUploading] = useState(false)
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

  const toggleSelection = useCallback(
    (id: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) {
          next.delete(id)
        } else {
          // Picker multi-select can cap selection (e.g. LoRA training tops out
          // at 50 images). Adding past the limit no-ops + toasts so the user
          // sees why nothing happened.
          if (
            pickerMultiSelect &&
            pickerMaxSelection != null &&
            next.size >= pickerMaxSelection
          ) {
            toast.warning(t('pickerMaxReached', { max: pickerMaxSelection }))
            return prev
          }
          next.add(id)
        }
        return next
      })
    },
    [pickerMultiSelect, pickerMaxSelection, t],
  )

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
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

  const requestBulkDelete = useCallback(() => {
    const count = selectedIds.size
    if (count === 0) return
    setConfirmAction({ kind: 'delete-bulk', count })
  }, [selectedIds])

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

  const requestBulkPublish = useCallback(() => {
    const count = selectedIds.size
    if (count === 0) return
    setConfirmAction({ kind: 'publish-bulk', count })
  }, [selectedIds])

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

  const requestBulkFavorite = useCallback(() => {
    const count = selectedIds.size
    if (count === 0) return
    setConfirmAction({ kind: 'favorite-bulk', count })
  }, [selectedIds])

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
      toast.success(t('bulkMoveSuccess', { count: updatedCount }))
    },
    [section, t, updateGeneration, removeGeneration, refreshCounts],
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

      if (
        !shouldKeepAssetAfterPatch(section, nextGeneration, activeMediaType)
      ) {
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
      activeMediaType,
      updateGeneration,
      removeGeneration,
      refreshCounts,
    ],
  )

  // Grid density — persisted per device. SSR renders the default
  // ('normal') so we don't mismatch hydration; the stored preference
  // is applied in an effect after mount.
  const [density, setDensity] = useState<Density>('normal')
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(DENSITY_STORAGE_KEY)
      if (isDensity(stored)) setDensity(stored)
    } catch {
      // localStorage unavailable (e.g. Safari private mode) — keep default.
    }
  }, [])
  const changeDensity = useCallback((next: Density) => {
    setDensity(next)
    try {
      window.localStorage.setItem(DENSITY_STORAGE_KEY, next)
    } catch {
      // ignore
    }
  }, [])

  const filtersForSection = useCallback(
    (next: Section): GalleryFilters => {
      const base: GalleryFilters = {
        ...filters,
        // The right sidebar changes the asset scope only. The top media
        // switcher remains an independent dimension, so users can browse
        // "Favorites + Video" or "Folder + Image" without losing context.
        liked: false,
        published: false,
        projectId: '',
        provider: '',
        type: mediaType ?? filters.type,
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
    [filters, mediaType],
  )

  const filtersForMediaType = useCallback(
    (next: LockedMediaType): GalleryFilters => ({
      ...filters,
      type: mediaType ?? next,
    }),
    [filters, mediaType],
  )

  const setSection = useCallback(
    (next: Section) => {
      setFilters(filtersForSection(next))
    },
    [filtersForSection, setFilters],
  )

  const setMediaTypeFilter = useCallback(
    (next: LockedMediaType) => {
      setFilters(filtersForMediaType(next))
    },
    [filtersForMediaType, setFilters],
  )

  const prefetchingCacheKeysRef = useRef<Set<string>>(new Set())

  // Warm the module-level gallery cache for filters the cursor is
  // about to click. By the time setFilters runs there's a cache hit,
  // turning the click → render into a 0ms transition. In-flight keys
  // are tracked outside the cache so a hover cannot poison the real
  // cache with an empty placeholder.
  const prefetchFilters = useCallback((targetFilters: GalleryFilters) => {
    const key = makeGalleryCacheKey(targetFilters, true, 24)
    if (readGalleryCache(key) || prefetchingCacheKeysRef.current.has(key)) {
      return
    }
    prefetchingCacheKeysRef.current.add(key)
    const filterParams = {
      search: targetFilters.search || undefined,
      model: targetFilters.model || undefined,
      sort: targetFilters.sort,
      type: targetFilters.type || undefined,
      timeRange: targetFilters.timeRange || undefined,
      liked: targetFilters.liked || undefined,
      published: targetFilters.published || undefined,
      mine: true,
      projectId: targetFilters.projectId || undefined,
      provider: targetFilters.provider || undefined,
    }
    void fetchGalleryImages(1, 24, filterParams)
      .then((response) => {
        if (response.success && response.data) {
          writeGalleryCache(key, {
            generations: response.data.generations ?? [],
            total: response.data.total ?? 0,
            hasMore: response.data.hasMore ?? false,
            nextCursor: response.data.nextCursor ?? null,
          })
        }
      })
      .finally(() => {
        prefetchingCacheKeysRef.current.delete(key)
      })
  }, [])

  const prefetchSection = useCallback(
    (next: Section) => {
      prefetchFilters(filtersForSection(next))
    },
    [filtersForSection, prefetchFilters],
  )

  const prefetchMediaType = useCallback(
    (next: LockedMediaType) => {
      prefetchFilters(filtersForMediaType(next))
    },
    [filtersForMediaType, prefetchFilters],
  )

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const processUploadFile = useCallback(
    async (file: File): Promise<GenerationRecord | null> => {
      const isAcceptedType = (
        USER_UPLOAD_ACCEPTED_MIME_TYPES as readonly string[]
      ).includes(file.type)
      if (!isAcceptedType) {
        toast.error(t('uploadUnsupportedFile'))
        return null
      }

      setIsUploading(true)
      try {
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
        if (!uploadFile) return null // helper already toasted the error

        // Upload-into-folder: viewing a project uploads straight into it;
        // any other view uploads to the unassigned bucket.
        const targetProjectId =
          section.kind === 'project' ? section.id : undefined
        const response = await uploadImageFileAPI(uploadFile, {
          projectId: targetProjectId,
        })
        if (!response.success || !response.data) {
          toast.error(getApiErrorMessage(tErrors, response, t('uploadFailed')))
          return null
        }
        clearGalleryCache()
        // Only surface the upload in the grid if it belongs in the current
        // view (e.g. don't inject it into Favorites or the wrong type tab).
        if (
          shouldKeepAssetAfterPatch(
            section,
            response.data.generation,
            activeMediaType,
          )
        ) {
          prependGeneration(response.data.generation)
        }
        void refreshCounts()
        toast.success(t('uploadSuccess'))
        return response.data.generation
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('uploadFailed'))
        return null
      } finally {
        setIsUploading(false)
      }
    },
    [t, tErrors, prependGeneration, refreshCounts, section, activeMediaType],
  )

  // Sequential multi-file upload — dropping or picking several images uploads
  // them one after another into the current folder. Returns the successfully
  // uploaded generations so the picker can select them.
  const processUploadFiles = useCallback(
    async (files: File[]): Promise<GenerationRecord[]> => {
      const images = files.filter((file) => file.type.startsWith('image/'))
      const uploaded: GenerationRecord[] = []
      for (const image of images) {
        const gen = await processUploadFile(image)
        if (gen) uploaded.push(gen)
      }
      return uploaded
    },
    [processUploadFile],
  )

  // Picker inline upload: after uploading, resolve the picker with the new
  // asset(s) — single-select picks the last one, multi-select toggles each in.
  const selectUploadedInPicker = useCallback(
    (uploaded: GenerationRecord[]) => {
      if (!isPickerMode || uploaded.length === 0) return
      if (pickerMultiSelect) {
        uploaded.forEach((gen) => toggleSelection(gen.id))
      } else if (onSelect) {
        onSelect(uploaded[uploaded.length - 1])
      }
    },
    [isPickerMode, pickerMultiSelect, toggleSelection, onSelect],
  )

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) return
    selectUploadedInPicker(await processUploadFiles(files))
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

  // Global drag-upload is on for the main page, and inside image pickers
  // (uploads are always images — an audio/3d picker can't use them).
  const uploadDropEnabled = !isPickerMode || mediaType === 'image' || !mediaType
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
    if (files.length > 0) {
      void processUploadFiles(files).then(selectUploadedInPicker)
    }
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
      void processUploadFile(imageFile).then((gen) => {
        if (gen) selectUploadedInPicker([gen])
      })
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [uploadDropEnabled, processUploadFile, selectUploadedInPicker])

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

  const handleProjectCreated = useCallback(
    (project: ProjectRecord) => {
      void refreshProjects()
      void refreshCounts()
      setSection({ kind: 'project', id: project.id })
    },
    [refreshProjects, refreshCounts, setSection],
  )

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
  const isBulkActionPending =
    isBulkDeleting || isBulkPublishing || isBulkFavoriting || isBulkMoving

  // Per-section counts — fall back to live `total` only for the bucket the
  // user is currently viewing so the sidebar still moves on add/delete
  // before the next refreshCounts() lands.
  const allCount = counts?.all ?? (section.kind === 'all' ? total : undefined)
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
  const projectCount = (id: string): number | undefined =>
    counts?.byProject[id] ??
    (section.kind === 'project' && section.id === id ? total : undefined)

  const primaryMobileSections: MobileSectionOption[] = [
    {
      key: 'all',
      active: section.kind === 'all',
      icon: <FolderOpen className="size-3.5" />,
      label: t('sidebarAll'),
      count: allCount,
      onClick: () => setSection({ kind: 'all' }),
      onPrefetch: () => prefetchSection({ kind: 'all' }),
    },
    {
      key: 'favorites',
      active: section.kind === 'favorites',
      icon: <Heart className="size-3.5" />,
      label: t('sidebarFavorites'),
      count: favoritesCount,
      onClick: () => setSection({ kind: 'favorites' }),
      onPrefetch: () => prefetchSection({ kind: 'favorites' }),
    },
    {
      key: 'published',
      active: section.kind === 'published',
      icon: <Globe className="size-3.5" />,
      label: t('sidebarPublished'),
      count: publishedCount,
      onClick: () => setSection({ kind: 'published' }),
      onPrefetch: () => prefetchSection({ kind: 'published' }),
    },
    {
      key: 'uploads',
      active: section.kind === 'uploads',
      icon: <UploadCloud className="size-3.5" />,
      label: t('sidebarUploads'),
      onClick: () => setSection({ kind: 'uploads' }),
      onPrefetch: () => prefetchSection({ kind: 'uploads' }),
    },
  ]

  const toolMobileSections: MobileSectionOption[] = mediaType
    ? []
    : [
        {
          key: 'image',
          active: activeMediaType === 'image',
          icon: <ImageIcon className="size-3.5" />,
          label: t('sidebarImages'),
          count: imageCount,
          onClick: () => setMediaTypeFilter('image'),
          onPrefetch: () => prefetchMediaType('image'),
        },
        {
          key: 'video',
          active: activeMediaType === 'video',
          icon: <Video className="size-3.5" />,
          label: t('sidebarVideos'),
          count: videoCount,
          onClick: () => setMediaTypeFilter('video'),
          onPrefetch: () => prefetchMediaType('video'),
        },
        {
          key: 'audio',
          active: activeMediaType === 'audio',
          icon: <Mic className="size-3.5" />,
          label: t('sidebarAudio'),
          count: audioCount,
          onClick: () => setMediaTypeFilter('audio'),
          onPrefetch: () => prefetchMediaType('audio'),
        },
        {
          key: 'model_3d',
          active: activeMediaType === 'model_3d',
          icon: <Box className="size-3.5" />,
          label: t('sidebarModel3D'),
          count: model3DCount,
          onClick: () => setMediaTypeFilter('model_3d'),
          onPrefetch: () => prefetchMediaType('model_3d'),
        },
      ]

  const folderMobileSections: MobileSectionOption[] = [
    {
      key: 'unassigned',
      active: section.kind === 'unassigned',
      icon: <FolderX className="size-3.5" />,
      label: t('sidebarUnassigned'),
      count: unassignedCount,
      onClick: () => setSection({ kind: 'unassigned' }),
      onPrefetch: () => prefetchSection({ kind: 'unassigned' }),
    },
    ...projects.map((project) => ({
      key: project.id,
      active: section.kind === 'project' && section.id === project.id,
      icon: <Folder className="size-3.5" />,
      label: project.name,
      count: projectCount(project.id),
      onClick: () => setSection({ kind: 'project', id: project.id }),
      onPrefetch: () => prefetchSection({ kind: 'project', id: project.id }),
    })),
  ]
  const mobileFolderAction = (
    <ProjectCreateDialog
      onCreated={handleProjectCreated}
      trigger={
        <button
          type="button"
          aria-label={t('folderCreate')}
          className="flex size-7 shrink-0 items-center justify-center rounded-full border border-dashed border-border/70 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <Plus className="size-3.5" />
        </button>
      }
    />
  )
  const mobileSectionGroups: MobileSectionGroup[] = [
    {
      key: 'primary',
      label: t('mobileSections'),
      options: primaryMobileSections,
    },
    {
      key: 'folders',
      label: t('sidebarFolders'),
      options: folderMobileSections,
      action: mobileFolderAction,
    },
  ]
  const activeSection =
    [...primaryMobileSections, ...folderMobileSections].find(
      (option) => option.active,
    ) ?? primaryMobileSections[0]
  const activeSectionCount = activeSection.count
  // Read-only "locked to X" label for pickers scoped to a single media type.
  const lockedMediaTypeLabel = mediaType
    ? t('pickerLocked', {
        type: {
          image: t('sidebarImages'),
          video: t('sidebarVideos'),
          audio: t('sidebarAudio'),
          model_3d: t('sidebarModel3D'),
        }[mediaType],
      })
    : null

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
          </div>
        </div>
      )}
      <div className="flex flex-1 min-h-0 gap-4 px-2 sm:px-6">
        {/* ─── Main grid area ────────────────────────────────────── */}
        <main className="studio-scrollbar flex-1 min-w-0 overflow-x-hidden overflow-y-auto py-4">
          <div className="mb-4 rounded-xl border border-border/70 bg-card/75 p-1.5 shadow-sm">
            <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex min-w-0 items-center px-1.5">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <h1 className="truncate text-base font-semibold text-foreground">
                      {t('title')}
                    </h1>
                    <Badge
                      variant="secondary"
                      className="max-w-36 truncate px-2 py-0.5 text-2xs font-medium text-muted-foreground"
                    >
                      {activeSection.label}
                    </Badge>
                    {typeof activeSectionCount === 'number' && (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {activeSectionCount}
                      </span>
                    )}
                    {/* Read-only lock badge: every picker is scoped to one
                        media type. Shows the type as context, never a toggle. */}
                    {isPickerMode && lockedMediaTypeLabel && (
                      <Badge
                        variant="outline"
                        className="shrink-0 gap-1 px-2 py-0.5 text-2xs font-medium text-muted-foreground"
                      >
                        <Lock className="size-2.5" />
                        {lockedMediaTypeLabel}
                      </Badge>
                    )}
                  </div>
                </div>
                {/* Main page: view + type toggles live in the top bar.
                    Picker mode moves both into the horizontal section rail
                    below the grid, so hide them here to avoid duplication. */}
                {!isPickerMode && (
                  <IconSegmentedToggle
                    label={t('sidebarViews')}
                    options={primaryMobileSections}
                  />
                )}
                {!isPickerMode && !mediaType && (
                  <IconSegmentedToggle
                    label={t('sidebarTools')}
                    options={toolMobileSections}
                  />
                )}
              </div>

              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end xl:shrink-0">
                {!isPickerMode && (
                  <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleUploadClick}
                      disabled={isUploading}
                      className="h-10 rounded-lg px-3.5"
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
                        'h-10 rounded-lg px-3.5',
                        selectionMode &&
                          'border-primary/30 bg-primary/10 text-primary hover:bg-primary/15',
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
              </div>
            </div>
          </div>

          {/* Scenized picker: one horizontal section rail replaces the hidden
              folder tree so folders don't eat the dialog width. No type rail —
              every picker locks a single media type (see the locked badge in
              the header); a switchable type toggle would only mislead. */}
          {isPickerMode && (
            <div className="mb-3 hidden lg:block">
              <MobileSectionRail
                label={t('sidebarViews')}
                options={[...primaryMobileSections, ...folderMobileSections]}
              />
            </div>
          )}
          <div className="mb-4 lg:hidden">
            <MobileSectionPicker
              label={t('mobileSections')}
              activeOption={activeSection}
              groups={mobileSectionGroups}
              expanded={mobileSectionPickerOpen}
              openLabel={t('mobileSectionPickerOpen')}
              closeLabel={t('mobileSectionPickerClose')}
              onExpandedChange={setMobileSectionPickerOpen}
            />
          </div>

          {/* Hidden upload input — rendered wherever uploading is allowed
              (main page always, image picker) so both the top-bar upload
              button and the picker's inline dashed cell can trigger it. */}
          {uploadDropEnabled && (
            <input
              ref={fileInputRef}
              type="file"
              accept={USER_UPLOAD_ACCEPT}
              multiple
              className="sr-only"
              aria-label={t('uploadInputLabel')}
              onChange={(event) => {
                void handleFileChange(event)
              }}
            />
          )}

          {/* Krea-style switching: useGallery serves cached snapshots
              instantly (0ms) and falls through to the grid skeleton on
              the genuinely-uncached miss. No top banner / pill — the
              skeleton is the feedback. Errored fetches still show via
              the existing error path below. */}
          {isEmpty ? (
            <EmptyState />
          ) : (
            <div className={cn('grid gap-2', DENSITY_GRID_CLASS[density])}>
              {/* Picker inline upload: drop/click uploads an image and selects
                  it, so users don't have to leave the dialog to add one. */}
              {isPickerMode && uploadDropEnabled && (
                <button
                  type="button"
                  onClick={handleUploadClick}
                  disabled={isUploading}
                  aria-label={t('uploadButton')}
                  className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 bg-muted/20 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
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
              )}
              {generations.length === 0 && isLoading
                ? Array.from({ length: 12 }).map((_, idx) => (
                    <div
                      key={`s-${idx}`}
                      className="aspect-square animate-pulse rounded-md bg-muted/40"
                    />
                  ))
                : generations.map((gen) => {
                    const isSelected = selectedIds.has(gen.id)
                    const videoPoster =
                      gen.thumbnailUrl ?? gen.previewUrl ?? undefined
                    const audioPreviewImage = getAudioPreviewCandidates(
                      gen,
                    ).find((url) => !failedAudioPreviewUrls.has(url))
                    const tileClass = cn(
                      'group relative aspect-square overflow-hidden rounded-lg border bg-muted/40 transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
                      isSelected
                        ? 'border-primary ring-2 ring-primary/40'
                        : 'border-border/60 hover:border-primary/40',
                    )
                    const tileChildren =
                      gen.outputType === 'VIDEO' ? (
                        <>
                          <video
                            src={gen.url}
                            poster={videoPoster}
                            muted
                            playsInline
                            preload={videoPoster ? 'none' : 'metadata'}
                            onLoadedMetadata={(event) => {
                              if (videoPoster) return
                              const video = event.currentTarget
                              if (
                                !Number.isFinite(video.duration) ||
                                video.duration <= 0
                              ) {
                                return
                              }
                              video.currentTime = Math.min(
                                0.12,
                                video.duration / 2,
                              )
                            }}
                            className="absolute inset-0 size-full bg-muted/40 object-cover"
                          />
                          <span className="pointer-events-none absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-background/80 text-foreground/70 shadow-sm backdrop-blur-sm">
                            <Video className="size-3.5" />
                          </span>
                        </>
                      ) : gen.outputType === 'AUDIO' ? (
                        <div className="absolute inset-0 bg-muted/40">
                          {audioPreviewImage ? (
                            // eslint-disable-next-line @next/next/no-img-element -- Audio cover URLs can be provider/model configured.
                            <img
                              src={audioPreviewImage}
                              alt=""
                              loading="lazy"
                              className="size-full object-cover"
                              onError={() =>
                                handleAudioPreviewError(audioPreviewImage)
                              }
                            />
                          ) : (
                            <div className="flex size-full items-center justify-center text-muted-foreground">
                              <Mic className="size-8" />
                            </div>
                          )}
                          <span className="pointer-events-none absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-background/80 text-foreground/70 shadow-sm backdrop-blur-sm">
                            <Mic className="size-3.5" />
                          </span>
                        </div>
                      ) : (
                        <NextImage
                          src={getGenerationThumbnailUrl(gen)}
                          alt={gen.prompt || ''}
                          fill
                          sizes={DENSITY_IMAGE_SIZES[density]}
                          className="object-cover"
                          loading="lazy"
                        />
                      )
                    const handleTileClick = (
                      event: React.MouseEvent<HTMLButtonElement>,
                    ) => {
                      // Picker multi-select wins over single-select onSelect:
                      // tile click toggles membership in the selection set
                      // instead of immediately resolving the picker.
                      if (pickerMultiSelect) {
                        toggleSelection(gen.id)
                        return
                      }
                      if (onSelect) {
                        onSelect(gen)
                        return
                      }
                      if (selectionMode) {
                        toggleSelection(gen.id)
                        return
                      }
                      setSelectedOriginRect(
                        toMediaTransitionOrigin(
                          event.currentTarget.getBoundingClientRect(),
                        ),
                      )
                      setSelectedGeneration(gen)
                    }
                    const handleTileContextMenu = (
                      e: React.MouseEvent<HTMLButtonElement>,
                    ) => {
                      if (onSelect || pickerMultiSelect) return
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
                      <button
                        key={gen.id}
                        type="button"
                        draggable={!isPickerMode && !isTouchPrimary()}
                        onDragStart={
                          isPickerMode ? undefined : handleTileDragStart
                        }
                        onClick={handleTileClick}
                        onContextMenu={handleTileContextMenu}
                        className={tileClass}
                        aria-label={gen.prompt || gen.id}
                        aria-pressed={selectionMode ? isSelected : undefined}
                        title={gen.prompt || undefined}
                      >
                        {tileChildren}
                        {(pickerMultiSelect ||
                          (!isPickerMode && selectionMode)) && (
                          <span
                            className={cn(
                              'pointer-events-none absolute left-1.5 top-1.5 flex size-5 items-center justify-center rounded-full',
                              isSelected
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-background/90 text-foreground/70',
                            )}
                          >
                            {isSelected ? (
                              <CheckCircle2 className="size-3.5" />
                            ) : (
                              <Circle className="size-3.5" />
                            )}
                          </span>
                        )}
                        {gen.isLiked && !selectionMode && (
                          <span
                            className="pointer-events-none absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-background/80 text-rose-500 shadow-sm backdrop-blur-sm"
                            aria-hidden
                          >
                            <Heart className="size-3 fill-current" />
                          </span>
                        )}
                      </button>
                    )
                  })}
              {hasMore && (
                <div ref={sentinelRef} className="col-span-full h-2" />
              )}
            </div>
          )}

          {isLoading && generations.length > 0 && (
            <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
              <Spinner size="md" />
            </div>
          )}
        </main>

        {/* ─── Right sidebar ─────────────────────────────────────── */}
        {/* Hidden in picker mode — the folder tree would eat ~40% of the
            dialog width. The scenized picker uses a horizontal section rail
            above the grid instead (see below). */}
        {!isPickerMode && (
          <aside className="studio-scrollbar hidden min-w-0 w-72 shrink-0 overflow-x-hidden overflow-y-auto py-4 lg:block">
            <div className="grid min-w-0 gap-4 overflow-hidden rounded-xl border border-border/70 bg-card/60 p-2 shadow-sm">
              <AssetFolderTree
                projects={projects}
                byProjectCounts={counts?.byProject}
                activeProjectTotal={
                  section.kind === 'project' ? total : undefined
                }
                unassignedCount={unassignedCount}
                activeProjectId={section.kind === 'project' ? section.id : null}
                isUnassignedActive={section.kind === 'unassigned'}
                onSelectUnassigned={() => setSection({ kind: 'unassigned' })}
                onSelectProject={(id) => setSection({ kind: 'project', id })}
                onProjectCreated={handleProjectCreated}
                onRenameProject={handleRenameProject}
                onRequestDeleteProject={requestDeleteProject}
                onDropAssets={handleDropAssetsOnFolder}
              />
            </div>
          </aside>
        )}
      </div>
      {!isPickerMode && (
        <AssetDetailSheet
          generation={selectedGeneration}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedGeneration(null)
              setSelectedOriginRect(null)
            }
          }}
          projects={projects}
          onDeleted={handleAssetDeleted}
          onMoved={handleAssetMoved}
          onUpdated={handleAssetUpdated}
          transitionOrigin={selectedOriginRect}
        />
      )}
      {/* Off-screen custom drag image for multi-select folder drags. */}
      <div
        ref={dragGhostRef}
        aria-hidden="true"
        style={{ position: 'fixed', left: '-9999px', top: '-9999px' }}
        className="pointer-events-none rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background shadow-lg"
      />
      {/* ─── Picker confirmation bar (multi-select picker mode) ── */}
      {pickerMultiSelect && (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 md:pb-6"
          style={{
            paddingBottom:
              'calc(max(var(--keyboard-safe-area-bottom, 0px), 1rem) + var(--keyboard-inset, 0px))',
          }}
        >
          <div className="pointer-events-auto flex max-w-full items-center gap-2 overflow-x-auto rounded-full border border-border/60 bg-background/95 px-3 py-2 shadow-2xl backdrop-blur-md">
            <span className="px-2 text-xs font-medium tabular-nums">
              {pickerMaxSelection != null
                ? t('pickerSelectedWithMax', {
                    count: selectedIds.size,
                    max: pickerMaxSelection,
                  })
                : t('selectedCount', { count: selectedIds.size })}
            </span>
            {selectedIds.size > 0 && (
              <>
                <span className="h-4 w-px bg-border/60" />
                <button
                  type="button"
                  onClick={clearSelection}
                  className="rounded-full px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                >
                  {t('selectClear')}
                </button>
              </>
            )}
            <span className="h-4 w-px bg-border/60" />
            <button
              type="button"
              disabled={selectedIds.size === 0}
              onClick={() => {
                const picked: GenerationRecord[] = []
                for (const id of selectedIds) {
                  const found = generations.find((g) => g.id === id)
                  if (found) picked.push(found)
                }
                onPickerConfirmMany?.(picked)
                clearSelection()
              }}
              className="flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <CheckCircle2 className="size-3.5" />
              {t('pickerConfirmAdd', { count: selectedIds.size })}
            </button>
          </div>
        </div>
      )}

      {/* ─── Bulk selection action bar ─────────────────────────── */}
      {!isPickerMode && selectionMode && selectedIds.size > 0 && (
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
              className="rounded-full px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            >
              {t('selectClear')}
            </button>
            <span className="h-4 w-px bg-border/60" />
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={isBulkActionPending}
                  className="flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground disabled:opacity-50"
                >
                  {isBulkMoving ? (
                    <Spinner size="sm" />
                  ) : (
                    <FolderInput className="size-3.5" />
                  )}
                  {t('bulkMove')}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="center"
                className="max-h-72 w-56 overflow-y-auto"
              >
                <DropdownMenuItem onClick={() => void performBulkMove(null)}>
                  <FolderX className="size-4" />
                  {t('bulkMoveUnassigned')}
                </DropdownMenuItem>
                {projects.length > 0 && <DropdownMenuSeparator />}
                {projects.map((project) => (
                  <DropdownMenuItem
                    key={project.id}
                    onClick={() => void performBulkMove(project.id)}
                  >
                    <Folder className="size-4" />
                    <span className="truncate">{project.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              type="button"
              onClick={requestBulkFavorite}
              disabled={isBulkActionPending}
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
              disabled={isBulkActionPending}
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
              disabled={isBulkActionPending}
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
  density: Density
  onChange: (next: Density) => void
}

function DensityToggle({ density, onChange }: DensityToggleProps) {
  const t = useTranslations('AssetsPage')
  const labels: Record<Density, string> = {
    comfortable: t('densityComfortable'),
    normal: t('densityNormal'),
    compact: t('densityCompact'),
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
        className="rounded-lg bg-background/80 p-0.5 shadow-inner"
        aria-label={t('densityLabel')}
      >
        {DENSITIES.map((d) => (
          <ToggleGroupItem
            key={d}
            value={d}
            aria-label={labels[d]}
            title={labels[d]}
            className="h-9 w-10 rounded-md px-0 text-sm tabular-nums data-[state=on]:bg-foreground data-[state=on]:text-background data-[state=on]:shadow-sm"
          >
            {DENSITY_XL_COLS[d]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

interface MobileSectionOption {
  key: string
  active: boolean
  icon: React.ReactNode
  label: string
  count?: number
  onClick: () => void
  onPrefetch?: () => void
}

interface IconSegmentedToggleProps {
  label: string
  options: MobileSectionOption[]
}

function IconSegmentedToggle({ label, options }: IconSegmentedToggleProps) {
  const activeKey = options.find((option) => option.active)?.key ?? ''

  return (
    <ToggleGroup
      type="single"
      value={activeKey}
      onValueChange={(value) => {
        const nextOption = options.find((option) => option.key === value)
        nextOption?.onClick()
      }}
      aria-label={label}
      className="max-w-full flex-nowrap gap-0 overflow-hidden rounded-xl border-border/70 bg-background/80 p-0 shadow-sm"
    >
      {options.map((option, index) => (
        <ToggleGroupItem
          key={option.key}
          value={option.key}
          aria-label={option.label}
          title={option.label}
          onMouseEnter={option.onPrefetch}
          onFocus={option.onPrefetch}
          className={cn(
            'inline-flex h-10 w-11 shrink-0 items-center justify-center rounded-none border-r border-border/70 px-0 text-sm first:rounded-l-xl last:rounded-r-xl last:border-r-0',
            'hover:bg-muted/50 hover:text-foreground',
            'data-[state=on]:z-10 data-[state=on]:bg-foreground data-[state=on]:text-background data-[state=on]:shadow-sm',
            index > 0 && '-ml-px',
          )}
        >
          <span
            className={cn(
              'flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors',
              option.active && 'text-background',
            )}
          >
            {option.icon}
          </span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

interface MobileSectionGroup {
  key: string
  label: string
  options: MobileSectionOption[]
  action?: React.ReactNode
}

interface MobileSectionPickerProps {
  label: string
  activeOption: MobileSectionOption
  groups: MobileSectionGroup[]
  expanded: boolean
  openLabel: string
  closeLabel: string
  onExpandedChange: (expanded: boolean) => void
}

function MobileSectionPicker({
  label,
  activeOption,
  groups,
  expanded,
  openLabel,
  closeLabel,
  onExpandedChange,
}: MobileSectionPickerProps) {
  return (
    <section
      aria-label={label}
      className="rounded-2xl border border-border/70 bg-card/80 p-2 shadow-sm"
    >
      <button
        type="button"
        onClick={() => onExpandedChange(!expanded)}
        aria-expanded={expanded}
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-2 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
            {activeOption.icon}
          </span>
          <span className="grid min-w-0 gap-0.5">
            <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground/70">
              {label}
            </span>
            <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
              <span className="truncate">{activeOption.label}</span>
              {typeof activeOption.count === 'number' && (
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {activeOption.count}
                </span>
              )}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {expanded ? closeLabel : openLabel}
          <ChevronDown
            className={cn(
              'size-3.5 transition-transform',
              expanded && 'rotate-180',
            )}
          />
        </span>
      </button>

      {expanded && (
        <div className="mt-2 grid gap-3 border-t border-border/60 pt-3">
          {groups.map((group) => (
            <MobileSectionRail
              key={group.key}
              label={group.label}
              options={group.options}
              action={group.action}
              onOptionSelected={() => onExpandedChange(false)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

interface MobileSectionRailProps {
  label: string
  options: MobileSectionOption[]
  action?: React.ReactNode
  onOptionSelected?: () => void
}

function MobileSectionRail({
  label,
  options,
  action,
  onOptionSelected,
}: MobileSectionRailProps) {
  return (
    <section className="grid gap-1.5" aria-label={label}>
      <div className="flex min-h-7 items-center justify-between gap-2">
        <span className="px-0.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground/70">
          {label}
        </span>
        {action}
      </div>
      <div
        role="group"
        aria-label={label}
        className="-mx-2 flex gap-1.5 overflow-x-auto px-2 pb-1"
      >
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => {
              option.onClick()
              onOptionSelected?.()
            }}
            onMouseEnter={option.onPrefetch}
            onFocus={option.onPrefetch}
            aria-pressed={option.active}
            className={cn(
              'inline-flex h-8 max-w-44 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
              option.active
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border/60 text-muted-foreground hover:border-primary/30 hover:text-foreground',
            )}
          >
            <span
              className={cn(
                'shrink-0',
                option.active ? 'text-primary' : 'text-muted-foreground/70',
              )}
            >
              {option.icon}
            </span>
            <span className="truncate">{option.label}</span>
            {typeof option.count === 'number' && (
              <span className="shrink-0 text-3xs text-muted-foreground/70 tabular-nums">
                {option.count}
              </span>
            )}
          </button>
        ))}
      </div>
    </section>
  )
}

function EmptyState() {
  const t = useTranslations('AssetsPage')
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-muted/40 text-muted-foreground">
        <ImageIcon className="size-6" />
      </div>
      <h2 className="font-display text-xl font-medium">{t('emptyTitle')}</h2>
      <p className="font-serif text-sm text-muted-foreground">
        {t('emptyDescription')}
      </p>
      <Link
        href={ROUTES.STUDIO_IMAGE}
        className="mt-2 inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
      >
        {t('emptyAction')}
      </Link>
    </div>
  )
}
