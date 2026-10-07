'use client'

import {
  ArrowLeft,
  ArrowUpRight,
  Box,
  Check,
  Download,
  Link2,
  FileText,
  FolderInput,
  Globe,
  GlobeLock,
  Heart,
  ImagePlus,
  Mic,
  Sparkles,
  Trash2,
} from '@/components/icons'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import NextImage from 'next/image'

import { ModelViewer } from '@/components/business/ModelViewer'
import {
  MediaDetailViewer,
  type MediaTransitionOrigin,
} from '@/components/business/MediaDetailViewer'
import { VideoAnalysisPanel } from '@/components/business/vision/VideoAnalysisPanel'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Spinner } from '@/components/ui/spinner'
import { ROUTES } from '@/constants/routes'
import { Link, useRouter } from '@/i18n/navigation'
import { createProjectAPI } from '@/lib/api-client'
import { AssetAddToFolderPanel } from '@/components/business/assets/AssetAddToFolderPanel'
import { AssetDetailOverlays } from '@/components/business/assets/AssetDetailOverlays'
import { SearchGroundingPublishNote } from '@/components/business/studio-shared/search-grounding/SearchGroundingPublishNote'
import { useAssetDetailActions } from '@/hooks/use-asset-detail-actions'
import {
  getGenerationModel3DVisualUrl,
  getGenerationPreviewUrl,
} from '@/lib/generation-media'
import { cn } from '@/lib/utils'
import type { GenerationRecord, ProjectRecord } from '@/types'

export interface AssetDetailContentProps {
  generation: GenerationRecord | null
  /**
   * `sheet` = 素材网格上的抽屉；`page` = `/assets/[id]` 整页。
   * 两者共用同一份内容层，只有外壳不同。
   */
  layout?: 'sheet' | 'page'
  /** 抽屉关闭回调。整页形态不需要。 */
  onOpenChange?: (open: boolean) => void
  /** 这个用户的文件夹（「加入文件夹」面板列的就是它们）。 */
  folders: ProjectRecord[]
  /** 面板里「新建文件夹并放进去」。不给就直接建（`/assets/[id]` 整页）。 */
  onCreateFolder?: (name: string) => Promise<ProjectRecord | null>
  /** 放进 / 拿出落库之后（素材页据此改计数、把离开当前范围的那一张拿掉）。 */
  onFoldersChanged?: (memberships: Record<string, string[]>) => void
  /** 撤销落库之后。 */
  onFoldersUndone?: () => void
  /** Called after a successful delete so the parent can prune the grid + refresh counts. */
  onDeleted?: (id: string) => void
  /** Called after publish/favorite toggles so the grid mirrors the new state. */
  onUpdated?: (id: string, patch: Partial<GenerationRecord>) => void
  transitionOrigin?: MediaTransitionOrigin | null
  imageNavigation?: {
    canGoPrevious: boolean
    canGoNext: boolean
    direction: -1 | 1
    onPrevious: () => void
    onNext: () => void
  }
}

/**
 * Shared asset detail body. Shows the preview, the
 * captured prompt/model/timing metadata, and three actions: Remix in
 * Studio (jumps to /studio/<mode>?remix=<id>), Move to Folder (assigns
 * the generation to a project), and Delete (with confirm).
 */
