'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle2,
  Circle,
  Folder,
  FolderInput,
  FolderOpen,
  FolderX,
  Globe,
  Heart,
  Image as ImageIcon,
  Loader2,
  Mic,
  Pencil,
  Plus,
  Search,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { ProjectCreateDialog } from '@/components/business/ProjectCreateDialog'
import { useGallery, type GalleryFilters } from '@/hooks/use-gallery'
import { useProjects } from '@/hooks/use-projects'
import { ROUTES } from '@/constants/routes'
import {
  USER_UPLOAD_ACCEPTED_MIME_PREFIXES,
  USER_UPLOAD_MAX_BYTES,
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
import { uploadImageAPI } from '@/lib/api-client/generation'
import {
  makeGalleryCacheKey,
  readGalleryCache,
  writeGalleryCache,
} from '@/lib/gallery-cache'
import { getGenerationThumbnailUrl } from '@/lib/generation-media'
import { cn } from '@/lib/utils'
import type { AssetSectionCounts, GenerationRecord } from '@/types'

type LockedMediaType = 'image' | 'video' | 'audio' | 'model_3d'

interface KreaAssetBrowserProps {
  initialGenerations?: GenerationRecord[]
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
  projectId: '',
  provider: '',
}

type Section =
  | { kind: 'all' }
  | { kind: 'favorites' }
  | { kind: 'uploads' }
  | { kind: 'type'; type: 'image' | 'video' | 'audio' | 'model_3d' }
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
const USER_UPLOAD_ACCEPT = USER_UPLOAD_ACCEPTED_MIME_PREFIXES.map(
  (prefix) => `${prefix}*`,
).join(',')
const DENSITY_XL_COLS: Record<Density, number> = {
  comfortable: 4,
  normal: 6,
  compact: 8,
}

function isDensity(value: string | null): value is Density {
  return value === 'comfortable' || value === 'normal' || value === 'compact'
}

function sectionFromFilters(
  filters: GalleryFilters,
  lockedMediaType?: LockedMediaType,
): Section {
  if (filters.liked) return { kind: 'favorites' }
  if (filters.provider === USER_UPLOAD_PROVIDER) return { kind: 'uploads' }
  if (filters.projectId === 'none') return { kind: 'unassigned' }
  if (filters.projectId) return { kind: 'project', id: filters.projectId }
  if (
    !lockedMediaType &&
    (filters.type === 'image' ||
      filters.type === 'video' ||
      filters.type === 'audio' ||
      filters.type === 'model_3d')
  ) {
    return { kind: 'type', type: filters.type }
  }
  return { kind: 'all' }
}

function shouldKeepAssetAfterProjectMove(
  section: Section,
  projectId: string | null,
): boolean {
  if (
    section.kind === 'all' ||
    section.kind === 'favorites' ||
    section.kind === 'uploads' ||
    section.kind === 'type'
  ) {
    return true
  }
  if (section.kind === 'unassigned') return projectId === null
  return section.id === projectId
}

/**
 * KreaAssetBrowser — full-page asset browser with a Krea-style right sidebar.
 *
 * Right sidebar has four sections (All / Favorites / Tools / Folders) that
 * collapse into existing useGallery filters: type for Tools, liked for
 * Favorites, projectId for Folders. Selecting a section resets the other
 * filter dimensions so the user can't end up in an "ANDed" filter state
 * they didn't ask for.
 */
export function KreaAssetBrowser({
  initialGenerations = [],
  initialPage = 1,
  initialHasMore = false,
  initialNextCursor = null,
  initialTotal = 0,
  initialFilters = DEFAULT_FILTERS,
  onSelect,
  mediaType,
  className,
}: KreaAssetBrowserProps) {
  const t = useTranslations('AssetsPage')

  const effectiveInitialFilters: GalleryFilters = mediaType
    ? { ...initialFilters, type: mediaType }
    : initialFilters

  const [searchInput, setSearchInput] = useState(effectiveInitialFilters.search)
  const isPickerMode = !!onSelect
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
  const section = useMemo(
    () => sectionFromFilters(filters, mediaType),
    [filters, mediaType],
  )

  // Aggregate sidebar counts. One request per page load instead of one
  // per item — and the All count stays stable as the user filters down.
  const [counts, setCounts] = useState<AssetSectionCounts | null>(null)
  const refreshCounts = useCallback(async () => {
    const response = await fetchAssetSectionCounts()
    if (response.success) setCounts(response.data)
  }, [])
  useEffect(() => {
    void refreshCounts()
  }, [refreshCounts])

  // Detail sheet — only used outside picker mode. In picker mode the
  // tile click resolves the asset picker via onSelect, so a detail
  // sheet would steal the click target.
  const [selectedGeneration, setSelectedGeneration] =
    useState<GenerationRecord | null>(null)

  // ── Multi-select state ────────────────────────────────────────
  // Picker mode (asset selector dialog) intentionally does NOT support
  // bulk selection — its click target must always resolve onSelect.
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const fileInputRef = useRef<HTMLInputElement>(null)
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
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [editingProjectName, setEditingProjectName] = useState('')
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(
    null,
  )

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

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
      toast.success(t('bulkPublishSuccess', { count: updatedCount }))
      exitSelectionMode()
    } finally {
      setIsBulkPublishing(false)
    }
  }, [selectedIds, t, exitSelectionMode])

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
      ids.forEach((id) => updateGeneration(id, { isLiked: true }))
      void refreshCounts()
      toast.success(t('bulkFavoriteSuccess', { count: updatedCount }))
      exitSelectionMode()
    } finally {
      setIsBulkFavoriting(false)
    }
  }, [selectedIds, t, updateGeneration, refreshCounts, exitSelectionMode])

  const performBulkMove = useCallback(
    async (projectId: string | null) => {
      const ids = Array.from(selectedIds)
      if (ids.length === 0) return
      setIsBulkMoving(true)
      try {
        const result = await batchAssignProjectAPI(ids, projectId)
        if (!result.success) {
          toast.error(result.error ?? t('bulkMoveFailed'))
          return
        }
        const updatedCount = result.data?.updatedCount ?? ids.length
        const shouldKeep = shouldKeepAssetAfterProjectMove(section, projectId)
        ids.forEach((id) => {
          if (shouldKeep) updateGeneration(id, { projectId })
          else removeGeneration(id)
        })
        void refreshCounts()
        toast.success(t('bulkMoveSuccess', { count: updatedCount }))
        exitSelectionMode()
      } finally {
        setIsBulkMoving(false)
      }
    },
    [
      selectedIds,
      section,
      t,
      updateGeneration,
      removeGeneration,
      refreshCounts,
      exitSelectionMode,
    ],
  )

  // Folder reassignment may push the asset out of the current section
  // (e.g. user is viewing "Unassigned" and moves into a folder). Drop
  // it locally so the grid reflects the move without a refetch, then
  // refresh the sidebar counts so both buckets update.
  const handleAssetMoved = useCallback(
    (id: string) => {
      removeGeneration(id)
      void refreshCounts()
    },
    [removeGeneration, refreshCounts],
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
        // Reset orthogonal dimensions when navigating sections to keep
        // the mental model simple — sections are mutually exclusive in
        // Krea.
        liked: false,
        projectId: '',
        provider: '',
        // When mediaType is locked the browser is acting as a
        // single-type picker (e.g. image-only reference selection), so
        // 'All' inside that mode means "all <mediaType>" rather than
        // every media kind.
        type: mediaType ?? 'all',
      }
      switch (next.kind) {
        case 'all':
          return base
        case 'favorites':
          return { ...base, liked: true }
        case 'uploads':
          return { ...base, provider: USER_UPLOAD_PROVIDER }
        case 'type':
          return { ...base, type: next.type }
        case 'unassigned':
          return { ...base, projectId: 'none' }
        case 'project':
          return { ...base, projectId: next.id }
      }
    },
    [filters, mediaType],
  )

  const setSection = (next: Section) => {
    setFilters(filtersForSection(next))
  }

  const prefetchingCacheKeysRef = useRef<Set<string>>(new Set())

  // Warm the module-level gallery cache for a section the cursor is
  // about to click. By the time setFilters runs there's a cache hit,
  // turning the click → render into a 0ms transition. In-flight keys
  // are tracked outside the cache so a hover cannot poison the real
  // cache with an empty placeholder.
  const prefetchSection = useCallback(
    (next: Section) => {
      const targetFilters = filtersForSection(next)
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
    },
    [filtersForSection],
  )

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setFilters({ ...filters, search: searchInput.trim() })
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const isAcceptedType = USER_UPLOAD_ACCEPTED_MIME_PREFIXES.some((prefix) =>
      file.type.startsWith(prefix),
    )
    if (!isAcceptedType) {
      toast.error(t('uploadUnsupportedFile'))
      return
    }
    if (file.size > USER_UPLOAD_MAX_BYTES) {
      toast.error(
        t('uploadFileTooLarge', {
          maxMb: String(USER_UPLOAD_MAX_BYTES / 1024 / 1024),
        }),
      )
      return
    }

    setIsUploading(true)
    try {
      const imageDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          if (typeof reader.result === 'string') resolve(reader.result)
          else reject(new Error(t('uploadFailed')))
        }
        reader.onerror = () =>
          reject(reader.error ?? new Error(t('uploadFailed')))
        reader.readAsDataURL(file)
      })
      const response = await uploadImageAPI({ imageDataUrl })
      if (!response.success || !response.data) {
        toast.error(response.error ?? t('uploadFailed'))
        return
      }
      prependGeneration(response.data.generation)
      void refreshCounts()
      toast.success(t('uploadSuccess'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('uploadFailed'))
    } finally {
      setIsUploading(false)
    }
  }

  const startRenameProject = (id: string, currentName: string) => {
    setEditingProjectId(id)
    setEditingProjectName(currentName)
  }

  const cancelRenameProject = () => {
    setEditingProjectId(null)
    setEditingProjectName('')
  }

  const submitRenameProject = async (id: string, currentName: string) => {
    if (renamingProjectId) return
    const trimmed = editingProjectName.trim()
    if (!trimmed) return
    if (trimmed === currentName) {
      cancelRenameProject()
      return
    }
    setRenamingProjectId(id)
    try {
      const ok = await updateProject(id, { name: trimmed })
      if (ok) {
        cancelRenameProject()
        void refreshCounts()
      }
    } finally {
      setRenamingProjectId(null)
    }
  }

  const requestDeleteProject = (id: string, name: string) => {
    setConfirmAction({ kind: 'delete-folder', id, name })
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
  const isBulkActionPending =
    isBulkDeleting || isBulkPublishing || isBulkFavoriting || isBulkMoving

  // Per-section counts — fall back to live `total` only for the bucket the
  // user is currently viewing so the sidebar still moves on add/delete
  // before the next refreshCounts() lands.
  const allCount = counts?.all ?? (section.kind === 'all' ? total : undefined)
  const favoritesCount =
    counts?.favorites ?? (section.kind === 'favorites' ? total : undefined)
  const imageCount =
    counts?.image ??
    (section.kind === 'type' && section.type === 'image' ? total : undefined)
  const videoCount =
    counts?.video ??
    (section.kind === 'type' && section.type === 'video' ? total : undefined)
  const audioCount =
    counts?.audio ??
    (section.kind === 'type' && section.type === 'audio' ? total : undefined)
  const model3DCount =
    counts?.model_3d ??
    (section.kind === 'type' && section.type === 'model_3d' ? total : undefined)
  const unassignedCount =
    counts?.unassigned ?? (section.kind === 'unassigned' ? total : undefined)
  const projectCount = (id: string): number | undefined =>
    counts?.byProject[id] ??
    (section.kind === 'project' && section.id === id ? total : undefined)

  return (
    <div
      className={cn(
        'flex h-[calc(100vh-3rem)] flex-col bg-background',
        className,
      )}
    >
      <div className="flex flex-1 min-h-0 gap-4 px-2 sm:px-6">
        {/* ─── Main grid area ────────────────────────────────────── */}
        <main className="flex-1 min-w-0 overflow-y-auto py-4">
          <div className="mb-4 flex items-center gap-3">
            <form
              onSubmit={handleSearchSubmit}
              className="relative max-w-md flex-1"
            >
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t('search')}
                className="h-10 pl-9 text-sm"
              />
            </form>
            {!isPickerMode && (
              <>
                {section.kind === 'uploads' && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={USER_UPLOAD_ACCEPT}
                      className="sr-only"
                      aria-label={t('uploadInputLabel')}
                      onChange={(event) => {
                        void handleFileChange(event)
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleUploadClick}
                      disabled={isUploading}
                      className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-foreground px-3 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isUploading ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <UploadCloud className="size-3.5" />
                      )}
                      <span>
                        {isUploading ? t('uploading') : t('uploadButton')}
                      </span>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (selectionMode) exitSelectionMode()
                    else setSelectionMode(true)
                  }}
                  className={cn(
                    'flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
                    selectionMode
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border/60 text-muted-foreground hover:border-primary/30 hover:text-foreground',
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
                </button>
                <DensityToggle density={density} onChange={changeDensity} />
              </>
            )}
          </div>

          {/* Krea-style switching: useGallery serves cached snapshots
              instantly (0ms) and falls through to the grid skeleton on
              the genuinely-uncached miss. No top banner / pill — the
              skeleton is the feedback. Errored fetches still show via
              the existing error path below. */}
          {isEmpty ? (
            <EmptyState />
          ) : (
            <div className={cn('grid gap-2', DENSITY_GRID_CLASS[density])}>
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
                    const tileClass = cn(
                      'group relative aspect-square overflow-hidden rounded-md border bg-muted/40 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
                      isSelected
                        ? 'border-primary ring-2 ring-primary/40 scale-[0.97]'
                        : 'border-border/60 hover:border-primary/40 hover:scale-[1.02]',
                    )
                    const tileChildren =
                      gen.outputType === 'VIDEO' ? (
                        // `preload="none"` instead of `metadata` — a dense
                        // grid would otherwise open a metadata fetch per
                        // tile, throttling the browser's connection budget
                        // and slowing the surrounding image loads. Tradeoff:
                        // no first-frame thumbnail until we ship a real
                        // poster pipeline, so we surface a Video badge so
                        // the asset type is still legible.
                        <>
                          <video
                            src={gen.url}
                            poster={videoPoster}
                            muted
                            playsInline
                            preload="none"
                            className="absolute inset-0 size-full bg-muted/40 object-cover"
                          />
                          {!videoPoster && (
                            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-muted-foreground/80">
                              <Video className="size-8" />
                            </div>
                          )}
                        </>
                      ) : gen.outputType === 'AUDIO' ? (
                        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                          <Mic className="size-8" />
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
                    const handleTileClick = () => {
                      if (onSelect) {
                        onSelect(gen)
                        return
                      }
                      if (selectionMode) {
                        toggleSelection(gen.id)
                        return
                      }
                      setSelectedGeneration(gen)
                    }
                    const handleTileContextMenu = (
                      e: React.MouseEvent<HTMLButtonElement>,
                    ) => {
                      if (onSelect) return
                      e.preventDefault()
                      if (selectionMode) toggleSelection(gen.id)
                      else enterSelectionWith(gen.id)
                    }
                    return (
                      <button
                        key={gen.id}
                        type="button"
                        onClick={handleTileClick}
                        onContextMenu={handleTileContextMenu}
                        className={tileClass}
                        aria-label={gen.prompt || gen.id}
                        aria-pressed={selectionMode ? isSelected : undefined}
                        title={gen.prompt || undefined}
                      >
                        {tileChildren}
                        {!isPickerMode && selectionMode && (
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
              <Loader2 className="size-4 animate-spin" />
            </div>
          )}
        </main>

        {/* ─── Right sidebar ─────────────────────────────────────── */}
        <aside className="hidden w-64 shrink-0 overflow-y-auto border-l border-border/60 py-4 pl-4 lg:block">
          <SidebarItem
            active={section.kind === 'all'}
            icon={<FolderOpen className="size-4" />}
            label={t('sidebarAll')}
            count={allCount}
            onClick={() => setSection({ kind: 'all' })}
            onPrefetch={() => prefetchSection({ kind: 'all' })}
          />
          <SidebarItem
            active={section.kind === 'favorites'}
            icon={<Heart className="size-4" />}
            label={t('sidebarFavorites')}
            count={favoritesCount}
            onClick={() => setSection({ kind: 'favorites' })}
            onPrefetch={() => prefetchSection({ kind: 'favorites' })}
          />
          <SidebarItem
            active={section.kind === 'uploads'}
            icon={<UploadCloud className="size-4" />}
            label={t('sidebarUploads')}
            onClick={() => setSection({ kind: 'uploads' })}
            onPrefetch={() => prefetchSection({ kind: 'uploads' })}
          />

          {/*
           * Tools section lets the user switch across media types — hide it
           * when mediaType is locked so a "Select image" picker can't lead
           * to the video/audio buckets.
           */}
          {!mediaType && (
            <>
              <SidebarHeading label={t('sidebarTools')} />
              <SidebarItem
                active={section.kind === 'type' && section.type === 'image'}
                icon={<ImageIcon className="size-4" />}
                label={t('sidebarImages')}
                count={imageCount}
                onClick={() => setSection({ kind: 'type', type: 'image' })}
                onPrefetch={() =>
                  prefetchSection({ kind: 'type', type: 'image' })
                }
              />
              <SidebarItem
                active={section.kind === 'type' && section.type === 'video'}
                icon={<Video className="size-4" />}
                label={t('sidebarVideos')}
                count={videoCount}
                onClick={() => setSection({ kind: 'type', type: 'video' })}
                onPrefetch={() =>
                  prefetchSection({ kind: 'type', type: 'video' })
                }
              />
              <SidebarItem
                active={section.kind === 'type' && section.type === 'audio'}
                icon={<Mic className="size-4" />}
                label={t('sidebarAudio')}
                count={audioCount}
                onClick={() => setSection({ kind: 'type', type: 'audio' })}
                onPrefetch={() =>
                  prefetchSection({ kind: 'type', type: 'audio' })
                }
              />
              <SidebarItem
                active={section.kind === 'type' && section.type === 'model_3d'}
                icon={<Box className="size-4" />}
                label={t('sidebarModel3D')}
                count={model3DCount}
                onClick={() => setSection({ kind: 'type', type: 'model_3d' })}
                onPrefetch={() =>
                  prefetchSection({ kind: 'type', type: 'model_3d' })
                }
              />
            </>
          )}

          <div className="mt-4 mb-1 flex items-center justify-between">
            <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground/70">
              {t('sidebarFolders')}
            </span>
            <ProjectCreateDialog
              onCreated={(project) => {
                void refreshProjects()
                void refreshCounts()
                setSection({ kind: 'project', id: project.id })
              }}
              trigger={
                <button
                  type="button"
                  aria-label="Create folder"
                  className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                >
                  <Plus className="size-3.5" />
                </button>
              }
            />
          </div>
          <SidebarItem
            active={section.kind === 'unassigned'}
            icon={<FolderX className="size-4" />}
            label={t('sidebarUnassigned')}
            count={unassignedCount}
            onClick={() => setSection({ kind: 'unassigned' })}
            onPrefetch={() => prefetchSection({ kind: 'unassigned' })}
          />
          {projects.map((project) =>
            editingProjectId === project.id ? (
              <ProjectRenameSidebarItem
                key={project.id}
                active={section.kind === 'project' && section.id === project.id}
                value={editingProjectName}
                disabled={renamingProjectId === project.id}
                inputLabel={t('folderRenameInput')}
                saveLabel={t('folderRenameSave')}
                cancelLabel={t('folderRenameCancel')}
                onChange={setEditingProjectName}
                onSubmit={() =>
                  void submitRenameProject(project.id, project.name)
                }
                onCancel={cancelRenameProject}
              />
            ) : (
              <SidebarItem
                key={project.id}
                active={section.kind === 'project' && section.id === project.id}
                icon={<Folder className="size-4" />}
                label={project.name}
                count={projectCount(project.id)}
                onClick={() => setSection({ kind: 'project', id: project.id })}
                onPrefetch={() =>
                  prefetchSection({ kind: 'project', id: project.id })
                }
                actions={
                  <>
                    <button
                      type="button"
                      aria-label={t('folderRename')}
                      title={t('folderRename')}
                      onClick={(e) => {
                        e.stopPropagation()
                        startRenameProject(project.id, project.name)
                      }}
                      className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                    >
                      <Pencil className="size-3" />
                    </button>
                    <button
                      type="button"
                      aria-label={t('folderDelete')}
                      title={t('folderDelete')}
                      onClick={(e) => {
                        e.stopPropagation()
                        requestDeleteProject(project.id, project.name)
                      }}
                      className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </>
                }
              />
            ),
          )}
        </aside>
      </div>
      {!isPickerMode && (
        <AssetDetailSheet
          generation={selectedGeneration}
          onOpenChange={(open) => {
            if (!open) setSelectedGeneration(null)
          }}
          projects={projects}
          onDeleted={handleAssetDeleted}
          onMoved={handleAssetMoved}
          onUpdated={(id, patch) => {
            updateGeneration(id, patch)
            // Keep the open sheet's `generation` in sync so the buttons
            // reflect the new isPublic/isLiked state without a refetch.
            setSelectedGeneration((prev) =>
              prev && prev.id === id ? { ...prev, ...patch } : prev,
            )
            // Liking/unliking moves the asset in/out of the Favorites
            // section, so its sidebar count needs to refresh too.
            if ('isLiked' in patch) {
              void refreshCounts()
            }
          }}
        />
      )}
      {/* ─── Bulk selection action bar ─────────────────────────── */}
      {!isPickerMode && selectionMode && selectedIds.size > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-4 md:pb-6">
          <div className="pointer-events-auto flex max-w-full items-center gap-2 overflow-x-auto rounded-full border border-border/60 bg-background/95 px-3 py-2 shadow-2xl backdrop-blur-md">
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
                    <Loader2 className="size-3.5 animate-spin" />
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
                <Loader2 className="size-3.5 animate-spin" />
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
                <Loader2 className="size-3.5 animate-spin" />
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
                <Loader2 className="size-3.5 animate-spin" />
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
    <div
      role="group"
      aria-label={t('densityLabel')}
      className="hidden shrink-0 items-center rounded-full border border-border/60 p-0.5 text-xs sm:inline-flex"
    >
      {DENSITIES.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onChange(d)}
          aria-pressed={density === d}
          title={labels[d]}
          className={cn(
            'flex h-7 w-9 items-center justify-center rounded-full font-medium tabular-nums transition-colors',
            density === d
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {DENSITY_XL_COLS[d]}
        </button>
      ))}
    </div>
  )
}

// ─── Sidebar primitives ────────────────────────────────────────

interface SidebarItemProps {
  active: boolean
  icon: React.ReactNode
  label: string
  count?: number
  onClick: () => void
  /**
   * Fires when the user moves the pointer onto the row — used to warm
   * the gallery cache before the click lands, so by the time setFilters
   * runs there's a cache hit waiting. Should be a no-op when the
   * destination filter is already cached.
   */
  onPrefetch?: () => void
  /**
   * Optional trailing controls (e.g. rename / delete for project rows).
   * Rendered after the count and revealed on hover only. The host should
   * call `stopPropagation` inside any clickable child so it doesn't also
   * trigger the row's own onClick.
   */
  actions?: React.ReactNode
}

interface ProjectRenameSidebarItemProps {
  active: boolean
  value: string
  disabled: boolean
  inputLabel: string
  saveLabel: string
  cancelLabel: string
  onChange: (value: string) => void
  onSubmit: () => void
  onCancel: () => void
}

function ProjectRenameSidebarItem({
  active,
  value,
  disabled,
  inputLabel,
  saveLabel,
  cancelLabel,
  onChange,
  onSubmit,
  onCancel,
}: ProjectRenameSidebarItemProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onCancel()
        }
      }}
      className={cn(
        'flex w-full items-center gap-1 rounded-md py-1 pl-2 pr-1 text-sm transition-colors',
        active ? 'bg-primary/10 text-primary' : 'text-foreground/80',
      )}
    >
      <Folder className="size-4 shrink-0 text-muted-foreground/70" />
      <Input
        ref={inputRef}
        value={value}
        disabled={disabled}
        maxLength={60}
        aria-label={inputLabel}
        onChange={(event) => onChange(event.target.value)}
        className="h-7 min-w-0 flex-1 rounded-md bg-background px-2 text-sm"
      />
      <button
        type="submit"
        aria-label={saveLabel}
        title={saveLabel}
        disabled={disabled || value.trim().length === 0}
        className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        {disabled ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <CheckCircle2 className="size-3.5" />
        )}
      </button>
      <button
        type="button"
        aria-label={cancelLabel}
        title={cancelLabel}
        disabled={disabled}
        onClick={onCancel}
        className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        <X className="size-3.5" />
      </button>
    </form>
  )
}

function SidebarItem({
  active,
  icon,
  label,
  count,
  onClick,
  onPrefetch,
  actions,
}: SidebarItemProps) {
  return (
    <div
      className={cn(
        'group/sidebar-item flex w-full items-center gap-1 rounded-md pl-2 pr-1 py-1.5 text-sm transition-colors',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-foreground/80 hover:bg-muted/40 hover:text-foreground',
      )}
      onMouseEnter={onPrefetch}
      onFocus={onPrefetch}
    >
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              'shrink-0',
              active ? 'text-primary' : 'text-muted-foreground/70',
            )}
          >
            {icon}
          </span>
          <span className="truncate">{label}</span>
        </span>
        {typeof count === 'number' && (
          <span className="shrink-0 text-2xs text-muted-foreground/70 tabular-nums">
            {count}
          </span>
        )}
      </button>
      {actions ? (
        <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/sidebar-item:opacity-100 focus-within:opacity-100">
          {actions}
        </span>
      ) : null}
    </div>
  )
}

function SidebarHeading({ label }: { label: string }) {
  return (
    <div className="mt-4 mb-1 px-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground/70">
      {label}
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
