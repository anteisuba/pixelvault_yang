'use client'

import {
  ArrowUpRight,
  Box,
  Check,
  Download,
  FileText,
  FolderInput,
  Globe,
  GlobeLock,
  Heart,
  ImagePlus,
  Loader2,
  Mic,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import NextImage from 'next/image'
import { toast } from 'sonner'

import { ModelViewer } from '@/components/business/ModelViewer'
import {
  MediaDetailViewer,
  type MediaTransitionOrigin,
} from '@/components/business/MediaDetailViewer'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useRouter } from '@/i18n/navigation'
import {
  assignGenerationProjectAPI,
  createRecipeFromGenerationAPI,
  deleteGenerationAPI,
  downloadRemoteAsset,
  setAudioCoverAPI,
  setGenerationVisibility,
  toggleLikeAPI,
} from '@/lib/api-client'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { getApiErrorMessage } from '@/lib/api-error-message'
import { getGenerationPreviewUrl } from '@/lib/generation-media'
import { cn } from '@/lib/utils'
import type { GenerationRecord, ProjectRecord } from '@/types'

interface AssetDetailSheetProps {
  generation: GenerationRecord | null
  onOpenChange: (open: boolean) => void
  /** Folders the user can move this generation into. */
  projects: ProjectRecord[]
  /** Called after a successful delete so the parent can prune the grid + refresh counts. */
  onDeleted?: (id: string) => void
  /** Called after a successful folder move so the parent can refresh the affected counts. */
  onMoved?: (id: string, projectId: string | null) => void
  /** Called after publish/favorite toggles so the grid mirrors the new state. */
  onUpdated?: (id: string, patch: Partial<GenerationRecord>) => void
  transitionOrigin?: MediaTransitionOrigin | null
}

type PublishScope = 'private' | 'asset' | 'assetAndPrompt'

interface PublishScopeOptionProps {
  title: string
  description: string
  selected: boolean
  disabled: boolean
  onClick: () => void
}

function getDownloadTarget(generation: GenerationRecord): string {
  if (generation.outputType === 'MODEL_3D' && generation.modelUrl) {
    return generation.modelUrl
  }

  return generation.url
}

function getAssetFileName(generation: GenerationRecord): string {
  if (generation.outputType === 'MODEL_3D' && generation.modelUrl) {
    return `pixelvault-${generation.id.slice(0, 8)}.glb`
  }

  const ext = generation.mimeType.split('/')[1] || 'bin'
  return `pixelvault-${generation.id.slice(0, 8)}.${ext}`
}