export function AssetDetailContent({
  generation,
  layout = 'sheet',
  onOpenChange,
  folders,
  onCreateFolder,
  onFoldersChanged,
  onFoldersUndone,
  onDeleted,
  onUpdated,
  transitionOrigin,
  imageNavigation,
}: AssetDetailContentProps) {
  const t = useTranslations('AssetsPage')
  const tCommon = useTranslations('Common')
  const tPrompts = useTranslations('PromptLibrary')
  const router = useRouter()
  const isPage = layout === 'page'
  /** 整页形态里新建的夹（素材页形态由父级的列表带回来）。 */
  const [createdFolders, setCreatedFolders] = useState<ProjectRecord[]>([])
  const panelFolders = [
    ...folders,
    ...createdFolders.filter(
      (created) => !folders.some((folder) => folder.id === created.id),
    ),
  ]
  const createFolderForPanel = async (name: string) => {
    if (onCreateFolder) return onCreateFolder(name)
    const response = await createProjectAPI({ name, parentId: null })
    if (!response.success || !response.data) return null
    const created = response.data
    setCreatedFolders((prev) => [...prev, created])
    return created
  }

  /**
   * 抽屉里就是关掉面板；整页里没有可关的层，退回素材库。
   * 做同款在整页里本来就换了路由，不用再退。
   */
  const actions = useAssetDetailActions({
    generation,
    onLeave: (reason) => {
      if (isPage) {
        if (reason === 'delete') router.push(ROUTES.ASSETS)
        return
      }
      onOpenChange?.(false)
    },
    onDeleted,
    onUpdated,
  })
  const {
    isDeleting,
    isPublishing,
    isFavoriting,
    isSavingRecipe,
    isDownloading,
    isLinkCopied,
    isSettingCover,
  } = actions

  const open = generation !== null

  if (!generation) return null

  const isAudioAsset = generation.outputType === 'AUDIO'
  const isVideoAsset = generation.outputType === 'VIDEO'
  // 「先搜再画」出的图按条款只能自己看：地球钮置灰，原因写在图标行下面。
  const publishBlocked =
    Boolean(generation.searchGrounded) && !generation.isPublic

  const previewUrl = getGenerationPreviewUrl(generation)
  const toolbarActions = (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        className="rounded-full text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        onClick={() => void actions.download()}
        disabled={isDownloading}
        aria-label={
          isDownloading ? t('detailDownloading') : t('detailDownload')
        }
      >
        <Download className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="rounded-full text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        onClick={() => void actions.copyLink()}
        aria-label={t('detailCopyLink')}
      >
        {isLinkCopied ? (
          <Check className="size-4" />
        ) : (
          <Link2 className="size-4" />
        )}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="rounded-full text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        onClick={actions.openOriginal}
        aria-label={t('detailOpenOriginal')}
      >
        <ArrowUpRight className="size-4" />
      </Button>
    </>
  )
  const sideHeader = (
    <div className="space-y-1.5">
      <h2 className="text-base font-medium">{t('detailTitle')}</h2>
      <p className="text-xs leading-5 text-muted-foreground">
        {generation.model}
      </p>
    </div>
  )
  const sideContent = (
    <>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <Field
          label={t('detailPrompt')}
          value={generation.prompt || '—'}
          multiline
        />
        <Field label={t('detailModel')} value={generation.model} />
        <Field label={t('detailProvider')} value={generation.provider} />
        <Field
          label={t('detailDimensions')}
          value={`${generation.width} × ${generation.height}`}
        />
        {generation.duration != null && (
          <Field
            label={t('detailDuration')}
            value={`${generation.duration}s`}
          />
        )}
        {generation.seed != null && (
          <Field label={t('detailSeed')} value={String(generation.seed)} />
        )}
        <Field
          label={t('detailCreatedAt')}
          value={new Date(generation.createdAt).toLocaleString()}
        />
      </dl>
      {/*
       * 「分析这个视频」的落点（切片 2 §4.3 的最后一米）。选这里是因为素材页的
       * 视频**一定在我们自己的 R2 上**（CORS 允许名单里有生产域和 localhost），
       * 抽帧拿得到干净的画布；工作台/画布那几个落点要么正在被并行会话改，
       * 要么视频未必落库。`key` 挂 generation.id：换一条素材要从空态重新开始，
       * ⛔ 不能把上一条视频的观察留在屏幕上。
       */}
      {isVideoAsset ? (
        <VideoAnalysisPanel key={generation.id} videoUrl={generation.url} />
      ) : null}
    </>
  )
  const footerActions = (
    <div className="space-y-2">
      <Button
        variant="default"
        size="sm"
        className="w-full gap-1.5 rounded-full"
        onClick={actions.remix}
      >
        <Sparkles className="size-4" />
        {t('detailRemix')}
      </Button>
      <div className="flex flex-wrap items-center gap-1">
        <AssetAddToFolderPanel
          assetIds={[generation.id]}
          folders={panelFolders}
          onCreateFolder={createFolderForPanel}
          onChanged={(memberships) => onFoldersChanged?.(memberships)}
          onUndone={() => onFoldersUndone?.()}
          side="top"
          align="start"
          trigger={
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('addToFolder')}
              title={t('addToFolder')}
            >
              <FolderInput className="size-4" />
            </Button>
          }
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => actions.setIsPublishScopeOpen(true)}
          aria-label={
            generation.isPublic ? t('detailPublishScope') : t('detailPublish')
          }
          title={
            generation.isPublic ? t('detailPublishScope') : t('detailPublish')
          }
          disabled={isPublishing || publishBlocked}
          aria-pressed={generation.isPublic}
          aria-describedby={
            publishBlocked ? 'asset-detail-publish-note' : undefined
          }
          className="transition-[background-color,color,opacity]"
        >
          {isPublishing ? (
            <Spinner size="md" />
          ) : generation.isPublic ? (
            <GlobeLock className="size-4" />
          ) : (
            <Globe className="size-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            generation.isLiked && 'text-primary hover:text-primary',
          )}
          onClick={() => void actions.toggleFavorite()}
          aria-label={
            generation.isLiked ? t('detailUnfavorite') : t('detailFavorite')
          }
          title={
            generation.isLiked ? t('detailUnfavorite') : t('detailFavorite')
          }
          disabled={isFavoriting}
          aria-pressed={!!generation.isLiked}
        >
          {isFavoriting ? (
            <Spinner size="md" />
          ) : (
            <Heart
              weight={generation.isLiked ? 'fill' : 'bold'}
              className="size-4"
            />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void actions.saveRecipe()}
          aria-label={tPrompts('saveAsTemplate')}
          title={tPrompts('saveAsTemplate')}
          disabled={isSavingRecipe}
        >
          {isSavingRecipe ? (
            <Spinner size="md" />
          ) : (
            <FileText className="size-4" />
          )}
        </Button>
        {isAudioAsset && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => actions.setCoverPickerOpen(true)}
            aria-label={t('detailSetCover')}
            title={t('detailSetCover')}
            disabled={isSettingCover}
          >
            {isSettingCover ? (
              <Spinner size="md" />
            ) : (
              <ImagePlus className="size-4" />
            )}
          </Button>
        )}
        <ConfirmDialog
          title={t('detailDeleteConfirmTitle')}
          description={t('detailDeleteConfirmDescription')}
          cancelLabel={t('detailDeleteCancel')}
          confirmLabel={t('detailDelete')}
          variant="destructive"
          onConfirm={actions.remove}
          trigger={
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto text-status-risk hover:bg-status-risk-surface hover:text-status-risk"
              aria-label={t('detailDelete')}
              title={t('detailDelete')}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Spinner size="md" />
              ) : (
                <Trash2 className="size-4" />
              )}
            </Button>
          }
        />
      </div>
      <SearchGroundingPublishNote
        id="asset-detail-publish-note"
        show={publishBlocked}
      />
    </div>
  )

  const shell = isPage ? (
    <div className="editorial-page">
      <div className="editorial-container max-w-5xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="rounded-full text-muted-foreground"
          >
            <Link href={ROUTES.ASSETS}>
              <ArrowLeft className="size-3.5" />
              {t('detailBackToAssets')}
            </Link>
          </Button>
          <div className="flex items-center gap-1">{toolbarActions}</div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="flex items-start justify-center overflow-hidden rounded-3xl border border-border/75 bg-secondary/18 p-4">
            <Preview generation={generation} />
          </div>
          <div className="space-y-5 rounded-3xl border border-border/75 bg-card p-5">
            {sideHeader}
            {sideContent}
            {footerActions}
          </div>
        </div>
      </div>
    </div>
  ) : (
    <MediaDetailViewer
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) actions.setIsPublishScopeOpen(false)
        onOpenChange?.(nextOpen)
      }}
      title={t('detailTitle')}
      description={t('detailDescription')}
      closeLabel={tCommon('close')}
      media={<Preview generation={generation} />}
      mediaKey={generation.id}
      sideHeader={sideHeader}
      sideContent={sideContent}
      footerActions={footerActions}
      toolbarActions={toolbarActions}
      navigation={
        imageNavigation
          ? {
              previousLabel: t('detailPreviousImage'),
              nextLabel: t('detailNextImage'),
              ...imageNavigation,
            }
          : undefined
      }
      transitionOrigin={transitionOrigin}
      transitionImageSrc={previewUrl}
      transitionImageAlt={generation.prompt || generation.id}
    />
  )

  return (
    <>
      {shell}
      <AssetDetailOverlays generation={generation} actions={actions} />
    </>
  )
}

