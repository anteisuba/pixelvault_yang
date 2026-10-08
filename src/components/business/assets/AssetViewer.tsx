'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  ArrowUpRight,
  Check,
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
import { COPIED_ACK_MS } from '@/constants/motion'
import { USER_UPLOAD_PROVIDER } from '@/constants/uploads'
import type { GenerationRecord, ProjectRecord } from '@/types'
import { AssetAddToFolderPanel } from '@/components/business/assets/AssetAddToFolderPanel'
import { AssetDetailOverlays } from '@/components/business/assets/AssetDetailOverlays'
import { getChipZoomMotion } from '@/components/business/studio-shared/primitives/tool-surface'
import { SearchGroundingPublishNote } from '@/components/business/studio-shared/search-grounding/SearchGroundingPublishNote'
import {
  InPlaceViewer,
  useInPlaceViewer,
} from '@/components/business/viewer/InPlaceViewer'
import {
  ViewerMedia,
  viewerRatioOf,
} from '@/components/business/viewer/ViewerMedia'
import { ViewerPrompt } from '@/components/business/viewer/ViewerPrompt'
import {
  COPY_ACK_CLASS,
  VIEWER_OUTLINE_ICON,
  VIEWER_OUTLINE_PILL,
  VIEWER_SMALL_PILL,
} from '@/components/business/viewer/viewer-classes'
import { VideoAnalysisPanel } from '@/components/business/vision/VideoAnalysisPanel'
import { BlurSwap } from '@/components/ui/blur-swap'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { RollingNumber } from '@/components/ui/rolling-number'
import {
  FeedbackButton,
  useButtonFeedback,
} from '@/components/ui/feedback-button'
import { Spinner } from '@/components/ui/spinner'
import { useAssetDetailActions } from '@/hooks/use-asset-detail-actions'
import { getFolderMembershipsAPI } from '@/lib/api-client/projects'
import {
  buildAssetRecipeText,
  formatGenerationSeed,
} from '@/lib/asset-recipe-text'
import { getGenerationThumbnailUrl } from '@/lib/generation-media'
import { cn } from '@/lib/utils'
import { formatDuration } from '@/lib/video-utils'

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
  /** 撤销删除：把这一张放回原处（删除先在界面上生效，5 秒后才落库）。 */
  onRestored: (generation: GenerationRecord) => void
  onUpdated: (id: string, patch: Partial<GenerationRecord>) => void
  /** 音频封面回退链算出的那一张（与瓦片同一张）。 */
  audioCoverUrl?: string
}

/**
 * 素材的就地查看器（pages/assets.md §3「详情」· 设计画布「A / B 点开 = 就地查看器」）：
 * 外壳是共用的 `InPlaceViewer`（长出来 / 缩回去 · 舞台 · 缩略轨 · Esc 与方向键），
 * 这里只给舞台上的那一件和右边 340「这张的配方」。
 */
export function AssetViewer(props: AssetViewerProps) {
  const t = useTranslations('AssetsPage')
  const { generation, images, onNavigate, onClose, audioCoverUrl } = props

  return (
    <InPlaceViewer
      current={generation}
      items={generation.outputType === 'IMAGE' ? images : []}
      onNavigate={onNavigate}
      onClose={onClose}
      label={t('viewer.label')}
      tileAttribute="data-asset-tile-id"
      ratioOf={viewerRatioOf}
      darkStage={generation.outputType === 'VIDEO'}
      media={
        <ViewerMedia
          key={generation.id}
          generation={generation}
          audioCoverUrl={audioCoverUrl}
        />
      }
      thumbnailOf={getGenerationThumbnailUrl}
      thumbLabel={(n) => t('viewer.thumb', { n })}
      previousLabel={t('detailPreviousImage')}
      nextLabel={t('detailNextImage')}
    >
      <AssetViewerAside {...props} />
    </InPlaceViewer>
  )
}

