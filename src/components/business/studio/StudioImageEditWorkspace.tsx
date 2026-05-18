'use client'
/* eslint-disable @next/next/no-img-element */

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type SyntheticEvent,
} from 'react'
import {
  AlertCircle,
  ArrowUpRight,
  Clipboard,
  Download,
  Eraser,
  Expand,
  ImageIcon,
  Layers,
  Loader2,
  Paintbrush,
  Upload,
  Wand2,
} from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { galleryGenerationPath } from '@/constants/routes'
import {
  USER_UPLOAD_ACCEPTED_MIME_TYPES,
  USER_UPLOAD_MAX_BYTES,
} from '@/constants/uploads'
import type {
  GenerationRecord,
  ImageDecomposeResult,
  OutpaintPadding,
} from '@/types'
import { useInpaint } from '@/hooks/use-inpaint'
import { Link } from '@/i18n/navigation'
import { getApiErrorMessage } from '@/lib/api-error-message'
import {
  decomposeImageAPI,
  downloadRemoteAsset,
  editImageAPI,
  uploadImageAPI,
} from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { Button } from '@/components/ui/button'

import { StudioInpaintEditor } from './StudioInpaintEditor'
import { StudioOutpaintEditor } from './StudioOutpaintEditor'

type SimpleEditAction = 'upscale' | 'remove-background'
type EditAction = SimpleEditAction | 'inpaint' | 'outpaint' | 'decompose'
type ActiveEditor = 'overview' | 'inpaint' | 'outpaint'
type DecomposeStage = 'queued' | 'running'
type ToolGroup = 'auto' | 'interactive' | 'advanced'

interface EditableSource {
  imageUrl: string
  generationId?: string
  width: number
  height: number
}

interface EditResult {
  imageUrl: string
  width: number
  height: number
  action: Exclude<EditAction, 'decompose'>
  generation?: GenerationRecord
}

const DEFAULT_IMAGE_SIZE = 1024

function parseDimension(value: string | null): number {
  if (!value) return DEFAULT_IMAGE_SIZE
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0
    ? Math.round(parsed)
    : DEFAULT_IMAGE_SIZE
}

function isRemoteImageUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function getSimpleActionKey(action: SimpleEditAction): 'upscale' | 'removeBg' {
  return action === 'upscale' ? 'upscale' : 'removeBg'
}

function getFileExtension(imageUrl: string): string {
  const pathname = new URL(imageUrl).pathname
  const extension = pathname.split('.').pop()
  return extension && extension.length <= 5 ? extension : 'png'
}

