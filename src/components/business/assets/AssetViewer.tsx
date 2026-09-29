'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useFormatter, useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  ArrowUpRight,
  Box,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Heart,
  ImagePlus,
  Link2,
  MoreHorizontal,
  Plus,
  Trash2,
  X,
} from '@/components/icons'
import {
  COPIED_ACK_MS,
  DURATION,
  EASE_STANDARD,
  LIQUID_SPRING,
} from '@/constants/motion'
import { USER_UPLOAD_PROVIDER } from '@/constants/uploads'
import type { GenerationRecord, ProjectRecord } from '@/types'
import { AssetAddToFolderPanel } from '@/components/business/assets/AssetAddToFolderPanel'
import { AssetDetailOverlays } from '@/components/business/assets/AssetDetailOverlays'
import { ModelViewer } from '@/components/business/ModelViewer'
import { getChipZoomMotion } from '@/components/business/studio-shared/primitives/tool-surface'
import { VideoAnalysisPanel } from '@/components/business/vision/VideoAnalysisPanel'
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
import { Spinner } from '@/components/ui/spinner'
import { useAssetDetailActions } from '@/hooks/use-asset-detail-actions'
import { getFolderMembershipsAPI } from '@/lib/api-client/projects'
import {
  buildAssetRecipeText,
  formatGenerationSeed,
} from '@/lib/asset-recipe-text'
import {
  getGenerationModel3DVisualUrl,
  getGenerationPreviewUrl,
  getGenerationThumbnailUrl,
  getGenerationVideoPosterUrl,
} from '@/lib/generation-media'
import { cn } from '@/lib/utils'
import { formatDuration } from '@/lib/video-utils'

/** 提示词收着时露 6 行（`leading-5` = 20px 一行）。 */
const PROMPT_COLLAPSED_HEIGHT = 120
/** 参考图最多摆几张。 */
const MAX_REFERENCE_THUMBS = 8

interface AssetViewerProps {
  generation: GenerationRecord
  /** 能翻的那组：当前已加载、当前筛选结果里的图片（pages/assets.md §3「详情」）。 */
  images: readonly GenerationRecord[]
  onNavigate: (next: GenerationRecord) => void
  /** 关上的动画演完了（或做同款要离开这一页）：由宿主把这一张放下。 */
  onClose: () => void
  folders: ProjectRecord[]
  onCreateFolder: (name: string) => Promise<ProjectRecord | null>
  onFoldersChanged: (memberships: Record<string, string[]>) => void
  onFoldersUndone: () => void
  onDeleted: (id: string) => void
  onUpdated: (id: string, patch: Partial<GenerationRecord>) => void
  /** 音频封面回退链算出的那一张（与瓦片同一张）。 */
  audioCoverUrl?: string
}

const outlinePill =
  'inline-flex h-8.5 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-2.75 text-2sm text-foreground transition-colors duration-fast ease-linear hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50'
const outlineIcon =
  'grid size-8.5 shrink-0 place-items-center rounded-full border border-border bg-card text-foreground/75 transition-colors duration-fast ease-linear hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50'
const smallPill =
  'inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-xs text-foreground transition-colors duration-fast ease-linear hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function tileOf(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-asset-tile-id="${CSS.escape(id)}"]`,
  )
}

/**
 * 素材的就地查看器（pages/assets.md §3「详情」· 设计画布「A / B 点开 = 就地查看器」）：
 * 盖在大河那一列上，从点的那一格长出来；左边大图 + 缩略轨，右边 340「这张的配方」。
 * 与 LoRA 库 B 的样例查看器同一个形，内容换成素材自己的。
 *
 * ⚠ 顶栏与文件夹栏照常可用：⛔ 遮罩、⛔ 锁焦点。Esc 关、← / → 翻（只在图片之间，
 *   首尾停住不循环）。
 * ⚠ 关上 = 缩回**当前那一张**（翻过页也一样），焦点回到它；那一格滚出去了就
 *   缩回中间。
 */