function Preview({ generation }: { generation: GenerationRecord }) {
  if (generation.outputType === 'VIDEO') {
    return (
      <video
        src={generation.url}
        controls
        playsInline
        className="max-h-[calc(48dvh-4rem)] max-w-full rounded-2xl border border-border/60 bg-black/40 object-contain lg:max-h-[calc(100dvh-8rem)]"
      />
    )
  }
  if (generation.outputType === 'AUDIO') {
    return (
      <div className="flex min-h-64 w-[min(34rem,90vw)] max-w-full flex-col items-center justify-center gap-3 rounded-2xl border border-border/60 bg-muted/30 p-6">
        <Mic className="size-10 text-muted-foreground" />
        <audio src={generation.url} controls className="w-full max-w-[360px]" />
      </div>
    )
  }
  if (generation.outputType === 'MODEL_3D' && generation.modelUrl) {
    // Render the actual GLB. `url` is the poster PNG (uploaded by the
    // client ModelViewer after first paint, see M3.B); `modelUrl` is the
    // GLB itself. Poster used as the initial frame so the viewer doesn't
    // flash empty while the mesh downloads.
    return <Model3DPreview generation={generation} />
  }
  return (
    <div className="relative z-10 flex max-h-full max-w-full items-center justify-center">
      <NextImage
        src={getGenerationPreviewUrl(generation)}
        alt={generation.prompt || generation.id}
        width={Math.max(generation.width, 1)}
        height={Math.max(generation.height, 1)}
        sizes="(max-width: 1024px) 92vw, 58vw"
        className="h-auto max-h-[calc(48dvh-4rem)] max-w-full rounded-2xl object-contain shadow-sm lg:max-h-[calc(100dvh-8rem)]"
        unoptimized
      />
    </div>
  )
}

