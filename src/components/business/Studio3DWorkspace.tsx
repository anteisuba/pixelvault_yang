'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Box,
  Download,
  FolderOpen,
  ImageIcon,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { AI_MODELS, getAvailableModel3DModels } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { USER_UPLOAD_MAX_BYTES } from '@/constants/uploads'
import { ApiKeyDrawerTrigger } from '@/components/business/ApiKeyDrawerTrigger'
import { ApiKeyManager } from '@/components/business/ApiKeyManager'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { ModelViewer } from '@/components/business/ModelViewer'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useGenerate3D } from '@/hooks/use-generate-3d'
import {
  fetchGenerationByIdAPI,
  uploadGenerationPosterAPI,
  uploadImageAPI,
} from '@/lib/api-client'
import { cn } from '@/lib/utils'
import type { Generate3DRequest, GenerationRecord } from '@/types'

interface Studio3DWorkspaceProps {
  initialGenerations: GenerationRecord[]
  initialTotal: number
  initialHasMore: boolean
}

const OCTREE_OPTIONS: Array<{ value: 256 | 512 | 1024; label: string }> = [
  { value: 256, label: '256 (fast)' },
  { value: 512, label: '512 (balanced)' },
  { value: 1024, label: '1024 (high)' },
]

export function Studio3DWorkspace(_props: Studio3DWorkspaceProps) {
  const t = useTranslations('Model3DGenerate')
  const tModels = useTranslations('Models')
  const tChip = useTranslations('ImageChip')
  const models = useMemo(() => getAvailableModel3DModels(), [])

  const [sourceImage, setSourceImage] = useState<GenerationRecord | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedModelId, setSelectedModelId] = useState<string>(
    models[0]?.id ?? AI_MODELS.HUNYUAN3D_2_1,
  )
  const [texturedMesh, setTexturedMesh] = useState(false)
  const [octreeResolution, setOctreeResolution] = useState<256 | 512 | 1024>(
    512,
  )
  const [removeBackground, setRemoveBackground] = useState(true)
  // ?gen=<id> deeplink — when present, fetch the existing MODEL_3D row and
  // render it in the canvas without triggering a new generation. Used by
  // the asset library's "open in 3D Studio" affordance.
  const searchParams = useSearchParams()
  const deeplinkGenId = searchParams.get('gen')
  const [hydratedGeneration, setHydratedGeneration] =
    useState<GenerationRecord | null>(null)
  const hydratedForRef = useRef<string | null>(null)

  const {
    isGenerating,
    stage,
    elapsedSeconds,
    generatedGeneration,
    generate,
    reset,
  } = useGenerate3D()

  // Fetch + hydrate a MODEL_3D row from the deeplink. Runs once per id so
  // changing models in the picker doesn't refetch. Silent on failure —
  // user just sees the empty canvas as if no deeplink was present.
  useEffect(() => {
    if (!deeplinkGenId) return
    if (hydratedForRef.current === deeplinkGenId) return
    hydratedForRef.current = deeplinkGenId
    void (async () => {
      const response = await fetchGenerationByIdAPI(deeplinkGenId)
      if (
        response.success &&
        response.data &&
        response.data.outputType === 'MODEL_3D'
      ) {
        setHydratedGeneration(response.data)
      }
    })()
  }, [deeplinkGenId])

  // The canvas displays the most recently produced 3D — either the
  // freshly generated one from this session, or the deeplinked one.
  // Live generation always wins so a user can deeplink + then click
  // generate to overwrite.
  const displayGeneration = generatedGeneration ?? hydratedGeneration

  // API key gating — surface fal key state up-front so users without a key
  // don't get a confusing 400 at generate time. We check for ANY active
  // fal key (resolveGenerationRoute auto-picks one).
  const { keys, isLoading: isLoadingKeys } = useApiKeysContext()
  const hasFalKey = useMemo(
    () =>
      keys.some((k) => k.adapterType === AI_ADAPTER_TYPES.FAL && k.isActive),
    [keys],
  )

  const isHunyuan = selectedModelId === AI_MODELS.HUNYUAN3D_2_1
  const isTriposr = selectedModelId === AI_MODELS.TRIPOSR

  const canGenerate = !!sourceImage && !isGenerating && hasFalKey

  const handleGenerate = async () => {
    if (!sourceImage) return
    const params: Generate3DRequest = {
      imageUrl: sourceImage.url,
      modelId: selectedModelId,
      sourceGenerationId: sourceImage.id,
      prompt: sourceImage.prompt,
      ...(isHunyuan && {
        texturedMesh,
        octreeResolution,
      }),
      ...(isTriposr && {
        removeBackground,
      }),
    }
    await generate(params)
  }

  const handleClearSource = () => {
    setSourceImage(null)
    reset()
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
    if (!file.type.startsWith('image/')) {
      toast.error(t('errorUnsupportedFile'))
      return
    }
    if (file.size > USER_UPLOAD_MAX_BYTES) {
      toast.error(
        t('errorFileTooLarge', {
          maxMb: String(USER_UPLOAD_MAX_BYTES / 1024 / 1024),
        }),
      )
      return
    }

    setUploading(true)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
      })
      const response = await uploadImageAPI({ imageDataUrl: dataUrl })
      if (!response.success || !response.data) {
        toast.error(response.error ?? t('errorFallback'))
        return
      }
      setSourceImage(response.data.generation)
      toast.success(t('uploadSuccess'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('errorUnexpected'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] w-full flex-col bg-background md:h-screen">
      <header className="flex flex-col gap-1 border-b border-border/40 px-6 py-4">
        <div className="flex items-center gap-2">
          <Box className="size-4 text-primary" />
          <h1 className="font-display text-xl font-medium tracking-tight">
            {t('title')}
          </h1>
        </div>
        <p className="font-serif text-sm leading-6 text-muted-foreground">
          {t('description')}
        </p>
      </header>

      <div className="flex flex-1 flex-col gap-0 overflow-hidden md:flex-row">
        {/* Main canvas — ModelViewer when generated; placeholder otherwise */}
        <main className="relative flex flex-1 items-center justify-center overflow-hidden bg-muted/20 p-6">
          {displayGeneration ? (
            <>
              <ModelViewer
                src={displayGeneration.modelUrl ?? displayGeneration.url}
                poster={
                  // Prefer the live source image (just-clicked picker) so
                  // the viewer doesn't flash dark while the GLB downloads.
                  // Fall back to the persisted poster (`url` differs from
                  // `modelUrl` after a previous capture-upload).
                  sourceImage?.url ??
                  (displayGeneration.url !== displayGeneration.modelUrl
                    ? displayGeneration.url
                    : undefined)
                }
                alt={displayGeneration.prompt || '3D model'}
                className="h-full w-full"
                onPosterCaptured={(blob) => {
                  // Fire-and-forget: failure is non-fatal (asset just won't
                  // get a thumbnail until next view-and-capture). Only
                  // capture for the freshly-generated row — the deeplinked
                  // one already has its poster persisted.
                  if (generatedGeneration) {
                    void uploadGenerationPosterAPI(generatedGeneration.id, blob)
                  }
                }}
              />
              <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2">
                <Button asChild variant="secondary" size="sm">
                  <a
                    href={displayGeneration.modelUrl ?? displayGeneration.url}
                    download
                  >
                    <Download className="mr-1.5 size-3.5" />
                    {t('downloadGlb')}
                  </a>
                </Button>
              </div>
            </>
          ) : sourceImage ? (
            <div className="relative h-full max-h-[70vh] w-full max-w-2xl">
              <Image
                src={sourceImage.url}
                alt={sourceImage.prompt || 'Source image'}
                fill
                unoptimized
                className="rounded-xl object-contain"
                sizes="(max-width: 768px) 100vw, 60vw"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-center text-muted-foreground">
              <Box className="size-12 opacity-40" />
              <p className="font-serif text-sm">
                {t('sourceImagePlaceholder')}
              </p>
            </div>
          )}

          {isGenerating && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-3">
                <div className="size-10 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                <p className="text-sm font-medium">
                  {stage === 'queued' && t('stageQueued')}
                  {stage === 'generating' && t('stageGenerating')}
                  {stage === 'uploading' && t('stageUploading')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('elapsed', { seconds: `${elapsedSeconds}s` })}
                </p>
              </div>
            </div>
          )}
        </main>

        {/* Right panel — image picker + model + params + generate */}
        <aside className="flex w-full shrink-0 flex-col gap-4 border-t border-border/40 bg-muted/10 p-5 md:w-80 md:border-l md:border-t-0">
          {/*
           * API key banner — shown when the user has no active fal key.
           * Hunyuan3D / TripoSR both go through fal, so without a key the
           * generate flow would 400 at submit time. Drawer trigger reuses
           * the site-wide ApiKeyManager UI.
           */}
          {!isLoadingKeys && !hasFalKey && (
            <div className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                <AlertTriangle className="size-3.5" />
                {t('apiKeyMissingTitle')}
              </div>
              <p className="font-serif text-xs leading-5 text-muted-foreground">
                {t('apiKeyMissingDescription')}
              </p>
              {/*
               * ApiKeyDrawerTrigger renders its own button (the trigger);
               * children populate the drawer's body so ApiKeyManager
               * shows once the user clicks Configure.
               */}
              <ApiKeyDrawerTrigger className="self-start">
                <ApiKeyManager />
              </ApiKeyDrawerTrigger>
            </div>
          )}

          {/* Compact image picker — mirrors Image Studio bottom-toolbar chip pattern */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              {t('sourceImageLabel')}
            </Label>
            {sourceImage ? (
              <div className="relative aspect-square w-full overflow-hidden rounded-lg ring-1 ring-border/40">
                <Image
                  src={sourceImage.url}
                  alt="Source"
                  fill
                  unoptimized
                  className="object-cover"
                  sizes="320px"
                />
                <button
                  type="button"
                  onClick={handleClearSource}
                  className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-background"
                  aria-label="Remove source image"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border/60 bg-muted/30 px-4 py-6 text-center">
                <ImageIcon className="size-6 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {t('sourceImagePlaceholder')}
                </span>
                <div className="flex w-full flex-col gap-2">
                  <Button
                    type="button"
                    onClick={handleUploadClick}
                    disabled={uploading}
                    className="w-full rounded-full"
                  >
                    <Upload className="mr-1.5 size-3.5" />
                    {uploading ? t('uploading') : t('uploadButton')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setPickerOpen(true)}
                    disabled={uploading}
                    className="w-full rounded-full"
                  >
                    <FolderOpen className="mr-1.5 size-3.5" />
                    {tChip('selectAsset')}
                  </Button>
                </div>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              {t('modelLabel')}
            </Label>
            <Select
              value={selectedModelId}
              onValueChange={(v) => setSelectedModelId(v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('modelPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {models.map((model) => {
                  const messageKey =
                    model.id === AI_MODELS.HUNYUAN3D_2_1
                      ? 'hunyuan3d21'
                      : 'triposr'
                  return (
                    <SelectItem key={model.id} value={model.id}>
                      {tModels(`${messageKey}.label`)}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          {isHunyuan && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <Label
                    htmlFor="textured-mesh"
                    className="text-sm font-medium"
                  >
                    {t('texturedMeshLabel')}
                  </Label>
                  <span className="text-xs text-muted-foreground">
                    {t('texturedMeshHint')}
                  </span>
                </div>
                <Switch
                  id="textured-mesh"
                  checked={texturedMesh}
                  onCheckedChange={setTexturedMesh}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  {t('octreeResolutionLabel')}
                </Label>
                <Select
                  value={String(octreeResolution)}
                  onValueChange={(v) =>
                    setOctreeResolution(Number(v) as 256 | 512 | 1024)
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OCTREE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {isTriposr && (
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-col gap-0.5">
                <Label htmlFor="remove-bg" className="text-sm font-medium">
                  {t('removeBackgroundLabel')}
                </Label>
                <span className="text-xs text-muted-foreground">
                  {t('removeBackgroundHint')}
                </span>
              </div>
              <Switch
                id="remove-bg"
                checked={removeBackground}
                onCheckedChange={setRemoveBackground}
              />
            </div>
          )}

          <Button
            type="button"
            disabled={!canGenerate}
            onClick={handleGenerate}
            className={cn(
              'mt-auto w-full rounded-full',
              !canGenerate && 'opacity-60',
            )}
          >
            <Sparkles className="mr-1.5 size-4" />
            {isGenerating ? t('generating') : t('generateButton')}
          </Button>
        </aside>
      </div>

      <AssetSelectorDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={(gen) => setSourceImage(gen)}
        title={t('sourceImageLabel')}
        description={t('sourceImagePlaceholder')}
        mediaType="image"
      />
    </div>
  )
}