/** 右边 340「这张的配方」：动作、提示词、元信息、所在文件夹、参考图。 */
function AssetViewerAside({
  generation,
  onClose,
  folders,
  onCreateFolder,
  onFoldersChanged,
  onFoldersUndone,
  onDeleted,
  onRestored,
  onUpdated,
}: AssetViewerProps) {
  const api = useInPlaceViewer()
  const t = useTranslations('AssetsPage')
  const tFeedback = useTranslations('Feedback')
  const downloadFeedback = useButtonFeedback()
  const tPrompts = useTranslations('PromptLibrary')
  const format = useFormatter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [recipeCopied, setRecipeCopied] = useState(false)
  const isVideo = generation.outputType === 'VIDEO'
  const isAudio = generation.outputType === 'AUDIO'

  const actions = useAssetDetailActions({
    generation,
    onLeave: (reason) => {
      // 做同款要换页：直接放下；删除：缩回那一格再放下。
      if (reason === 'remix') onClose()
      else api.requestClose()
    },
    onDeleted,
    onRestored,
    onUpdated,
  })

  // 菜单、确认框、发布范围、封面挑图开着时，Esc 与方向键归它们。
  const { setKeyboardBlocked } = api
  const overlayOpen =
    menuOpen ||
    confirmDelete ||
    actions.isPublishScopeOpen ||
    actions.coverPickerOpen
  useEffect(() => {
    setKeyboardBlocked(overlayOpen)
  }, [overlayOpen, setKeyboardBlocked])

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
  // 「先搜再画」出的图按条款只能自己看：「发布」置灰，原因写在操作行下面。
  const publishBlocked =
    Boolean(generation.searchGrounded) && !generation.isPublic
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

  const row = (label: string, value: ReactNode) => (
    <div className="flex gap-3 text-2sm">
      <span className="w-16 shrink-0 pt-0.5 text-muted-foreground">
        {label}
      </span>
      <div className="min-w-0 flex-1">{value}</div>
    </div>
  )

  return (
    <>
      <div className="flex items-center gap-2.5 px-5">
        <b className="text-2sm font-semibold text-foreground">
          {t('viewer.title')}
        </b>
        {api.hasRail ? (
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            <span className="sr-only">
              {api.index + 1} / {api.total}
            </span>
            {/* 翻图时第几张往上 / 往下滚（原型 K）。 */}
            <span aria-hidden className="inline-flex items-center gap-1">
              <RollingNumber value={api.index + 1} />
              <span>/ {api.total}</span>
            </span>
          </span>
        ) : null}
        <button
          type="button"
          autoFocus
          onClick={api.requestClose}
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
          className={VIEWER_OUTLINE_PILL}
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
          disabled={actions.isPublishing || publishBlocked}
          aria-pressed={generation.isPublic}
          aria-describedby={
            publishBlocked ? 'asset-viewer-publish-note' : undefined
          }
          className={cn(
            VIEWER_OUTLINE_PILL,
            'transition-[background-color,opacity]',
          )}
        >
          {generation.isPublic ? t('viewer.published') : t('viewer.publish')}
        </button>
        {/* 下载的结果在键上说（owner 2026-10-08「提示与弹窗」第 1 题 B）：键拉长变黑
            写「✓ 已开始下载」，1.6 秒后缩回，⛔ 弹条。 */}
        <FeedbackButton
          feedback={downloadFeedback.feedback}
          onClick={() =>
            void actions.download().then((started) => {
              if (started)
                downloadFeedback.show({ label: tFeedback('downloadStarted') })
            })
          }
          disabled={actions.isDownloading}
          aria-label={
            actions.isDownloading ? t('detailDownloading') : t('detailDownload')
          }
          title={t('detailDownload')}
          className={VIEWER_OUTLINE_ICON}
        >
          {actions.isDownloading ? (
            <Spinner size="sm" />
          ) : (
            <Download className="size-3.5" aria-hidden />
          )}
        </FeedbackButton>
        <DropdownMenu
          open={menuOpen}
          onOpenChange={(open) => {
            setMenuOpen(open)
            if (!open) setConfirmDelete(false)
          }}
        >
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
            {/* 删除要点两次：第一次原地变成红底「确认删除」、菜单不关；再点才删（owner 2026-10-08
                「提示与弹窗」第 2 题 B）。删掉之后这一张连同查看器一起消失，「撤销」在底部黑条上。 */}
            <DropdownMenuItem
              variant="destructive"
              onSelect={(event) => {
                if (!confirmDelete) {
                  event.preventDefault()
                  setConfirmDelete(true)
                  return
                }
                setConfirmDelete(false)
                void actions.remove()
              }}
              disabled={actions.isDeleting}
              data-armed={confirmDelete || undefined}
              className="rounded-xl transition-[background-color,color] duration-fast ease-standard data-[armed]:justify-center data-[armed]:bg-destructive data-[armed]:text-destructive-foreground data-[armed]:focus:bg-destructive data-[armed]:focus:text-destructive-foreground"
            >
              <BlurSwap
                swapKey={confirmDelete ? 'armed' : 'idle'}
                className="gap-2"
              >
                {confirmDelete ? null : <Trash2 aria-hidden />}
                {confirmDelete ? t('viewer.deleteArm') : t('detailDelete')}
              </BlurSwap>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <SearchGroundingPublishNote
        id="asset-viewer-publish-note"
        show={publishBlocked}
        className="px-5"
      />

      <div className="studio-scrollbar flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5">
        {generation.prompt.trim() ? (
          <ViewerPrompt
            key={generation.id}
            text={generation.prompt}
            labels={{
              title: t('detailPrompt'),
              copy: t('viewer.copy'),
              copied: t('viewer.copied'),
              copyFailed: t('viewer.copyFailed'),
              expand: t('viewer.expand'),
              collapse: t('viewer.collapse'),
            }}
          />
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
          <VideoAnalysisPanel key={generation.id} videoUrl={generation.url} />
        ) : null}
      </div>

      <div className="flex items-center gap-2 px-5">
        {generation.prompt.trim() ? (
          <button
            type="button"
            onClick={() => void copyRecipe()}
            data-copied={recipeCopied || undefined}
            className={cn(VIEWER_SMALL_PILL, COPY_ACK_CLASS)}
          >
            <BlurSwap
              swapKey={recipeCopied ? 'copied' : 'copy'}
              className="gap-1.5"
            >
              {recipeCopied ? (
                <Check className="size-3.5" aria-hidden />
              ) : (
                <Copy className="size-3.5" aria-hidden />
              )}
              {recipeCopied ? t('viewer.copied') : t('viewer.copyRecipe')}
            </BlurSwap>
          </button>
        ) : null}
        <button
          type="button"
          onClick={actions.openOriginal}
          className={VIEWER_SMALL_PILL}
        >
          <ArrowUpRight className="size-3.5" aria-hidden />
          {t('viewer.openOriginal')}
        </button>
      </div>

      <AssetDetailOverlays generation={generation} actions={actions} />
    </>
  )
}