export function AssetViewer({
  generation,
  images,
  onNavigate,
  onClose,
  folders,
  onCreateFolder,
  onFoldersChanged,
  onFoldersUndone,
  onDeleted,
  onUpdated,
  audioCoverUrl,
}: AssetViewerProps) {
  const t = useTranslations('AssetsPage')
  const tPrompts = useTranslations('PromptLibrary')
  const format = useFormatter()
  const reducedMotion = useReducedMotion()
  const frameRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<HTMLDivElement>(null)
  const [origin, setOrigin] = useState<string | undefined>(undefined)
  const [closing, setClosing] = useState(false)
  const closingRef = useRef(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [recipeCopied, setRecipeCopied] = useState(false)

  const isImage = generation.outputType === 'IMAGE'
  const isVideo = generation.outputType === 'VIDEO'
  const isAudio = generation.outputType === 'AUDIO'
  const is3D = generation.outputType === 'MODEL_3D'
  const index = isImage
    ? images.findIndex((item) => item.id === generation.id)
    : -1
  const total = images.length
  const hasRail = index >= 0 && total > 1
  const canPrev = hasRail && index > 0
  const canNext = hasRail && index < total - 1

  /** 那一格的中心（相对查看器外框）；那一格不在眼前就是外框中心。 */
  const originFor = useCallback((id: string): string => {
    const frame = frameRef.current
    if (!frame) return 'center'
    const box = frame.getBoundingClientRect()
    const tile = tileOf(id)
    if (tile) {
      const rect = tile.getBoundingClientRect()
      const x = rect.left + rect.width / 2 - box.left
      const y = rect.top + rect.height / 2 - box.top
      if (x >= 0 && y >= 0 && x <= box.width && y <= box.height) {
        return `${x}px ${y}px`
      }
    }
    return `${box.width / 2}px ${box.height / 2}px`
  }, [])

  // 从点的那一格长出来：第一帧画之前就把原点落到那一格上。
  const openedIdRef = useRef(generation.id)
  useLayoutEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    frame.style.setProperty(
      '--asset-viewer-origin',
      originFor(openedIdRef.current),
    )
  }, [originFor])

  const requestClose = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    setOrigin(originFor(generation.id))
    setClosing(true)
  }, [generation.id, originFor])

  const finishClose = useCallback(() => {
    const button = tileOf(generation.id)?.querySelector('button')
    button?.focus({ preventScroll: true })
    onClose()
  }, [generation.id, onClose])

  const actions = useAssetDetailActions({
    generation,
    onLeave: (reason) => {
      // 做同款要换页：直接放下；删除：缩回那一格再放下。
      if (reason === 'remix') onClose()
      else requestClose()
    },
    onDeleted,
    onUpdated,
  })

  // Esc 关 · ← / → 翻。菜单、确认框、发布范围开着时各自接键（Radix 先
  // `preventDefault`），输入框里的方向键也不抢。
  useEffect(() => {
    if (closing) return
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (
        menuOpen ||
        confirmDelete ||
        actions.isPublishScopeOpen ||
        actions.coverPickerOpen
      ) {
        return
      }
      const target = event.target instanceof Element ? event.target : null
      if (
        target?.closest(
          'input, textarea, select, [contenteditable="true"], [role="menu"], [role="listbox"]',
        )
      ) {
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        requestClose()
      } else if (event.key === 'ArrowLeft' && canPrev) {
        event.preventDefault()
        onNavigate(images[index - 1])
      } else if (event.key === 'ArrowRight' && canNext) {
        event.preventDefault()
        onNavigate(images[index + 1])
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [
    actions.coverPickerOpen,
    actions.isPublishScopeOpen,
    canNext,
    canPrev,
    closing,
    confirmDelete,
    images,
    index,
    menuOpen,
    onNavigate,
    requestClose,
  ])

  // 缩略轨：当前那一张滚到中间。
  useEffect(() => {
    const current = railRef.current?.querySelector('[aria-current="true"]')
    current?.scrollIntoView({
      block: 'nearest',
      inline: 'center',
      behavior: reducedMotion ? 'auto' : 'smooth',
    })
  }, [index, reducedMotion])

  // 这一张在哪些夹里（加入文件夹面板改完再以它为准）。
  const [membership, setMembership] = useState<{
    id: string
    folderIds: readonly string[]
  } | null>(null)
  const [membershipRevision, setMembershipRevision] = useState(0)
  useEffect(() => {
    let cancelled = false
    const id = generation.id
    void (async () => {
      const response = await getFolderMembershipsAPI([id])
      if (!cancelled && response.success && response.data) {
        setMembership({ id, folderIds: response.data[id] ?? [] })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [generation.id, membershipRevision])
  const folderIds =
    membership?.id === generation.id ? membership.folderIds : null
  const memberFolders = folderIds
    ? folders.filter((folder) => folderIds.includes(folder.id))
    : []

  const copyRecipe = async () => {
    try {
      await navigator.clipboard.writeText(buildAssetRecipeText(generation))
      setRecipeCopied(true)
      window.setTimeout(() => setRecipeCopied(false), COPIED_ACK_MS)
    } catch {
      toast.error(t('viewer.copyFailed'))
    }
  }

  const isUpload =
    generation.model === USER_UPLOAD_PROVIDER ||
    generation.provider === USER_UPLOAD_PROVIDER
  const isLiked = Boolean(generation.isLiked)
  const ratio =
    isAudio || is3D
      ? 1
      : generation.width > 0 && generation.height > 0
        ? generation.width / generation.height
        : 1
  const seed = formatGenerationSeed(generation.seed)
  const durationLabel =
    typeof generation.duration === 'number' && generation.duration > 0
      ? formatDuration(Math.round(generation.duration))
      : null
  const sizeLine = [
    generation.width > 0 && generation.height > 0
      ? `${generation.width}×${generation.height}`
      : null,
    durationLabel,
    seed ? t('viewer.seed', { seed }) : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const createdLine = [
    format.dateTime(new Date(generation.createdAt), {
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    isUpload ? t('viewer.localUpload') : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const references = (
    generation.referenceImages?.map((reference) => reference.url) ??
    (generation.referenceImageUrl ? [generation.referenceImageUrl] : [])
  ).slice(0, MAX_REFERENCE_THUMBS)
  const menuZoom = getChipZoomMotion({
    side: 'bottom',
    align: 'end',
    sideOffset: 6,
  })

  const fade = reducedMotion
    ? { duration: DURATION.fast, ease: 'linear' as const }
    : closing
      ? { duration: 0.24, ease: EASE_STANDARD }
      : { duration: DURATION.slow, ease: EASE_STANDARD }

  const row = (label: string, value: ReactNode) => (
    <div className="flex gap-3 text-2sm">
      <span className="w-16 shrink-0 pt-0.5 text-muted-foreground">
        {label}
      </span>
      <div className="min-w-0 flex-1">{value}</div>
    </div>
  )

  return (
    <div ref={frameRef} className="absolute inset-0 pb-4">
      {/* 底色跟着长出来一起淡入：大河在底下被慢慢盖住，关上时再露出来。 */}
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: closing ? 0 : 1, transition: fade }}
        className="absolute inset-0 bg-surface-workbench"
      />
      <motion.div
        role="dialog"
        aria-label={t('viewer.label')}
        data-testid="asset-viewer"
        initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.3 }}
        animate={
          closing
            ? reducedMotion
              ? { opacity: 0, transition: fade }
              : { opacity: 0, scale: 0.3, transition: fade }
            : { opacity: 1, scale: 1, transition: fade }
        }
        onAnimationComplete={() => {
          if (closingRef.current) finishClose()
        }}
        style={{
          transformOrigin: origin ?? 'var(--asset-viewer-origin, center)',
        }}
        className="relative flex h-full overflow-hidden rounded-2xl bg-card shadow-overlay"
      >
        {/* ─── 左：舞台 ─── */}
        <div className="relative flex min-w-0 flex-1 flex-col bg-surface-workbench">
          <div className="flex min-h-0 flex-1 flex-col px-17.5 pb-2 pt-5.5">
            <div className="studio-fit-area flex min-h-0 flex-1 items-center justify-center">
              <div
                style={{ '--studio-fit-ratio': ratio } as CSSProperties}
                className={cn(
                  'studio-fit-box relative overflow-hidden rounded-lg shadow-overlay',
                  isVideo ? 'bg-foreground' : 'bg-muted',
                )}
              >
                <ViewerMedia
                  key={generation.id}
                  generation={generation}
                  audioCoverUrl={audioCoverUrl}
                />
              </div>
            </div>
          </div>
          {hasRail ? (
            <>
              <button
                type="button"
                onClick={() => canPrev && onNavigate(images[index - 1])}
                disabled={!canPrev}
                aria-label={t('detailPreviousImage')}
                className="absolute left-4 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-card text-foreground/75 shadow-float transition-[color,opacity] duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
              >
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => canNext && onNavigate(images[index + 1])}
                disabled={!canNext}
                aria-label={t('detailNextImage')}
                className="absolute right-4 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-card text-foreground/75 shadow-float transition-[color,opacity] duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
              >
                <ChevronRight className="size-4" aria-hidden />
              </button>
              <div
                ref={railRef}
                className="studio-scrollbar shrink-0 overflow-x-auto px-4 pb-3.5 pt-2.5"
              >
                <div className="mx-auto flex w-max gap-1.5">
                  {images.map((item, i) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-label={t('viewer.thumb', { n: i + 1 })}
                      aria-current={i === index ? 'true' : undefined}
                      onClick={() => onNavigate(item)}
                      className={cn(
                        'h-11.5 w-8.5 shrink-0 overflow-hidden rounded-md bg-muted transition-[opacity,box-shadow] duration-fast ease-linear focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        i === index
                          ? 'opacity-100 ring-2 ring-foreground ring-offset-2 ring-offset-surface-workbench'
                          : 'opacity-55 hover:opacity-80',
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- 缩略轨是一排 34px 小图，走派生缩略图直链。 */}
                      <img
                        src={getGenerationThumbnailUrl(item)}
                        alt=""
                        loading="lazy"
                        draggable={false}
                        className="size-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* ─── 右：这张的配方 ─── */}
        <aside className="flex w-85 shrink-0 flex-col gap-3.5 py-4">
          <div className="flex items-center gap-2.5 px-5">
            <b className="text-2sm font-semibold text-foreground">
              {t('viewer.title')}
            </b>
            {hasRail ? (
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {index + 1} / {total}
              </span>
            ) : null}
            <button
              type="button"
              autoFocus
              onClick={requestClose}
              aria-label={t('viewer.close')}
              className="ml-auto grid size-7.5 place-items-center rounded-full bg-muted text-foreground/75 transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1 px-5">
            <button
              type="button"
              onClick={actions.remix}
              className="inline-flex h-8.5 shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 text-2sm font-semibold text-primary-foreground transition-[background-color,transform] duration-fast hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[.98]"
            >
              <Plus className="size-3.5" aria-hidden />
              {t('detailRemix')}
            </button>
            <button
              type="button"
              onClick={() => void actions.toggleFavorite()}
              disabled={actions.isFavoriting}
              aria-pressed={isLiked}
              className={outlinePill}
            >
              <Heart
                weight={isLiked ? 'fill' : 'bold'}
                className="size-3.5"
                aria-hidden
              />
              {isLiked ? t('viewer.favorited') : t('detailFavorite')}
            </button>
            <button
              type="button"
              onClick={() => actions.setIsPublishScopeOpen(true)}
              disabled={actions.isPublishing}
              aria-pressed={generation.isPublic}
              className={outlinePill}
            >
              {generation.isPublic
                ? t('viewer.published')
                : t('viewer.publish')}
            </button>
            <button
              type="button"
              onClick={() => void actions.download()}
              disabled={actions.isDownloading}
              aria-label={
                actions.isDownloading
                  ? t('detailDownloading')
                  : t('detailDownload')
              }
              title={t('detailDownload')}
              className={outlineIcon}
            >
              {actions.isDownloading ? (
                <Spinner size="sm" />
              ) : (
                <Download className="size-3.5" aria-hidden />
              )}
            </button>
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={t('viewer.more')}
                  title={t('viewer.more')}
                  className="grid size-8.5 shrink-0 place-items-center rounded-full text-foreground/75 transition-colors duration-fast hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <MoreHorizontal className="size-4" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={6}
                className={cn('w-50 rounded-2xl p-1.5', menuZoom.className)}
                style={menuZoom.style}
              >
                <DropdownMenuItem
                  onSelect={() => void actions.copyLink()}
                  className="rounded-xl"
                >
                  <Link2 aria-hidden />
                  {t('detailCopyLink')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => void actions.saveRecipe()}
                  disabled={actions.isSavingRecipe}
                  className="rounded-xl"
                >
                  <FileText aria-hidden />
                  {tPrompts('saveAsTemplate')}
                </DropdownMenuItem>
                {isAudio ? (
                  <DropdownMenuItem
                    onSelect={() => actions.setCoverPickerOpen(true)}
                    disabled={actions.isSettingCover}
                    className="rounded-xl"
                  >
                    <ImagePlus aria-hidden />
                    {t('detailSetCover')}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setConfirmDelete(true)}
                  disabled={actions.isDeleting}
                  className="rounded-xl"
                >
                  <Trash2 aria-hidden />
                  {t('detailDelete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="studio-scrollbar flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5">
            {generation.prompt.trim() ? (
              <ViewerPrompt key={generation.id} text={generation.prompt} />
            ) : (
              <p className="text-2sm text-muted-foreground">
                {t('viewer.noPrompt')}
              </p>
            )}

            <div className="flex flex-col gap-2">
              {row(
                t('viewer.negative'),
                <span className="break-words font-mono text-xs leading-5 text-foreground">
                  {generation.negativePrompt?.trim() || '—'}
                </span>,
              )}
              {!isUpload && generation.model
                ? row(
                    t('detailModel'),
                    <span className="break-all font-mono text-xs leading-5 text-foreground">
                      {generation.model}
                    </span>,
                  )
                : null}
              {sizeLine
                ? row(
                    t('detailDimensions'),
                    <span className="font-mono text-xs leading-5 tabular-nums text-foreground">
                      {sizeLine}
                    </span>,
                  )
                : null}
              {row(
                t('viewer.createdAt'),
                <span className="text-xs leading-5 text-foreground">
                  {createdLine}
                </span>,
              )}
            </div>

            <div className="flex flex-col gap-2">
              <h5 className="text-2xs font-semibold text-muted-foreground">
                {t('viewer.folders')}
              </h5>
              <div className="flex flex-wrap gap-1.5">
                {memberFolders.map((folder) => (
                  <span
                    key={folder.id}
                    className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border border-border pl-1.5 pr-2.5 text-xs text-foreground"
                  >
                    {folder.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- 夹的封面就是一张缩略图直链。
                      <img
                        src={folder.coverUrl}
                        alt=""
                        className="size-4 shrink-0 rounded-sm object-cover"
                      />
                    ) : (
                      <span className="size-4 shrink-0 rounded-sm bg-muted" />
                    )}
                    <span className="truncate">{folder.name}</span>
                  </span>
                ))}
                <AssetAddToFolderPanel
                  assetIds={[generation.id]}
                  folders={folders}
                  onCreateFolder={onCreateFolder}
                  onChanged={(memberships) => {
                    setMembership({
                      id: generation.id,
                      folderIds: memberships[generation.id] ?? [],
                    })
                    onFoldersChanged(memberships)
                  }}
                  onUndone={() => {
                    setMembershipRevision((value) => value + 1)
                    onFoldersUndone()
                  }}
                  side="bottom"
                  align="start"
                  trigger={
                    <button
                      type="button"
                      className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-border px-2.5 text-xs text-muted-foreground transition-colors duration-fast hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Plus className="size-3" aria-hidden />
                      {t('addToFolder')}
                    </button>
                  }
                />
              </div>
            </div>

            {references.length > 0 ? (
              <div className="flex flex-col gap-2">
                <h5 className="text-2xs font-semibold text-muted-foreground">
                  {t('viewer.references')}
                </h5>
                <div className="flex flex-wrap gap-1.5">
                  {references.map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element -- 参考图是生成时带的直链。
                    <img
                      key={`${url}-${i}`}
                      src={url}
                      alt={t('viewer.referenceAlt', { n: i + 1 })}
                      loading="lazy"
                      className="h-14.5 w-11 rounded-lg bg-muted object-cover"
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {isVideo ? (
              <VideoAnalysisPanel
                key={generation.id}
                videoUrl={generation.url}
              />
            ) : null}
          </div>

          <div className="flex items-center gap-2 px-5">
            {generation.prompt.trim() ? (
              <button
                type="button"
                onClick={() => void copyRecipe()}
                className={smallPill}
              >
                {recipeCopied ? (
                  <Check className="size-3.5" aria-hidden />
                ) : (
                  <Copy className="size-3.5" aria-hidden />
                )}
                {recipeCopied ? t('viewer.copied') : t('viewer.copyRecipe')}
              </button>
            ) : null}
            <button
              type="button"
              onClick={actions.openOriginal}
              className={smallPill}
            >
              <ArrowUpRight className="size-3.5" aria-hidden />
              {t('viewer.openOriginal')}
            </button>
          </div>
        </aside>
      </motion.div>

      <AssetDetailOverlays generation={generation} actions={actions} />
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('detailDeleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('detailDeleteConfirmDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('detailDeleteCancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void actions.remove()}
            >
              {t('detailDelete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** 舞台上的那一件：图片 · 视频 · 音频（封面 + 播放器）· 3D。换一张 200 淡入。 */
function ViewerMedia({
  generation,
  audioCoverUrl,
}: {
  generation: GenerationRecord
  audioCoverUrl?: string
}) {
  const tModel = useTranslations('Model3DGenerate')
  const fadeIn =
    'animate-in fade-in-0 duration-base ease-linear motion-reduce:animate-none'

  if (generation.outputType === 'VIDEO') {
    return (
      <video
        src={generation.url}
        poster={getGenerationVideoPosterUrl(generation) ?? undefined}
        controls
        playsInline
        className={cn('size-full object-contain', fadeIn)}
      />
    )
  }
  if (generation.outputType === 'AUDIO') {
    return (
      <div className={cn('absolute inset-0', fadeIn)}>
        {audioCoverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- 音频封面可以是 provider / 模型配置的直链。
          <img
            src={audioCoverUrl}
            alt=""
            className="absolute inset-0 size-full object-cover"
          />
        ) : null}
        <div className="absolute inset-x-3 bottom-3">
          <audio src={generation.url} controls className="w-full" />
        </div>
      </div>
    )
  }
  if (generation.outputType === 'MODEL_3D') {
    if (!generation.modelUrl) {
      return (
        <span className="absolute inset-0 grid place-items-center text-muted-foreground">
          <Box className="size-6" aria-hidden />
        </span>
      )
    }
    return (
      <ModelViewer
        src={generation.modelUrl}
        poster={getGenerationModel3DVisualUrl(generation) ?? undefined}
        alt={generation.prompt || '3D model'}
        loadingLabel={tModel('viewerLoading')}
        className={cn('size-full', fadeIn)}
      />
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 大图用派生预览直链，比例已由外框锁住。
    <img
      src={getGenerationPreviewUrl(generation)}
      alt={generation.prompt || generation.id}
      draggable={false}
      className={cn('size-full object-cover', fadeIn)}
    />
  )
}

/** 提示词：等宽，折到 6 行；「展开全部 / 收起」高度走弹簧；复制键上换字 1.2 秒。 */
function ViewerPrompt({ text }: { text: string }) {
  const t = useTranslations('AssetsPage')
  const reducedMotion = useReducedMotion()
  const textRef = useRef<HTMLParagraphElement>(null)
  const [fullHeight, setFullHeight] = useState<number | null>(null)
  const [expanded, setExpanded] = useState(false)
  // 只有点「展开 / 收起」才走弹簧；量出来的高度（首帧、窗口变宽）瞬间落位。
  const [userToggled, setUserToggled] = useState(false)
  const [copied, setCopied] = useState(false)

  useLayoutEffect(() => {
    const node = textRef.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      setFullHeight(node.offsetHeight)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const overflowing =
    fullHeight !== null && fullHeight > PROMPT_COLLAPSED_HEIGHT + 1
  const target =
    fullHeight === null
      ? PROMPT_COLLAPSED_HEIGHT
      : expanded
        ? fullHeight
        : Math.min(fullHeight, PROMPT_COLLAPSED_HEIGHT)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), COPIED_ACK_MS)
    } catch {
      toast.error(t('viewer.copyFailed'))
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h5 className="text-2xs font-semibold text-muted-foreground">
          {t('detailPrompt')}
        </h5>
        <button
          type="button"
          onClick={() => void copy()}
          className="ml-auto inline-flex items-center gap-1 rounded-md px-1 text-xs text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {copied ? (
            <Check className="size-3" aria-hidden />
          ) : (
            <Copy className="size-3" aria-hidden />
          )}
          {copied ? t('viewer.copied') : t('viewer.copy')}
        </button>
      </div>
      <div className="rounded-lg bg-muted/60 px-2.5 py-2 ring-1 ring-inset ring-border/60">
        {/* 量出来之前按收着的高度摆；⛔ 从整段高度弹下来一次。 */}
        <motion.div
          initial={false}
          animate={{ height: target }}
          transition={
            reducedMotion || !userToggled
              ? { duration: 0 }
              : expanded
                ? LIQUID_SPRING.unfold
                : LIQUID_SPRING.retract
          }
          className="overflow-hidden"
        >
          <p
            ref={textRef}
            className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-foreground"
          >
            {text}
          </p>
        </motion.div>
      </div>
      {overflowing ? (
        <button
          type="button"
          onClick={() => {
            setUserToggled(true)
            setExpanded((value) => !value)
          }}
          aria-expanded={expanded}
          className="self-start rounded-md text-xs text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {expanded ? t('viewer.collapse') : t('viewer.expand')}
        </button>
      ) : null}
    </div>
  )
}