function getSourceFromQuery(queryString: string): EditableSource | null {
  const params = new URLSearchParams(queryString)
  const sourceUrl = params.get('sourceUrl')
  if (!sourceUrl || !isRemoteImageUrl(sourceUrl)) return null

  return {
    imageUrl: sourceUrl,
    generationId: params.get('generationId') ?? undefined,
    width: parseDimension(params.get('width')),
    height: parseDimension(params.get('height')),
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Failed to read file'))
    }
    reader.onerror = () =>
      reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

export function StudioImageEditWorkspace() {
  const searchParams = useSearchParams()
  const initialSource = getSourceFromQuery(searchParams.toString())
  const t = useTranslations('StudioImageEdit')
  const tErrors = useTranslations('Errors')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const pasteTargetRef = useRef<HTMLDivElement | null>(null)
  const [source, setSource] = useState<EditableSource | null>(initialSource)
  const [bannerError, setBannerError] = useState<string | null>(null)
  const [isUploadingSource, setIsUploadingSource] = useState(false)
  const [assetPickerOpen, setAssetPickerOpen] = useState(false)
  const [activeEditor, setActiveEditor] = useState<ActiveEditor>('overview')
  const [runningAction, setRunningAction] = useState<EditAction | null>(null)
  const [decomposeStage, setDecomposeStage] = useState<DecomposeStage>('queued')
  const [result, setResult] = useState<EditResult | null>(null)
  const [layerResult, setLayerResult] = useState<ImageDecomposeResult | null>(
    null,
  )
  const {
    inpaint,
    outpaint,
    isLoading: isMaskEditing,
    error: maskEditError,
  } = useInpaint()

  const hasSource = source !== null
  const isBusy = runningAction !== null || isMaskEditing || isUploadingSource
  const displayImage = result?.imageUrl ?? source?.imageUrl ?? null
  const displayWidth = result?.width ?? source?.width ?? DEFAULT_IMAGE_SIZE
  const displayHeight = result?.height ?? source?.height ?? DEFAULT_IMAGE_SIZE

  const actionButtons = useMemo(
    () =>
      [
        {
          action: 'upscale' as const,
          icon: Wand2,
          label: t('actions.upscale'),
          group: 'auto' as const,
        },
        {
          action: 'remove-background' as const,
          icon: Eraser,
          label: t('actions.removeBg'),
          group: 'auto' as const,
        },
        {
          action: 'inpaint' as const,
          icon: Paintbrush,
          label: t('actions.inpaint'),
          group: 'interactive' as const,
        },
        {
          action: 'outpaint' as const,
          icon: Expand,
          label: t('actions.outpaint'),
          group: 'interactive' as const,
        },
        {
          action: 'decompose' as const,
          icon: Layers,
          label: t('actions.decompose'),
          group: 'advanced' as const,
        },
      ] satisfies Array<{
        action: EditAction
        icon: typeof Wand2
        label: string
        group: ToolGroup
      }>,
    [t],
  )

  const toolGroups = useMemo(() => {
    const groups: Record<ToolGroup, typeof actionButtons> = {
      auto: [],
      interactive: [],
      advanced: [],
    }
    actionButtons.forEach((button) => groups[button.group].push(button))
    return groups
  }, [actionButtons])

  const resetEditState = useCallback(() => {
    setResult(null)
    setLayerResult(null)
    setActiveEditor('overview')
    setBannerError(null)
  }, [])

  const setSourceFromGeneration = useCallback(
    (generation: GenerationRecord) => {
      setSource({
        imageUrl: generation.url,
        generationId: generation.id,
        width: generation.width,
        height: generation.height,
      })
      resetEditState()
    },
    [resetEditState],
  )

  const setSourceFromUrl = useCallback(
    async (imageUrl: string) => {
      if (!isRemoteImageUrl(imageUrl)) {
        setBannerError(t('sourceInvalid'))
        return
      }

      setIsUploadingSource(true)
      setBannerError(null)
      try {
        const response = await uploadImageAPI({
          imageUrl,
          note: t('uploadNote'),
        })

        if (!response.success || !response.data) {
          const message = response.error ?? t('importFailed')
          setBannerError(message)
          toast.error(message)
          return
        }

        setSourceFromGeneration(response.data.generation)
        toast.success(t('importSuccess'))
      } catch {
        const message = t('importFailed')
        setBannerError(message)
        toast.error(message)
      } finally {
        setIsUploadingSource(false)
      }
    },
    [setSourceFromGeneration, t],
  )

  const validateSourceFile = useCallback(
    (file: File): boolean => {
      const acceptedTypes = USER_UPLOAD_ACCEPTED_MIME_TYPES as readonly string[]
      if (!acceptedTypes.includes(file.type)) {
        const message = t('uploadUnsupported')
        setBannerError(message)
        toast.error(message)
        return false
      }

      if (file.size > USER_UPLOAD_MAX_BYTES) {
        const message = t('uploadTooLarge', {
          maxMb: String(USER_UPLOAD_MAX_BYTES / 1024 / 1024),
        })
        setBannerError(message)
        toast.error(message)
        return false
      }

      return true
    },
    [t],
  )

  const uploadSourceFile = useCallback(
    async (file: File) => {
      if (!validateSourceFile(file)) return

      setIsUploadingSource(true)
      setBannerError(null)
      try {
        const imageDataUrl = await readFileAsDataUrl(file)
        const response = await uploadImageAPI({
          imageDataUrl,
          note: t('uploadNote'),
        })

        if (!response.success || !response.data) {
          const message = response.error ?? t('uploadFailed')
          setBannerError(message)
          toast.error(message)
          return
        }

        setSourceFromGeneration(response.data.generation)
        toast.success(t('uploadSuccess'))
      } catch {
        const message = t('uploadFailed')
        setBannerError(message)
        toast.error(message)
      } finally {
        setIsUploadingSource(false)
      }
    },
    [setSourceFromGeneration, t, validateSourceFile],
  )

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (file) void uploadSourceFile(file)
    },
    [uploadSourceFile],
  )

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      const imageFile = Array.from(event.clipboardData.files).find((file) =>
        file.type.startsWith('image/'),
      )
      if (imageFile) {
        event.preventDefault()
        void uploadSourceFile(imageFile)
        return
      }

      const pastedText = event.clipboardData.getData('text').trim()
      if (pastedText && isRemoteImageUrl(pastedText)) {
        event.preventDefault()
        void setSourceFromUrl(pastedText)
      }
    },
    [setSourceFromUrl, uploadSourceFile],
  )

  const updateLoadedDimensions = useCallback(
    (event: SyntheticEvent<HTMLImageElement>) => {
      const image = event.currentTarget
      if (!source || image.src !== source.imageUrl) return
      setSource((current) =>
        current && current.imageUrl === image.src
          ? {
              ...current,
              width: image.naturalWidth || current.width,
              height: image.naturalHeight || current.height,
            }
          : current,
      )
    },
    [source],
  )

  const runSimpleEdit = useCallback(
    async (action: SimpleEditAction) => {
      if (!source || isBusy) return

      setRunningAction(action)
      setBannerError(null)
      // Server persists by default — the returned record is what we render.
      const response = await editImageAPI(action, source.imageUrl, {
        generationId: source.generationId,
      })
      setRunningAction(null)

      if (!response.success || !response.data) {
        toast.error(getApiErrorMessage(tErrors, response, t('editFailed')))
        return
      }

      setResult({
        imageUrl: response.data.imageUrl,
        width: response.data.width,
        height: response.data.height,
        action,
        generation: response.data.generation,
      })
      setLayerResult(null)
      setActiveEditor('overview')
      toast.success(t(`success.${getSimpleActionKey(action)}`))
    },
    [isBusy, source, t, tErrors],
  )

  const applyInpaint = useCallback(
    async (maskDataUrl: string, prompt: string) => {
      if (!source || isBusy) return

      const editResult = await inpaint({
        imageUrl: source.imageUrl,
        maskImageUrl: maskDataUrl,
        prompt,
        sourceGenerationId: source.generationId,
      })

      if (!editResult) return

      setResult({
        imageUrl: editResult.imageUrl,
        width: editResult.width,
        height: editResult.height,
        action: 'inpaint',
        generation: editResult.generation,
      })
      setLayerResult(null)
      setActiveEditor('overview')
      toast.success(t('savedToGallery'))
    },
    [inpaint, isBusy, source, t],
  )

  const applyOutpaint = useCallback(
    async (padding: OutpaintPadding, prompt: string) => {
      if (!source || isBusy) return

      const editResult = await outpaint({
        imageUrl: source.imageUrl,
        padding,
        prompt,
        sourceGenerationId: source.generationId,
      })

      if (!editResult) return

      setResult({
        imageUrl: editResult.imageUrl,
        width: editResult.width,
        height: editResult.height,
        action: 'outpaint',
        generation: editResult.generation,
      })
      setLayerResult(null)
      setActiveEditor('overview')
      toast.success(t('savedToGallery'))
    },
    [isBusy, outpaint, source, t],
  )

  const runDecompose = useCallback(async () => {
    if (!source || isBusy) return

    // See-Through runs on a HuggingFace Space that often cold-starts: the
    // first request waits 30-60s before the model even loads. Surface that
    // explicitly so the user doesn't assume the page froze.
    setRunningAction('decompose')
    setDecomposeStage('queued')
    setBannerError(null)
    const stageTimer = window.setTimeout(
      () => setDecomposeStage('running'),
      8000,
    )

    try {
      const response = await decomposeImageAPI(source.imageUrl)

      if (!response.success || !response.data) {
        toast.error(getApiErrorMessage(tErrors, response, t('decomposeFailed')))
        return
      }

      setLayerResult(response.data)
      setActiveEditor('overview')
      toast.success(t('decomposeDone', { count: response.data.layerCount }))
    } finally {
      window.clearTimeout(stageTimer)
      setRunningAction(null)
    }
  }, [isBusy, source, t, tErrors])

  const downloadResult = useCallback(async () => {
    if (!result || isBusy) return

    const extension = getFileExtension(result.imageUrl)
    const response = await downloadRemoteAsset(
      result.imageUrl,
      `pixelvault-edit-${result.action}.${extension}`,
    )

    if (!response.success) {
      toast.error(getApiErrorMessage(tErrors, response, t('downloadFailed')))
      window.open(result.imageUrl, '_blank', 'noopener,noreferrer')
    }
  }, [isBusy, result, t, tErrors])

  const downloadPsd = useCallback(async () => {
    if (!layerResult || isBusy) return

    const response = await downloadRemoteAsset(
      layerResult.psdUrl,
      'pixelvault-layers.psd',
    )

    if (!response.success) {
      toast.error(getApiErrorMessage(tErrors, response, t('downloadFailed')))
      window.open(layerResult.psdUrl, '_blank', 'noopener,noreferrer')
    }
  }, [isBusy, layerResult, t, tErrors])

  const useResultAsSource = useCallback(() => {
    if (!result) return
    setSource({
      imageUrl: result.imageUrl,
      generationId: result.generation?.id,
      width: result.width,
      height: result.height,
    })
    resetEditState()
  }, [resetEditState, result])

  return (
    <div className="min-h-svh bg-background px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <header className="max-w-3xl">
          <p className="text-nav font-semibold uppercase tracking-nav text-muted-foreground">
            {t('eyebrow')}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {t('title')}
          </h1>
          <p className="mt-1 font-serif text-sm leading-6 text-muted-foreground">
            {t('subtitle')}
          </p>
        </header>

        {(() => {
          const activeError = maskEditError ?? bannerError
          if (!activeError) return null
          return (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span className="flex-1">{activeError}</span>
              <button
                type="button"
                onClick={() => setBannerError(null)}
                className="text-xs underline-offset-2 hover:underline"
                aria-label={t('dismissError')}
              >
                {t('dismissError')}
              </button>
            </div>
          )
        })()}

        <div className="grid gap-4 lg:grid-cols-3">
          <main className="space-y-4 lg:col-span-2">
            <input
              ref={fileInputRef}
              type="file"
              accept={USER_UPLOAD_ACCEPTED_MIME_TYPES.join(',')}
              className="hidden"
              onChange={handleFileChange}
              disabled={isUploadingSource || isBusy}
            />

            <section
              ref={pasteTargetRef}
              tabIndex={0}
              onPaste={handlePaste}
              className="overflow-hidden rounded-xl border border-border/70 bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    {result ? t('resultTitle') : t('sourceTitle')}
                  </h2>
                  {hasSource ? (
                    <p className="text-xs text-muted-foreground">
                      {source?.generationId
                        ? t('sourceBadgeGeneration')
                        : t('sourceBadgeExternal')}
                    </p>
                  ) : null}
                </div>
                {hasSource ? (
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {displayWidth} × {displayHeight}
                  </p>
                ) : null}
              </div>
              <div className="flex min-h-96 items-center justify-center bg-muted/40 p-4">
                {displayImage ? (
                  <img
                    src={displayImage}
                    alt={result ? t('resultAlt') : t('sourceAlt')}
                    onLoad={updateLoadedDimensions}
                    className="max-h-[70svh] max-w-full rounded-lg object-contain"
                    style={{
                      aspectRatio: `${displayWidth} / ${displayHeight}`,
                    }}
                  />
                ) : (
                  <div className="w-full max-w-md text-center">
                    <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <ImageIcon className="size-5" />
                    </div>
                    <p className="mt-3 text-base font-semibold text-foreground">
                      {t('emptyStateTitle')}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t('emptyStateSubtitle')}
                    </p>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="justify-center rounded-lg"
                        onClick={() => setAssetPickerOpen(true)}
                        disabled={isBusy}
                      >
                        <ImageIcon className="size-4" />
                        <span>{t('chooseFromAssets')}</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="justify-center rounded-lg"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isBusy}
                      >
                        {isUploadingSource ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Upload className="size-4" />
                        )}
                        <span>{t('uploadSource')}</span>
                      </Button>
                    </div>
                    <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                      <Clipboard className="size-3" />
                      {t('pasteShortcut')}
                    </p>
                  </div>
                )}
              </div>
              {hasSource ? (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 bg-card/60 px-4 py-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Clipboard className="size-3" />
                    {t('pasteShortcut')}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setAssetPickerOpen(true)}
                      disabled={isBusy}
                    >
                      {t('chooseFromAssets')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isBusy}
                    >
                      {isUploadingSource ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Upload className="size-3" />
                      )}
                      {t('uploadSource')}
                    </Button>
                  </div>
                </div>
              ) : null}
            </section>

            {activeEditor === 'inpaint' && source ? (
              <section className="rounded-xl border border-border/70 bg-card p-4">
                <StudioInpaintEditor
                  imageUrl={source.imageUrl}
                  imageWidth={source.width}
                  imageHeight={source.height}
                  onApply={applyInpaint}
                  onCancel={() => setActiveEditor('overview')}
                  isLoading={isMaskEditing}
                />
              </section>
            ) : null}

            {activeEditor === 'outpaint' && source ? (
              <section className="rounded-xl border border-border/70 bg-card p-4">
                <StudioOutpaintEditor
                  imageUrl={source.imageUrl}
                  imageWidth={source.width}
                  imageHeight={source.height}
                  onApply={applyOutpaint}
                  onCancel={() => setActiveEditor('overview')}
                  isLoading={isMaskEditing}
                />
              </section>
            ) : null}
          </main>

          <aside className="space-y-4">
            <section className="rounded-xl border border-border/70 bg-card p-4">
              <h2 className="text-sm font-semibold text-foreground">
                {t('toolsTitle')}
              </h2>
              <div className="mt-3 space-y-4">
                {(
                  [
                    { key: 'auto', label: t('groups.auto') },
                    { key: 'interactive', label: t('groups.interactive') },
                    { key: 'advanced', label: t('groups.advanced') },
                  ] as const
                ).map(({ key, label }) => {
                  const buttons = toolGroups[key]
                  if (buttons.length === 0) return null
                  return (
                    <div key={key} className="space-y-2">
                      <p className="text-nav font-medium uppercase tracking-nav text-muted-foreground">
                        {label}
                      </p>
                      <div className="grid gap-2">
                        {buttons.map(({ action, icon: Icon, label }) => {
                          const isRunning = runningAction === action
                          return (
                            <Button
                              key={action}
                              type="button"
                              variant={
                                activeEditor === action ? 'default' : 'outline'
                              }
                              className={cn(
                                'h-auto justify-start rounded-lg px-3 py-2.5',
                                activeEditor === action && 'shadow-none',
                              )}
                              disabled={!hasSource || isBusy}
                              onClick={() => {
                                if (
                                  action === 'inpaint' ||
                                  action === 'outpaint'
                                ) {
                                  setActiveEditor(action)
                                  return
                                }
                                if (action === 'decompose') {
                                  void runDecompose()
                                  return
                                }
                                void runSimpleEdit(action)
                              }}
                            >
                              {isRunning ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Icon className="size-4" />
                              )}
                              <span>{label}</span>
                            </Button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
              {runningAction === 'decompose' ? (
                <p className="mt-3 inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  {decomposeStage === 'queued'
                    ? t('decomposeQueued')
                    : t('decomposeRunning')}
                </p>
              ) : null}
            </section>

            {result ? (
              <section className="rounded-xl border border-border/70 bg-card p-4">
                <h2 className="text-sm font-semibold text-foreground">
                  {t('resultActionsTitle')}
                </h2>
                <div className="mt-3 grid gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-start rounded-lg"
                    disabled={isBusy}
                    onClick={() => void downloadResult()}
                  >
                    <Download className="size-4" />
                    {t('downloadResult')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-start rounded-lg"
                    disabled={isBusy}
                    onClick={useResultAsSource}
                  >
                    <ImageIcon className="size-4" />
                    {t('useResultAsSource')}
                  </Button>
                  {result.generation ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="justify-start rounded-lg"
                      asChild
                    >
                      <Link href={galleryGenerationPath(result.generation.id)}>
                        <ArrowUpRight className="size-4" />
                        {t('openSavedGeneration')}
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </section>
            ) : null}

            {layerResult ? (
              <section className="rounded-xl border border-border/70 bg-card p-4">
                <h2 className="text-sm font-semibold text-foreground">
                  {t('layersTitle')}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('layerCount', { count: layerResult.layerCount })}
                </p>
                {layerResult.layers.length > 0 ? (
                  <div className="mt-3 grid grid-cols-3 gap-1.5">
                    {layerResult.layers.map((layer) => (
                      <a
                        key={layer.imageUrl}
                        href={layer.imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group relative aspect-square overflow-hidden rounded-md border border-border/60 bg-muted/30"
                        title={layer.name}
                      >
                        <img
                          src={layer.imageUrl}
                          alt={layer.name}
                          loading="lazy"
                          className="size-full object-contain transition-transform group-hover:scale-105"
                        />
                        <span className="absolute inset-x-0 bottom-0 truncate bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                          {layer.name}
                        </span>
                      </a>
                    ))}
                  </div>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 w-full justify-start rounded-lg"
                  disabled={isBusy}
                  onClick={() => void downloadPsd()}
                >
                  <Download className="size-4" />
                  {t('downloadPsd')}
                </Button>
              </section>
            ) : null}
          </aside>
        </div>
      </div>
      <AssetSelectorDialog
        open={assetPickerOpen}
        onOpenChange={setAssetPickerOpen}
        onSelect={(generation) => {
          if (generation.outputType !== 'IMAGE') return
          setSourceFromGeneration(generation)
        }}
        title={t('chooseFromAssets')}
        description={t('sourcePickerDescription')}
        mediaType="image"
      />
    </div>
  )
}
