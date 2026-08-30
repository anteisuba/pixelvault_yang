'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  Lock,
  PanelLeft,
  Search,
  UploadCloud,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { AssetTile } from '@/components/business/assets/AssetTile'
import {
  AssetPickerFolderNav,
  type PickerScope,
} from '@/components/business/assets/AssetPickerFolderNav'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Spinner } from '@/components/ui/spinner'
import {
  ASSET_GRID_AUDIO_ASPECT_RATIO,
  ASSET_GRID_GAP,
  ASSET_PICKER_TARGET_ROW_HEIGHT,
  ASSET_PICKER_UPLOAD_CELL_ASPECT_RATIO,
} from '@/constants/assets-grid'
import {
  DEFAULT_AUDIO_ASSET_PREVIEW_IMAGE,
  getAudioAssetPreviewImage,
} from '@/constants/asset-previews'
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
import { useProjects } from '@/hooks/use-projects'
import { fetchAssetSectionCounts } from '@/lib/api-client/gallery'
import { uploadImageFileAPI } from '@/lib/api-client/generation'
import { getApiErrorMessage } from '@/lib/api-error-message'
import { prepareImageUpload } from '@/lib/prepare-image-upload'
import { toLayoutAspectRatio } from '@/lib/justified-layout'
import type {
  AssetSectionCounts,
  GenerationRecord,
  OutputTypeValue,
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

export interface AssetPickerBrowserProps {
  mode: 'single' | 'multi'
  mediaType?: OutputTypeValue
  maxSelection?: number
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

export function AssetPickerBrowser({
  mode,
  mediaType,
  maxSelection,
  initialGenerations = [],
  initialTotal = 0,
  initialHasMore = false,
  initialNextCursor = null,
  onSelect,
  onConfirmMany,
  onCancel,
  title,
}: AssetPickerBrowserProps) {
  const t = useTranslations('AssetsPage')
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
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [limitWarning, setLimitWarning] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [recentFolders, setRecentFolders] = useState<string[]>(() =>
    readRecentFolders(),
  )
  const [counts, setCounts] = useState<AssetSectionCounts | null>(null)

  const { projects } = useProjects({ loadHistoryOnMount: false })

  const {
    generations,
    isLoading,
    hasMore,
    sentinelRef,
    filters,
    setFilters,
    prependGeneration,
  } = useGallery({
    initialGenerations,
    initialTotal,
    initialHasMore,
    initialNextCursor,
    initialFilters: { types: mediaType ? [mediaType] : [] },
    mine: true,
    limit: 24,
  })

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

  useEffect(() => {
    void fetchAssetSectionCounts(mediaType ? [mediaType] : []).then(
      (response) => {
        if (response.success) setCounts(response.data)
      },
    )
  }, [mediaType])

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
      try {
        for (const image of images) {
          const maxMb = String(CLIENT_UPLOAD_MAX_BYTES / 1024 / 1024)
          const prepared = await prepareImageUpload(image, {
            maxBytes: CLIENT_UPLOAD_MAX_BYTES,
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
      }
    },
    [mode, onSelect, prependGeneration, scope, t, tErrors, toggleSelection],
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
  const aspectRatios = useMemo(
    () =>
      gridItems.map((item) =>
        item.kind === 'upload'
          ? ASSET_PICKER_UPLOAD_CELL_ASPECT_RATIO
          : item.generation.outputType === 'AUDIO'
            ? ASSET_GRID_AUDIO_ASPECT_RATIO
            : toLayoutAspectRatio(
                item.generation.width,
                item.generation.height,
              ),
      ),
    [gridItems],
  )
  const { containerRef, rows } = useJustifiedGrid({
    aspectRatios,
    targetRowHeight:
      ASSET_PICKER_TARGET_ROW_HEIGHT[isMobile ? 'mobile' : 'desktop'],
  })

  const lockLabel = mediaType
    ? t('pickerLocked', {
        type: {
          image: t('sidebarImages'),
          video: t('sidebarVideos'),
          audio: t('sidebarAudio'),
          model_3d: t('sidebarModel3D'),
        }[mediaType],
      })
    : null
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
      className={isMobile ? 'h-full w-full border-r-0' : 'w-44'}
    />
  )

  return (
    <div className="flex size-full flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-2">
        <button
          type="button"
          onClick={isMobile ? () => setScopeSheetOpen(true) : toggleNav}
          aria-label={t('pickerNavToggle')}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          <PanelLeft className="size-3.5" />
        </button>
        <span className="min-w-0 truncate text-xs font-medium text-foreground">
          {title}
        </span>
        {isMobile && (
          <span className="shrink-0 rounded-md border border-border/60 px-1.5 py-0.5 text-3xs text-muted-foreground">
            {scopeLabel}
          </span>
        )}
        {lockLabel && (
          <span className="ml-auto flex shrink-0 items-center gap-1 rounded-md border border-border/60 px-1.5 py-0.5 text-3xs text-muted-foreground">
            <Lock className="size-2.5" />
            {lockLabel}
          </span>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        {!isMobile && navOpen && nav}

        <main className="studio-scrollbar assets-scroll-gutter flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
          {/* 顶部搜索只搜**素材内容**（提示词/模型）；搜文件夹在导航栏自己的
              搜索框里，两者不混（§8.2）。 */}
          <div className="relative mb-2 shrink-0">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              defaultValue={filters.search}
              placeholder={t('search')}
              aria-label={t('search')}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return
                event.preventDefault()
                setFilters({
                  ...filters,
                  search: (event.target as HTMLInputElement).value.trim(),
                })
              }}
              className="h-8 w-full rounded-lg border border-border/60 bg-background/40 pl-8 pr-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-foreground/40"
            />
          </div>

          <div
            ref={containerRef}
            className="flex flex-col"
            style={{ gap: ASSET_GRID_GAP }}
          >
            {rows.map((row, rowIndex) => (
              <div
                key={rowIndex}
                className="flex"
                style={{ gap: ASSET_GRID_GAP }}
              >
                {row.boxes.map((box) => {
                  const item = gridItems[box.index]
                  if (!item) return null
                  if (item.kind === 'upload') {
                    return (
                      <label
                        key="picker-upload"
                        style={{ width: box.width, height: box.height }}
                        className="flex shrink-0 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/60 bg-muted/20 text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
                      >
                        {isUploading ? (
                          <Spinner size="sm" />
                        ) : (
                          <UploadCloud className="size-4" />
                        )}
                        <span className="text-3xs font-medium">
                          {t('uploadButton')}
                        </span>
                        <input
                          type="file"
                          multiple
                          accept={USER_IMAGE_UPLOAD_ACCEPTED_MIME_TYPES.join(
                            ',',
                          )}
                          className="sr-only"
                          onChange={(event) => {
                            const files = Array.from(event.target.files ?? [])
                            event.target.value = ''
                            void handleUpload(files)
                          }}
                        />
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
                      draggable={false}
                      audioCoverUrl={getAudioCover(generation)}
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

          {isLoading && (
            <div className="flex justify-center py-3">
              <Spinner size="sm" />
            </div>
          )}
          {hasMore && <div ref={sentinelRef} className="h-2 shrink-0" />}
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
              onClick={() =>
                onConfirmMany?.(
                  selectedIds
                    .map((id) =>
                      candidates.find((generation) => generation.id === id),
                    )
                    .filter((gen): gen is GenerationRecord => Boolean(gen)),
                )
              }
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

/** 音频封面回退链（与 /assets 同一套，见 page §6）。 */
function getAudioCover(generation: GenerationRecord): string | undefined {
  if (generation.outputType !== 'AUDIO') return undefined
  const snapshot =
    typeof generation.snapshot === 'object' && generation.snapshot !== null
      ? (generation.snapshot as Record<string, unknown>)
      : null
  const voiceId =
    typeof snapshot?.voiceId === 'string' ? snapshot.voiceId : undefined
  const cover =
    typeof snapshot?.voiceCoverImage === 'string'
      ? snapshot.voiceCoverImage
      : typeof snapshot?.coverImage === 'string'
        ? snapshot.coverImage
        : undefined
  return (
    generation.thumbnailUrl ??
    generation.previewUrl ??
    cover ??
    getAudioAssetPreviewImage(generation.model, voiceId) ??
    DEFAULT_AUDIO_ASSET_PREVIEW_IMAGE
  )
}

/** 上传行只认图片 —— 音频/3D picker 用不上它。 */
export const PICKER_UPLOAD_PROVIDER = USER_UPLOAD_PROVIDER
