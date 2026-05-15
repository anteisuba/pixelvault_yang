'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Box,
  Check,
  Download,
  FolderOpen,
  ImageIcon,
  Loader2,
  Sparkles,
  Upload,
  Wand2,
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
import { useGenerateMultiView } from '@/hooks/use-generate-multiview'
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

export function Studio3DWorkspace({
  initialGenerations,
  initialTotal,
  initialHasMore,
}: Studio3DWorkspaceProps) {
  const t = useTranslations('Model3DGenerate')
  const tModels = useTranslations('Models')
  const tChip = useTranslations('ImageChip')
  const models = useMemo(() => getAvailableModel3DModels(), [])
  // P6: surface Hunyuan's credit cost on the Refine button so the user knows
  // what they're about to spend. Pulled from the registry instead of being
  // hardcoded so the price stays in sync with `model-3d.ts`.
  const hunyuanCost = useMemo(
    () => models.find((m) => m.id === AI_MODELS.HUNYUAN3D_2_1)?.cost,
    [models],
  )

  const [sourceImage, setSourceImage] = useState<GenerationRecord | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  // Separate picker for "open an existing 3D asset" — locked to model_3d so
  // it lists previously generated GLB rows rather than source images.
  const [existingModelPickerOpen, setExistingModelPickerOpen] = useState(false)
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
  // 3D-friendly source preprocessing: upscale small images + white-pad
  // non-square aspects. Defaults on — flip off only for raw-input debugging.
  const [prep3D, setPrep3D] = useState(true)
  // ?gen=<id> deeplink — when present, fetch the existing MODEL_3D row and
  // render it in the canvas without triggering a new generation. Used by
  // the asset library's "open in 3D Studio" affordance.
  // ?source=<id> deeplink — Image Studio's "→ 3D Studio" jump after a
  // 3D-Ready image generation; the row is an IMAGE (not a MODEL_3D), so we
  // load it as the source image and let the user click Generate.
  const searchParams = useSearchParams()
  const deeplinkGenId = searchParams.get('gen')
  const deeplinkSourceId = searchParams.get('source')
  const [hydratedGeneration, setHydratedGeneration] =
    useState<GenerationRecord | null>(null)
  const hydratedForRef = useRef<string | null>(null)
  const sourceHydratedForRef = useRef<string | null>(null)

  // Multi-view picker — once the user has a front-view source image we
  // generate three alternate angles via reference-edit so the user can pick
  // the cleanest one for 3D. Hunyuan v2 still takes a single image; this
  // just gives the user 4 to choose from. When we upgrade to multi-view-
  // aware 3D, this same payload feeds straight in.
  const {
    isGenerating: isGeneratingViews,
    views: generatedViews,
    generate: generateMultiViewFn,
    reset: resetMultiView,
  } = useGenerateMultiView()

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

  // Source-image deeplink (?source=<imageGenId>) — fetched and dropped into
  // the picker slot so the user lands here with their freshly-generated
  // 3D-ready image already selected. Skipped silently when the row isn't
  // an IMAGE so a bad/stale id doesn't crash the canvas.
  useEffect(() => {
    if (!deeplinkSourceId) return
    if (sourceHydratedForRef.current === deeplinkSourceId) return
    sourceHydratedForRef.current = deeplinkSourceId
    void (async () => {
      const response = await fetchGenerationByIdAPI(deeplinkSourceId)
      if (
        response.success &&
        response.data &&
        response.data.outputType === 'IMAGE'
      ) {
        setSourceImage(response.data)
      }
    })()
  }, [deeplinkSourceId])

  // The canvas displays the most recently produced 3D — either the
  // freshly generated one from this session, or the deeplinked one.
  // Live generation always wins so a user can deeplink + then click
  // generate to overwrite.
  const displayGeneration = generatedGeneration ?? hydratedGeneration

  // API key gating — surface fal key state up-front so users without a key
  // don't get a confusing 400 at generate time. The selector below lets the
  // user pick *which* fal key powers the run when they have more than one.
  const { keys, isLoading: isLoadingKeys } = useApiKeysContext()
  const falActiveKeys = useMemo(
    () =>
      keys.filter((k) => k.adapterType === AI_ADAPTER_TYPES.FAL && k.isActive),
    [keys],
  )
  const hasFalKey = falActiveKeys.length > 0
  const [selectedApiKeyId, setSelectedApiKeyId] = useState<string>('')

  // Auto-select the first fal key once they load; also recover when the
  // currently-selected key is deleted/deactivated externally.
  useEffect(() => {
    if (falActiveKeys.length === 0) {
      if (selectedApiKeyId) setSelectedApiKeyId('')
      return
    }
    const stillValid = falActiveKeys.some((k) => k.id === selectedApiKeyId)
    if (!stillValid) {
      setSelectedApiKeyId(falActiveKeys[0].id)
    }
  }, [falActiveKeys, selectedApiKeyId])

  const isHunyuan = selectedModelId === AI_MODELS.HUNYUAN3D_2_1
  const isTriposr = selectedModelId === AI_MODELS.TRIPOSR

  const canGenerate = !!sourceImage && !isGenerating && hasFalKey

  // Core submission — split out so `handleGenerate` and `handleRefineWithHunyuan`
  // (P6: TripoSR base → Hunyuan3D refine) can share the param-assembly logic.
  // Each call honours the target model's capabilities: Hunyuan adds texture +
  // octree, TripoSR adds removeBackground.
  const submitGenerate = async (override?: {
    modelId?: string
    sourceUrl?: string
    sourceGenerationId?: string | null
    sourcePrompt?: string
  }) => {
    const targetModelId = override?.modelId ?? selectedModelId
    const targetSourceUrl = override?.sourceUrl ?? sourceImage?.url
    if (!targetSourceUrl) return

    const targetSourceGenId =
      override?.sourceGenerationId !== undefined
        ? (override.sourceGenerationId ?? undefined)
        : sourceImage?.id
    const targetPrompt = override?.sourcePrompt ?? sourceImage?.prompt
    const targetIsHunyuan = targetModelId === AI_MODELS.HUNYUAN3D_2_1
    const targetIsTriposr = targetModelId === AI_MODELS.TRIPOSR

    const params: Generate3DRequest = {
      imageUrl: targetSourceUrl,
      modelId: targetModelId,
      ...(targetSourceGenId && { sourceGenerationId: targetSourceGenId }),
      ...(targetPrompt && { prompt: targetPrompt }),
      prep3D,
      ...(selectedApiKeyId && { apiKeyId: selectedApiKeyId }),
      ...(targetIsHunyuan && {
        texturedMesh,
        octreeResolution,
      }),
      ...(targetIsTriposr && {
        removeBackground,
      }),
    }
    await generate(params)
  }

  const handleGenerate = () => submitGenerate()

  // P6: TripoSR (cheap base) → Hunyuan3D (premium refine).
  // Only surfaces when the currently-displayed mesh came from TripoSR, and
  // we still know which source image produced it (either in this session via
  // `sourceImage`, or via the hydrated row's `referenceImageUrl`).
  const refineSourceUrl =
    sourceImage?.url ?? displayGeneration?.referenceImageUrl ?? null
  const canRefine =
    !!displayGeneration &&
    displayGeneration.model === AI_MODELS.TRIPOSR &&
    !!refineSourceUrl &&
    !isGenerating &&
    hasFalKey

  const handleRefineWithHunyuan = async () => {
    if (!canRefine || !refineSourceUrl) return
    await submitGenerate({
      modelId: AI_MODELS.HUNYUAN3D_2_1,
      sourceUrl: refineSourceUrl,
      sourceGenerationId: sourceImage?.id ?? null,
      sourcePrompt: sourceImage?.prompt ?? displayGeneration?.prompt,
    })
  }

  const handleClearSource = () => {
    setSourceImage(null)
    resetMultiView()
    reset()
  }

  // Fan out 3 reference-edit calls to render back / left / right angles
  // of the current source. Resulting GenerationRecords get stored in the
  // user's library (so they're not throwaway). The user clicks one to
  // swap it in as the new source for 3D.
  const handleGenerate4Views = async () => {
    if (!sourceImage || isGeneratingViews) return
    await generateMultiViewFn({
      imageUrl: sourceImage.url,
      sourceGenerationId: sourceImage.id,
    })
  }

  const handleSelectView = (view: GenerationRecord) => {
    setSourceImage(view)
    // Don't reset generatedViews — let the user toggle between angles.
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
              >
                {/*
                 * model-viewer wires `slot="ar-button"` to its AR launcher.
                 * On AR-capable devices (iOS Quick Look / Android Scene
                 * Viewer / WebXR) the click enters AR directly; on desktop
                 * model-viewer falls back to a QR code overlay so the user
                 * can scan-to-AR with their phone.
                 */}
                <button
                  slot="ar-button"
                  type="button"
                  className="absolute bottom-6 right-6 inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background shadow-sm hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <Box className="size-3.5" />
                  {t('openInAR')}
                </button>
              </ModelViewer>
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
                {/*
                 * Refine entry — only visible when the current mesh is a
                 * TripoSR base. Triggers a second pass through Hunyuan3D
                 * using the same source image, so the user can preview cheap
                 * first and only pay for high-fidelity when they like the
                 * result.
                 */}
                {canRefine && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleRefineWithHunyuan}
                    title={t('refineHint')}
                  >
                    <Sparkles className="mr-1.5 size-3.5" />
                    {t('refineLabel')}
                    {hunyuanCost && (
                      <span className="ml-1.5 text-xs opacity-70">
                        · {t('refineCreditSuffix', { credits: hunyuanCost })}
                      </span>
                    )}
                  </Button>
                )}
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
              {/*
               * Empty-canvas affordance to load a previously generated 3D
               * back into the viewer — same effect as the `?gen=<id>`
               * deeplink that AssetDetailSheet's "Remix in Studio" produces,
               * but reachable without leaving 3D Studio.
               */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setExistingModelPickerOpen(true)}
                className="rounded-full"
              >
                <FolderOpen className="mr-1.5 size-3.5" />
                {t('openExistingModel')}
              </Button>
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
           * fal key gate. Only visible when no active fal key is present —
           * Hunyuan3D / TripoSR both run through fal, so generation would
           * 400 without one. The "Add API key" entry lives inside the
           * banner so it disappears once the user has set one up; routine
           * model selection happens through the dropdown below.
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
              <ApiKeyDrawerTrigger className="self-start">
                <ApiKeyManager />
              </ApiKeyDrawerTrigger>
            </div>
          )}

          {/*
           * fal key selector — visible whenever the user has at least one
           * active fal key. With multiple keys it's a real picker; with one
           * it stays as a confirmation badge so the user always sees which
           * route is about to be charged.
           */}
          {hasFalKey && (
            <div className="flex flex-col gap-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                {t('apiKeyDropdownLabel')}
              </Label>
              <Select
                value={selectedApiKeyId}
                onValueChange={setSelectedApiKeyId}
              >
                {/*
                 * Trigger is hand-rendered (no <SelectValue>) so we can
                 * surface only the label and keep the masked key hidden by
                 * default — masked digits are technically already redacted
                 * but visually look like a real key to a shoulder-surfer.
                 * The dropdown content still shows masked so users with
                 * multiple keys can disambiguate.
                 */}
                <SelectTrigger className="w-full">
                  {(() => {
                    const selectedKey = falActiveKeys.find(
                      (k) => k.id === selectedApiKeyId,
                    )
                    return selectedKey ? (
                      <span className="font-medium">{selectedKey.label}</span>
                    ) : (
                      <span className="text-muted-foreground">
                        {t('apiKeyDropdownPlaceholder')}
                      </span>
                    )
                  })()}
                </SelectTrigger>
                <SelectContent>
                  {falActiveKeys.map((k) => (
                    <SelectItem key={k.id} value={k.id}>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">{k.label}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {k.maskedKey}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

          {/*
           * Method B — once we have a front view, offer to render 3 more
           * angles via reference-edit so the user can pick the cleanest
           * one for image-to-3D. Each generated view becomes its own
           * library row, so picking is just `setSourceImage(view)`.
           */}
          {sourceImage && (
            <div className="flex flex-col gap-2">
              <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                <Wand2 className="size-3" />
                {t('multiViewLabel')}
              </Label>
              {generatedViews.length === 0 ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGenerate4Views}
                    disabled={isGeneratingViews}
                    className="w-full rounded-full"
                  >
                    {isGeneratingViews ? (
                      <>
                        <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                        {t('multiViewLoading')}
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-1.5 size-3.5" />
                        {t('multiViewButton')}
                      </>
                    )}
                  </Button>
                  <p className="text-[10px] leading-4 text-muted-foreground">
                    {t('multiViewHint')}
                  </p>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { gen: sourceImage, label: t('viewFront') },
                      ...generatedViews.map((g, i) => ({
                        gen: g,
                        // Service returns views in stable order: back, left, right.
                        label:
                          i === 0
                            ? t('viewBack')
                            : i === 1
                              ? t('viewLeft')
                              : t('viewRight'),
                      })),
                    ].map(({ gen, label }) => {
                      const selected = gen.id === sourceImage.id
                      return (
                        <button
                          key={gen.id}
                          type="button"
                          onClick={() => handleSelectView(gen)}
                          className={cn(
                            'relative aspect-square overflow-hidden rounded-md ring-1 transition-all',
                            selected
                              ? 'ring-2 ring-primary'
                              : 'ring-border/40 hover:ring-border',
                          )}
                          aria-label={label}
                          aria-pressed={selected}
                        >
                          <Image
                            src={gen.url}
                            alt={label}
                            fill
                            unoptimized
                            className="object-cover"
                            sizes="80px"
                          />
                          {selected && (
                            <div className="absolute right-0.5 top-0.5 flex size-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                              <Check className="size-2.5" />
                            </div>
                          )}
                          <span className="absolute bottom-0 left-0 right-0 bg-background/80 py-0.5 text-center text-[9px] font-medium text-foreground backdrop-blur-sm">
                            {label}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-[10px] leading-4 text-muted-foreground">
                    {t('multiViewPickHint')}
                  </p>
                </>
              )}
            </div>
          )}

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

          {/*
           * Source preprocessing toggle — applies to both Hunyuan and TripoSR
           * since both benefit from a ≥1024px square source. Default ON;
           * off is essentially "send raw" for debugging.
           */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="prep-3d" className="text-sm font-medium">
                {t('prep3DLabel')}
              </Label>
              <span className="text-xs text-muted-foreground">
                {t('prep3DHint')}
              </span>
            </div>
            <Switch id="prep-3d" checked={prep3D} onCheckedChange={setPrep3D} />
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
        initialGenerations={initialGenerations}
        initialTotal={initialTotal}
        initialHasMore={initialHasMore}
        title={t('sourceImageLabel')}
        description={t('sourceImagePlaceholder')}
        mediaType="image"
      />
      {/*
       * Existing-3D picker — locked to model_3d so the user can only pick
       * previously generated GLB rows. On select we mirror the deeplink
       * path by pushing it into hydratedGeneration, so the live-generated
       * row still wins if the user later clicks Generate.
       */}
      <AssetSelectorDialog
        open={existingModelPickerOpen}
        onOpenChange={setExistingModelPickerOpen}
        onSelect={(gen) => setHydratedGeneration(gen)}
        title={t('openExistingModelTitle')}
        description={t('openExistingModelDescription')}
        mediaType="model_3d"
      />
    </div>
  )
}