function triggerDirectAssetDownload(url: string, fileName: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function openExternalAsset(url: string) {
  const openedWindow = window.open(url, '_blank')
  if (openedWindow) {
    openedWindow.opener = null
    return
  }

  window.location.assign(url)
}

/**
 * Right-side detail panel for an /assets tile. Shows the preview, the
 * captured prompt/model/timing metadata, and three actions: Remix in
 * Studio (jumps to /studio/<mode>?remix=<id>), Move to Folder (assigns
 * the generation to a project), and Delete (with confirm).
 */
export function AssetDetailSheet({
  generation,
  onOpenChange,
  projects,
  onDeleted,
  onMoved,
  onUpdated,
  transitionOrigin,
}: AssetDetailSheetProps) {
  const t = useTranslations('AssetsPage')
  const tCommon = useTranslations('Common')
  const tPrompts = useTranslations('PromptLibrary')
  const tErrors = useTranslations('Errors')
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  const [isMoving, setIsMoving] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [isFavoriting, setIsFavoriting] = useState(false)
  const [isSavingRecipe, setIsSavingRecipe] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [isPublishScopeOpen, setIsPublishScopeOpen] = useState(false)
  const [isSettingCover, setIsSettingCover] = useState(false)
  const [coverPickerOpen, setCoverPickerOpen] = useState(false)

  const open = generation !== null
  const currentPublishScope: PublishScope = !generation?.isPublic
    ? 'private'
    : generation.isPromptPublic
      ? 'assetAndPrompt'
      : 'asset'

  const studioModeFor = (
    gen: GenerationRecord,
  ): 'image' | 'video' | 'audio' | '3d' =>
    gen.outputType === 'VIDEO'
      ? 'video'
      : gen.outputType === 'AUDIO'
        ? 'audio'
        : gen.outputType === 'MODEL_3D'
          ? '3d'
          : 'image'

  const handleRemix = () => {
    if (!generation) return
    const mode = studioModeFor(generation)
    // 3D Studio uses ?gen=<id> to load an existing GLB for viewing,
    // not ?remix= (since 3D outputs aren't remix-able sources).
    const param = mode === '3d' ? 'gen' : 'remix'
    router.push(`/studio/${mode}?${param}=${generation.id}`)
    onOpenChange(false)
  }

  const handleMove = async (projectId: string | null) => {
    if (!generation || isMoving) return
    if (generation.projectId === projectId) {
      onOpenChange(false)
      return
    }
    setIsMoving(true)
    try {
      const response = await assignGenerationProjectAPI(
        generation.id,
        projectId,
      )
      if (response.success) {
        toast.success(t('detailMoved'))
        onMoved?.(generation.id, projectId)
        onOpenChange(false)
      } else {
        toast.error(response.error ?? t('detailMoveFailed'))
      }
    } catch {
      toast.error(t('detailMoveFailed'))
    } finally {
      setIsMoving(false)
    }
  }

  const handleDelete = async () => {
    if (!generation || isDeleting) return
    const generationId = generation.id
    setIsDeleting(true)
    onOpenChange(false)
    try {
      const response = await deleteGenerationAPI(generationId)
      if (response.success) {
        toast.success(t('detailDeleted'))
        onDeleted?.(generationId)
      } else {
        toast.error(response.error ?? t('detailDeleteFailed'))
      }
    } catch {
      toast.error(t('detailDeleteFailed'))
    } finally {
      setIsDeleting(false)
    }
  }

  const handleApplyPublishScope = async (scope: PublishScope) => {
    if (!generation || isPublishing) return
    if (scope === currentPublishScope) {
      setIsPublishScopeOpen(false)
      return
    }

    const values =
      scope === 'private'
        ? { isPublic: false, isPromptPublic: false }
        : scope === 'asset'
          ? { isPublic: true, isPromptPublic: false }
          : { isPublic: true, isPromptPublic: true }

    setIsPublishing(true)
    try {
      const response = await setGenerationVisibility(generation.id, values)
      if (response.success && response.data) {
        onUpdated?.(generation.id, {
          isPublic: response.data.isPublic,
          isPromptPublic: response.data.isPromptPublic,
        })
        setIsPublishScopeOpen(false)
        toast.success(
          response.data.isPublic
            ? t('detailPublished')
            : t('detailUnpublished'),
        )
      } else {
        toast.error(response.error ?? t('detailPublishFailed'))
      }
    } catch {
      toast.error(t('detailPublishFailed'))
    } finally {
      setIsPublishing(false)
    }
  }

  const handleToggleFavorite = async () => {
    if (!generation || isFavoriting) return
    setIsFavoriting(true)
    try {
      const response = await toggleLikeAPI(generation.id)
      if (response.success && response.data) {
        onUpdated?.(generation.id, {
          isLiked: response.data.liked,
          likeCount: response.data.likeCount,
        })
        toast.success(
          response.data.liked ? t('detailFavorited') : t('detailUnfavorited'),
        )
      } else {
        toast.error(t('detailFavoriteFailed'))
      }
    } catch {
      toast.error(t('detailFavoriteFailed'))
    } finally {
      setIsFavoriting(false)
    }
  }

  const handleSaveRecipe = async () => {
    if (!generation || isSavingRecipe) return
    setIsSavingRecipe(true)
    try {
      const response = await createRecipeFromGenerationAPI({
        generationId: generation.id,
      })
      if (response.success) {
        toast.success(tPrompts('saveTemplateSuccess'))
      } else {
        toast.error(response.error ?? tPrompts('saveTemplateFailed'))
      }
    } catch {
      toast.error(tPrompts('saveTemplateFailed'))
    } finally {
      setIsSavingRecipe(false)
    }
  }

  const handleDownload = async () => {
    if (!generation || isDownloading) return
    const downloadUrl = getDownloadTarget(generation)
    const fileName = getAssetFileName(generation)

    setIsDownloading(true)
    try {
      const response = await downloadRemoteAsset(downloadUrl, fileName)
      if (!response.success) {
        toast.error(
          getApiErrorMessage(tErrors, response, t('detailDownloadFailed')),
        )
        triggerDirectAssetDownload(downloadUrl, fileName)
      }
    } finally {
      setIsDownloading(false)
    }
  }

  const handleOpenOriginal = () => {
    if (!generation) return
    openExternalAsset(getDownloadTarget(generation))
  }

  const applyCover = async (coverImageUrl: string) => {
    if (!generation || isSettingCover) return
    setCoverPickerOpen(false)
    setIsSettingCover(true)
    try {
      const response = await setAudioCoverAPI(generation.id, coverImageUrl)
      if (response.success) {
        // Cover is stored in previewUrl, which the asset browser reads back.
        onUpdated?.(generation.id, { previewUrl: coverImageUrl })
        toast.success(t('detailCoverSet'))
      } else {
        toast.error(response.error ?? t('detailCoverSetFailed'))
      }
    } catch {
      toast.error(t('detailCoverSetFailed'))
    } finally {
      setIsSettingCover(false)
    }
  }

  if (!generation) return null

  const isAudioAsset = generation.outputType === 'AUDIO'

  const previewUrl = getGenerationPreviewUrl(generation)
  const toolbarActions = (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        className="rounded-full text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        onClick={() => void handleDownload()}
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
        onClick={handleOpenOriginal}
        aria-label={t('detailOpenOriginal')}
      >
        <ArrowUpRight className="size-4" />
      </Button>
    </>
  )
  const sideHeader = (
    <div className="space-y-1.5">
      <h2 className="font-display text-base font-medium">{t('detailTitle')}</h2>
      <p className="text-xs leading-5 text-muted-foreground">
        {generation.model}
      </p>
    </div>
  )
  const sideContent = (
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
        <Field label={t('detailDuration')} value={`${generation.duration}s`} />
      )}
      {generation.seed != null && (
        <Field label={t('detailSeed')} value={String(generation.seed)} />
      )}
      <Field
        label={t('detailCreatedAt')}
        value={new Date(generation.createdAt).toLocaleString()}
      />
    </dl>
  )
  const footerActions = (
    <div className="space-y-2">
      <Button
        variant="default"
        size="sm"
        className="w-full gap-1.5 rounded-full"
        onClick={handleRemix}
      >
        <Sparkles className="size-4" />
        {t('detailRemix')}
      </Button>
      <div className="flex flex-wrap items-center gap-1">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              disabled={isMoving}
            >
              {isMoving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FolderInput className="size-4" />
              )}
              {t('detailMoveTo')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="max-h-72 w-56 overflow-y-auto"
          >
            <DropdownMenuItem
              onClick={() => void handleMove(null)}
              className={cn(
                'gap-2',
                generation.projectId == null && 'font-medium',
              )}
            >
              <span className="flex w-4 shrink-0 items-center justify-center">
                {generation.projectId == null && <Check className="size-3.5" />}
              </span>
              {t('detailMoveUnassigned')}
            </DropdownMenuItem>
            {projects.length > 0 && <DropdownMenuSeparator />}
            {projects.map((project) => (
              <DropdownMenuItem
                key={project.id}
                onClick={() => void handleMove(project.id)}
                className={cn(
                  'gap-2',
                  generation.projectId === project.id && 'font-medium',
                )}
              >
                <span className="flex w-4 shrink-0 items-center justify-center">
                  {generation.projectId === project.id && (
                    <Check className="size-3.5" />
                  )}
                </span>
                <span className="truncate">{project.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={() => setIsPublishScopeOpen(true)}
          disabled={isPublishing}
          aria-pressed={generation.isPublic}
        >
          {isPublishing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : generation.isPublic ? (
            <GlobeLock className="size-4" />
          ) : (
            <Globe className="size-4" />
          )}
          {generation.isPublic ? t('detailPublishScope') : t('detailPublish')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'gap-1.5',
            generation.isLiked && 'text-rose-500 hover:text-rose-500',
          )}
          onClick={() => void handleToggleFavorite()}
          disabled={isFavoriting}
          aria-pressed={!!generation.isLiked}
        >
          {isFavoriting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Heart
              className={cn('size-4', generation.isLiked && 'fill-current')}
            />
          )}
          {generation.isLiked ? t('detailUnfavorite') : t('detailFavorite')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={() => void handleSaveRecipe()}
          disabled={isSavingRecipe}
        >
          {isSavingRecipe ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <FileText className="size-4" />
          )}
          {tPrompts('saveAsTemplate')}
        </Button>
        {isAudioAsset && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => setCoverPickerOpen(true)}
            disabled={isSettingCover}
          >
            {isSettingCover ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ImagePlus className="size-4" />
            )}
            {t('detailSetCover')}
          </Button>
        )}
        <ConfirmDialog
          title={t('detailDeleteConfirmTitle')}
          description={t('detailDeleteConfirmDescription')}
          cancelLabel={t('detailDeleteCancel')}
          confirmLabel={t('detailDelete')}
          variant="destructive"
          onConfirm={handleDelete}
          trigger={
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              {t('detailDelete')}
            </Button>
          }
        />
      </div>
    </div>
  )

  return (
    <>
      <MediaDetailViewer
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setIsPublishScopeOpen(false)
          onOpenChange(nextOpen)
        }}
        title={t('detailTitle')}
        description={t('detailDescription')}
        closeLabel={tCommon('close')}
        media={<Preview generation={generation} />}
        sideHeader={sideHeader}
        sideContent={sideContent}
        footerActions={footerActions}
        toolbarActions={toolbarActions}
        transitionOrigin={transitionOrigin}
        transitionImageSrc={previewUrl}
        transitionImageAlt={generation.prompt || generation.id}
      />
      {isAudioAsset && (
        <AssetSelectorDialog
          open={coverPickerOpen}
          onOpenChange={setCoverPickerOpen}
          title={t('detailCoverDialogTitle')}
          description={t('detailCoverDialogDescription')}
          mediaType="image"
          onSelect={(image) => void applyCover(image.url)}
        />
      )}
      <Sheet
        open={isPublishScopeOpen}
        onOpenChange={(nextOpen) => {
          if (!isPublishing) setIsPublishScopeOpen(nextOpen)
        }}
      >
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="mx-auto max-w-lg gap-0 rounded-t-2xl border-border/70 p-0"
        >
          <SheetHeader className="px-5 pt-5 pb-3 text-left">
            <SheetTitle className="font-display text-base">
              {t('detailPublishScopeTitle')}
            </SheetTitle>
            <SheetDescription>
              {t('detailPublishScopeDescription')}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-2 px-5 pb-2">
            <PublishScopeOption
              title={t('detailPublishScopeAsset')}
              description={t('detailPublishScopeAssetDescription')}
              selected={currentPublishScope === 'asset'}
              disabled={isPublishing}
              onClick={() => void handleApplyPublishScope('asset')}
            />
            <PublishScopeOption
              title={t('detailPublishScopeAssetAndPrompt')}
              description={t('detailPublishScopeAssetAndPromptDescription')}
              selected={currentPublishScope === 'assetAndPrompt'}
              disabled={isPublishing}
              onClick={() => void handleApplyPublishScope('assetAndPrompt')}
            />
            <PublishScopeOption
              title={t('detailPublishScopePrivate')}
              description={t('detailPublishScopePrivateDescription')}
              selected={currentPublishScope === 'private'}
              disabled={isPublishing}
              onClick={() => void handleApplyPublishScope('private')}
            />
          </div>
          <SheetFooter className="px-5 pt-2 pb-5">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsPublishScopeOpen(false)}
              disabled={isPublishing}
            >
              {t('detailPublishScopeCancel')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  )
}

function PublishScopeOption({
  title,
  description,
  selected,
  disabled,
  onClick,
}: PublishScopeOptionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left transition-colors disabled:cursor-wait disabled:opacity-70',
        selected
          ? 'border-primary/40 bg-primary/10'
          : 'border-border/70 bg-card hover:bg-muted/40',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border',
          selected
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border text-transparent',
        )}
      >
        <Check className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">
          {title}
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
          {description}
        </span>
      </span>
    </button>
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
          poster={
            generation.url && generation.url !== generation.modelUrl
              ? generation.url
              : undefined
          }
          alt={generation.prompt || '3D model'}
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