/**
 * 3D preview block — viewer + dedicated Download GLB and AR action buttons.
 * The AR button uses model-viewer's `slot="ar-button"` so it replaces the
 * default AR icon and is automatically wired to launch AR (or show a QR
 * fallback on devices that can't handle WebXR / Scene Viewer / Quick Look).
 */
function Model3DPreview({ generation }: { generation: GenerationRecord }) {
  const t = useTranslations('Model3DGenerate')
  if (!generation.modelUrl) return null
  return (
    <div className="flex w-[min(42rem,90vw)] max-w-full flex-col gap-2">
      <div className="aspect-square max-h-[calc(48dvh-4rem)] w-full overflow-hidden rounded-2xl border border-border/60 bg-muted/40 lg:max-h-[calc(100dvh-12rem)]">
        <ModelViewer
          src={generation.modelUrl}
          poster={getGenerationModel3DVisualUrl(generation) ?? undefined}
          alt={generation.prompt || '3D model'}
          loadingLabel={t('viewerLoading')}
          className="h-full w-full"
        >
          {/*
           * model-viewer recognises `slot="ar-button"` and wires it so any
           * click triggers AR launch. Restyles the default green AR pill
           * to match the editorial surface here.
           */}
          <button
            slot="ar-button"
            type="button"
            className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background shadow-sm hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <Box className="size-3.5" />
            {t('openInAR')}
          </button>
        </ModelViewer>
      </div>
      <div className="flex gap-2">
        <Button asChild variant="secondary" size="sm" className="flex-1">
          <a href={generation.modelUrl} download>
            <Download className="mr-1.5 size-3.5" />
            {t('downloadGlb')}
          </a>
        </Button>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  multiline,
}: {
  label: string
  value: string
  multiline?: boolean
}) {
  return (
    <>
      <dt className="font-medium text-muted-foreground/80">{label}</dt>
      <dd
        className={
          multiline
            ? 'whitespace-pre-wrap break-words text-foreground'
            : 'break-words text-foreground'
        }
      >
        {value}
      </dd>
    </>
  )
}
