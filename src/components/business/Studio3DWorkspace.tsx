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
import Lightbox from 'yet-another-react-lightbox'
import Counter from 'yet-another-react-lightbox/plugins/counter'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import 'yet-another-react-lightbox/styles.css'
import 'yet-another-react-lightbox/plugins/counter.css'

import {
  AI_MODELS,
  getAvailableModel3DModels,
  getModelById,
  getModelMessageKey,
} from '@/constants/models'
import {
  HUNYUAN3D_FACE_COUNT,
  MODEL_3D_GENERATE_TYPE,
  MODEL_3D_MESH_FIRST_PREVIEW_MODEL_IDS,
  MODEL_3D_MULTIVIEW_MODEL_IDS,
  MODEL_3D_PREVIEW_MODE,
  MODEL_3D_SOURCE_QUALITY,
  TRELLIS_2_DECIMATION_TARGET,
  TRELLIS_2_RESOLUTIONS,
  TRELLIS_2_TEXTURE_SIZES,
} from '@/constants/model-3d-generation'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { GENERATED_VIEW_ANGLES } from '@/constants/three-d-ready-prompt'
import { USER_UPLOAD_MAX_BYTES } from '@/constants/uploads'
import { ApiKeyDrawerTrigger } from '@/components/business/ApiKeyDrawerTrigger'
import { ApiKeyManager } from '@/components/business/ApiKeyManager'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { ModelViewer } from '@/components/business/ModelViewer'
import { WireframeModelPreview } from '@/components/business/WireframeModelPreview'
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
import type {
  Generate3DRequest,
  GenerationRecord,
  MultiViewGenerateRequest,
  MultiViewImageRecord,
} from '@/types'

interface Studio3DWorkspaceProps {
  initialGenerations: GenerationRecord[]
  initialTotal: number
  initialHasMore: boolean
  initialNextCursor?: string | null
}

const HUNYUAN3D_V3_MODEL_IDS = new Set<string>([
  AI_MODELS.HUNYUAN3D_V3,
  AI_MODELS.HUNYUAN3D_V31_PRO,
])
const MESH_FIRST_PREVIEW_MODEL_IDS = new Set<string>(
  MODEL_3D_MESH_FIRST_PREVIEW_MODEL_IDS,
)

const FACE_COUNT_OPTIONS = [
  { value: HUNYUAN3D_FACE_COUNT.DEFAULT, label: '500k' },
  { value: HUNYUAN3D_FACE_COUNT.HIGH, label: '1M' },
  { value: HUNYUAN3D_FACE_COUNT.MAX, label: '1.5M' },
]

const TRELLIS_DECIMATION_OPTIONS = [
  { value: TRELLIS_2_DECIMATION_TARGET.WEB, label: '50k' },
  { value: TRELLIS_2_DECIMATION_TARGET.DEFAULT, label: '500k' },
  { value: TRELLIS_2_DECIMATION_TARGET.HIGH, label: '1M' },
  { value: TRELLIS_2_DECIMATION_TARGET.MAX, label: '2M' },
]

type GeneratedSideView = (typeof GENERATED_VIEW_ANGLES)[number]
type ManualMultiViewImages = Partial<
  Record<GeneratedSideView, MultiViewImageRecord>
>

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function getMultiViewImages(
  views: MultiViewImageRecord[],
): Generate3DRequest['multiViewImages'] | undefined {
  const images: Generate3DRequest['multiViewImages'] = {}
  for (const view of views) {
    if (view.view === 'back') images.backImageUrl = view.url
    if (view.view === 'left') images.leftImageUrl = view.url
    if (view.view === 'right') images.rightImageUrl = view.url
  }

  return Object.keys(images).length > 0 ? images : undefined
}

function mergeMultiViewImages(
  generatedViews: MultiViewImageRecord[],
  manualViews: ManualMultiViewImages,
): MultiViewImageRecord[] {
  const byView = new Map<GeneratedSideView, MultiViewImageRecord>()
  for (const view of generatedViews) {
    byView.set(view.view, view)
  }
  for (const view of GENERATED_VIEW_ANGLES) {
    const manualView = manualViews[view]
    if (manualView) byView.set(view, manualView)
  }

  return GENERATED_VIEW_ANGLES.flatMap((view) => {
    const image = byView.get(view)
    return image ? [image] : []
  })
}

export function Studio3DWorkspace({
  initialGenerations,
  initialTotal,
  initialHasMore,
  initialNextCursor,
}: Studio3DWorkspaceProps) {
  const t = useTranslations('Model3DGenerate')
  const tModels = useTranslations('Models')
  const models = useMemo(() => getAvailableModel3DModels(), [])
  // P6: surface Hunyuan's credit cost on the Refine button so the user knows
  // what they're about to spend. Pulled from the registry instead of being
  // hardcoded so the price stays in sync with `model-3d.ts`.
  const hunyuanCost = useMemo(
    () => models.find((m) => m.id === AI_MODELS.HUNYUAN3D_V31_PRO)?.cost,
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
    models[0]?.id ?? AI_MODELS.HUNYUAN3D_V31_PRO,
  )
  const [enablePbr, setEnablePbr] = useState(true)
  const [faceCount, setFaceCount] = useState<number>(HUNYUAN3D_FACE_COUNT.HIGH)
  const [trellisResolution, setTrellisResolution] =
    useState<(typeof TRELLIS_2_RESOLUTIONS)[number]>(1536)
  const [trellisTextureSize, setTrellisTextureSize] =
    useState<(typeof TRELLIS_2_TEXTURE_SIZES)[number]>(4096)
  const [trellisDecimationTarget, setTrellisDecimationTarget] =
    useState<number>(TRELLIS_2_DECIMATION_TARGET.HIGH)
  const [trellisRemesh, setTrellisRemesh] = useState(true)
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
  const [finalModelVisible, setFinalModelVisible] = useState(false)

  // Multi-view input — once the user has a front-view source image we
  // generate temporary back / left / right views via reference-edit. These
  // are not Generation rows; Hunyuan v3/v3.1 receives them alongside the
  // front view during the final 3D submission.
  const {
    isGenerating: isGeneratingViews,
    views: generatedViews,
    generate: generateMultiViewFn,
    restore: restoreMultiView,
    reset: resetMultiView,
  } = useGenerateMultiView()
  const multiViewSourceRef = useRef<string | null>(null)
  const manualViewInputRefs = useRef<
    Partial<Record<GeneratedSideView, HTMLInputElement | null>>
  >({})
  const [selectedMultiViewModelId, setSelectedMultiViewModelId] =
    useState<string>(MODEL_3D_MULTIVIEW_MODEL_IDS[0])
  const [selectedMultiViewApiKeyId, setSelectedMultiViewApiKeyId] =
    useState<string>('')
  const [manualMultiViewImages, setManualMultiViewImages] =
    useState<ManualMultiViewImages>({})
  const [manualMultiViewOpen, setManualMultiViewOpen] = useState(false)
  const [uploadingManualView, setUploadingManualView] =
    useState<GeneratedSideView | null>(null)
  const [multiViewLightboxIndex, setMultiViewLightboxIndex] = useState(-1)

  const {
    isGenerating,
    stage,
    elapsedSeconds,
    previewModelUrl,
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
  const displayGenerationId = displayGeneration?.id ?? null

  useEffect(() => {
    setFinalModelVisible(false)
  }, [displayGenerationId])

  const generationStageLabel =
    stage === 'queued'
      ? t('stageQueued')
      : stage === 'mesh'
        ? t('stageMesh')
        : stage === 'texture'
          ? t('stageTexture')
          : stage === 'uploading'
            ? t('stageUploading')
            : t('stageGenerating')

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

  const selectedMultiViewModel = useMemo(
    () => getModelById(selectedMultiViewModelId),
    [selectedMultiViewModelId],
  )
  const multiViewActiveKeys = useMemo(() => {
    const adapterType = selectedMultiViewModel?.adapterType
    if (!adapterType) return []
    return keys.filter((k) => k.adapterType === adapterType && k.isActive)
  }, [keys, selectedMultiViewModel])
  const canUseSelectedMultiViewModel =
    !!selectedMultiViewModel &&
    (selectedMultiViewModel.freeTier === true || multiViewActiveKeys.length > 0)

  useEffect(() => {
    if (multiViewActiveKeys.length === 0) {
      if (selectedMultiViewApiKeyId) setSelectedMultiViewApiKeyId('')
      return
    }
    const stillValid = multiViewActiveKeys.some(
      (k) => k.id === selectedMultiViewApiKeyId,
    )
    if (!stillValid) {
      setSelectedMultiViewApiKeyId(multiViewActiveKeys[0].id)
    }
  }, [multiViewActiveKeys, selectedMultiViewApiKeyId])

  const isHunyuanV3 = HUNYUAN3D_V3_MODEL_IDS.has(selectedModelId)
  const isTrellis2 = selectedModelId === AI_MODELS.TRELLIS_2
  const isTriposr = selectedModelId === AI_MODELS.TRIPOSR
  const supportsMultiViewInput = isHunyuanV3
  const supportsMeshFirstPreview =
    MESH_FIRST_PREVIEW_MODEL_IDS.has(selectedModelId)
  const sourceIdentity = sourceImage?.id ?? sourceImage?.url ?? null

  useEffect(() => {
    setManualMultiViewImages({})
    setManualMultiViewOpen(false)
  }, [sourceIdentity])

  useEffect(() => {
    const multiViewModelId = selectedMultiViewModel?.id
    const sourceKey =
      sourceImage && supportsMultiViewInput && multiViewModelId
        ? `${sourceImage.id ?? sourceImage.url}:${multiViewModelId}`
        : null
    if (multiViewSourceRef.current === sourceKey) return
    multiViewSourceRef.current = sourceKey

    if (!sourceImage || !supportsMultiViewInput || !multiViewModelId) {
      resetMultiView()
      return
    }

    const restored = restoreMultiView({
      imageUrl: sourceImage.url,
      sourceGenerationId: sourceImage.id,
      modelId: multiViewModelId,
    })
    if (!restored) resetMultiView()
  }, [
    sourceImage,
    supportsMultiViewInput,
    selectedMultiViewModel,
    resetMultiView,
    restoreMultiView,
  ])

  const sourceQualityIssues = useMemo(() => {
    if (!sourceImage) return []
    if (sourceImage.width <= 0 || sourceImage.height <= 0) return []

    const issues: string[] = []
    const minEdge = Math.min(sourceImage.width, sourceImage.height)
    const aspectRatio =
      Math.max(sourceImage.width, sourceImage.height) / minEdge
    if (minEdge < MODEL_3D_SOURCE_QUALITY.MIN_EDGE_PX) {
      issues.push(
        t('sourceQualityTooSmall', {
          width: sourceImage.width,
          height: sourceImage.height,
        }),
      )
    }
    if (aspectRatio > MODEL_3D_SOURCE_QUALITY.MAX_ASPECT_RATIO) {
      issues.push(
        t('sourceQualityExtremeAspect', {
          width: sourceImage.width,
          height: sourceImage.height,
        }),
      )
    }
    return issues
  }, [sourceImage, t])

  const effectiveMultiViewViews = useMemo(
    () => mergeMultiViewImages(generatedViews, manualMultiViewImages),
    [generatedViews, manualMultiViewImages],
  )

  const canGenerate =
    !!sourceImage &&
    !isGenerating &&
    hasFalKey &&
    sourceQualityIssues.length === 0

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
    const targetIsHunyuanV3 = HUNYUAN3D_V3_MODEL_IDS.has(targetModelId)
    const targetIsTrellis2 = targetModelId === AI_MODELS.TRELLIS_2
    const targetIsTriposr = targetModelId === AI_MODELS.TRIPOSR
    const multiViewImages = targetIsHunyuanV3
      ? getMultiViewImages(effectiveMultiViewViews)
      : undefined

    const params: Generate3DRequest = {
      imageUrl: targetSourceUrl,
      modelId: targetModelId,
      ...(targetSourceGenId && { sourceGenerationId: targetSourceGenId }),
      ...(targetPrompt && { prompt: targetPrompt }),
      prep3D,
      ...(selectedApiKeyId && { apiKeyId: selectedApiKeyId }),
      ...(targetIsHunyuanV3 && {
        enablePbr,
        faceCount,
        generateType: MODEL_3D_GENERATE_TYPE.NORMAL,
        ...(MESH_FIRST_PREVIEW_MODEL_IDS.has(targetModelId) && {
          previewMode: MODEL_3D_PREVIEW_MODE.MESH_FIRST,
        }),
        ...(multiViewImages && { multiViewImages }),
      }),
      ...(targetIsTrellis2 && {
        trellisResolution,
        trellisTextureSize,
        trellisDecimationTarget,
        trellisRemesh,
        trellisRemeshProject: 1,
        trellisStructureSamplingSteps: 24,
        trellisShapeSamplingSteps: 24,
        trellisTextureSamplingSteps: 24,
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
      modelId: AI_MODELS.HUNYUAN3D_V31_PRO,
      sourceUrl: refineSourceUrl,
      sourceGenerationId: sourceImage?.id ?? null,
      sourcePrompt: sourceImage?.prompt ?? displayGeneration?.prompt,
    })
  }

  const handleClearSource = () => {
    setSourceImage(null)
    resetMultiView()
    setManualMultiViewImages({})
    setManualMultiViewOpen(false)
    reset()
  }

  const handleSelectSourceImage = (generation: GenerationRecord) => {
    setSourceImage(generation)
    resetMultiView()
    setManualMultiViewImages({})
    setManualMultiViewOpen(false)
    reset()
  }

  // Fan out 3 reference-edit calls to render back / left / right angles
  // of the current source. Results stay as temporary provider URLs and are
  // submitted with the final Hunyuan v3/v3.1 job instead of being archived.
  const handleGenerate4Views = async (options?: { force?: boolean }) => {
    if (
      !sourceImage ||
      isGeneratingViews ||
      !supportsMultiViewInput ||
      !canUseSelectedMultiViewModel ||
      !selectedMultiViewModel
    ) {
      return
    }
    const request: MultiViewGenerateRequest = {
      imageUrl: sourceImage.url,
      sourceGenerationId: sourceImage.id,
      modelId: selectedMultiViewModel.id,
      ...(selectedMultiViewApiKeyId && {
        apiKeyId: selectedMultiViewApiKeyId,
      }),
    }
    if (!options?.force && restoreMultiView(request)) return
    const views = await generateMultiViewFn(request, options)
    if (views.length < GENERATED_VIEW_ANGLES.length) {
      setManualMultiViewOpen(true)
    }
  }

  const handleManualViewUploadClick = (view: GeneratedSideView) => {
    manualViewInputRefs.current[view]?.click()
  }

  const handleRemoveManualView = (view: GeneratedSideView) => {
    setManualMultiViewImages((prev) => {
      const next = { ...prev }
      delete next[view]
      return next
    })
  }

  const getViewLabel = (view: GeneratedSideView) =>
    view === 'back'
      ? t('viewBack')
      : view === 'left'
        ? t('viewLeft')
        : t('viewRight')

  const handleManualViewFileChange = async (
    view: GeneratedSideView,
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

    setUploadingManualView(view)
    try {
      const dataUrl = await readFileAsDataUrl(file)
      const response = await uploadImageAPI({
        imageDataUrl: dataUrl,
        note: t('manualViewUploadNote', { view: getViewLabel(view) }),
      })
      if (!response.success || !response.data) {
        toast.error(response.error ?? t('errorFallback'))
        return
      }

      const generation = response.data.generation
      setManualMultiViewImages((prev) => ({
        ...prev,
        [view]: {
          id: generation.id,
          view,
          url: generation.url,
          width: generation.width,
          height: generation.height,
          prompt: generation.prompt,
          model: generation.model,
          provider: generation.provider,
        },
      }))
      toast.success(t('manualViewUploadSuccess', { view: getViewLabel(view) }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('errorUnexpected'))
    } finally {
      setUploadingManualView(null)
    }
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
      const dataUrl = await readFileAsDataUrl(file)
      const response = await uploadImageAPI({ imageDataUrl: dataUrl })
      if (!response.success || !response.data) {
        toast.error(response.error ?? t('errorFallback'))
        return
      }
      handleSelectSourceImage(response.data.generation)
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
            <div className="relative size-full">
              {previewModelUrl && !finalModelVisible && (
                <WireframeModelPreview
                  src={previewModelUrl}
                  label={t('wireframePreviewLabel')}
                  loadingLabel={t('wireframePreviewLoading')}
                  errorLabel={t('wireframePreviewError')}
                  className="absolute inset-0 h-full w-full"
                />
              )}
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
                className={cn(
                  'h-full w-full transition-opacity duration-500',
                  previewModelUrl && !finalModelVisible
                    ? 'pointer-events-none opacity-0'
                    : 'opacity-100',
                )}
                onModelVisible={() => setFinalModelVisible(true)}
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
            </div>
          ) : isGenerating ? (
            <WireframeModelPreview
              src={previewModelUrl}
              label={t('wireframePreviewLabel')}
              loadingLabel={t('wireframePreviewLoading')}
              errorLabel={t('wireframePreviewError')}
              className="h-full w-full"
            />
          ) : previewModelUrl ? (
            <WireframeModelPreview
              src={previewModelUrl}
              label={t('wireframePreviewLabel')}
              loadingLabel={t('wireframePreviewLoading')}
              errorLabel={t('wireframePreviewError')}
              className="h-full w-full"
            />
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
            <div className="pointer-events-none absolute bottom-6 left-6 right-6 mx-auto max-w-md rounded-full border border-white/10 bg-neutral-950/85 px-4 py-2 text-neutral-100 shadow-lg backdrop-blur-md">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-medium">{generationStageLabel}</span>
                <span className="text-neutral-400">
                  {t('elapsed', { seconds: `${elapsedSeconds}s` })}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1">
                <span
                  className={cn(
                    'h-1 rounded-full',
                    previewModelUrl || stage === 'mesh' || stage === 'texture'
                      ? 'bg-emerald-400'
                      : 'animate-pulse bg-emerald-400/60',
                  )}
                />
                <span
                  className={cn(
                    'h-1 rounded-full',
                    stage === 'texture' ? 'bg-emerald-400' : 'bg-white/20',
                  )}
                />
              </div>
            </div>
          )}
        </main>

        {/* Right panel — image picker + model + params + generate */}
        <aside className="flex min-h-0 w-full shrink-0 flex-col gap-4 overflow-y-auto border-t border-border/40 bg-muted/10 p-5 md:w-80 md:border-l md:border-t-0">
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
              <div className="flex flex-col gap-2">
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
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPickerOpen(true)}
                    disabled={uploading || isGenerating}
                    className="rounded-full text-xs"
                  >
                    <FolderOpen className="mr-1.5 size-3" />
                    {t('selectFromAssets')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleUploadClick}
                    disabled={uploading || isGenerating}
                    className="rounded-full text-xs"
                  >
                    {uploading ? (
                      <Loader2 className="mr-1.5 size-3 animate-spin" />
                    ) : (
                      <Upload className="mr-1.5 size-3" />
                    )}
                    {uploading ? t('uploading') : t('uploadButton')}
                  </Button>
                </div>
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
                    {t('selectFromAssets')}
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

          {sourceImage && (
            <div
              className={cn(
                'rounded-lg border p-3 text-xs leading-5',
                sourceQualityIssues.length > 0
                  ? 'border-destructive/40 bg-destructive/10 text-destructive'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-muted-foreground',
              )}
            >
              <div className="mb-1 flex items-center gap-1.5 font-medium">
                {sourceQualityIssues.length > 0 ? (
                  <AlertTriangle className="size-3.5" />
                ) : (
                  <Check className="size-3.5 text-emerald-600" />
                )}
                <span>
                  {sourceQualityIssues.length > 0
                    ? t('sourceQualityBlocked')
                    : t('sourceQualityReady')}
                </span>
              </div>
              {sourceQualityIssues.length > 0 ? (
                <ul className="list-disc space-y-1 pl-4">
                  {sourceQualityIssues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              ) : (
                <p>{t('sourceQualityChecklist')}</p>
              )}
            </div>
          )}

          {/*
           * Method B — once we have a front view and a multi-view-capable
           * Hunyuan model, render or upload side views. The final 3D job
           * receives every available view together.
           */}
          {sourceImage && (
            <div className="flex flex-col gap-2">
              <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                <Wand2 className="size-3" />
                {t('multiViewLabel')}
              </Label>
              {supportsMultiViewInput && (
                <div className="flex flex-col gap-2">
                  <Select
                    value={selectedMultiViewModelId}
                    onValueChange={(v) => setSelectedMultiViewModelId(v)}
                  >
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue placeholder={t('multiViewModelLabel')} />
                    </SelectTrigger>
                    <SelectContent>
                      {MODEL_3D_MULTIVIEW_MODEL_IDS.map((modelId) => {
                        const messageKey = getModelMessageKey(modelId)
                        return (
                          <SelectItem key={modelId} value={modelId}>
                            {tModels(`${messageKey}.label`)}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>

                  {multiViewActiveKeys.length > 0 && (
                    <Select
                      value={selectedMultiViewApiKeyId}
                      onValueChange={setSelectedMultiViewApiKeyId}
                    >
                      <SelectTrigger className="h-9 w-full">
                        {(() => {
                          const selectedKey = multiViewActiveKeys.find(
                            (k) => k.id === selectedMultiViewApiKeyId,
                          )
                          return selectedKey ? (
                            <span className="font-medium">
                              {selectedKey.label}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              {t('apiKeyDropdownPlaceholder')}
                            </span>
                          )
                        })()}
                      </SelectTrigger>
                      <SelectContent>
                        {multiViewActiveKeys.map((k) => (
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
                  )}
                </div>
              )}

              {effectiveMultiViewViews.length === 0 ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleGenerate4Views()}
                    disabled={
                      isGeneratingViews ||
                      !supportsMultiViewInput ||
                      !canUseSelectedMultiViewModel
                    }
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
                    {!supportsMultiViewInput
                      ? t('multiViewUnsupportedHint')
                      : canUseSelectedMultiViewModel
                        ? t('multiViewHint')
                        : t('multiViewApiKeyMissing')}
                  </p>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { gen: sourceImage, label: t('viewFront') },
                      ...effectiveMultiViewViews.map((view) => ({
                        gen: view,
                        label: getViewLabel(view.view),
                      })),
                    ].map(({ gen, label }, index) => {
                      const isFront = gen.id === sourceImage.id
                      return (
                        <button
                          type="button"
                          key={gen.id}
                          onClick={() => setMultiViewLightboxIndex(index)}
                          className={cn(
                            'relative aspect-square overflow-hidden rounded-md ring-1 transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                            isFront ? 'ring-2 ring-primary' : 'ring-border/40',
                          )}
                        >
                          <Image
                            src={gen.url}
                            alt={label}
                            fill
                            unoptimized
                            className="object-cover"
                            sizes="80px"
                          />
                          {isFront && (
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleGenerate4Views({ force: true })}
                    disabled={
                      isGeneratingViews ||
                      !supportsMultiViewInput ||
                      !canUseSelectedMultiViewModel
                    }
                    className="h-8 w-full rounded-full text-xs"
                  >
                    {isGeneratingViews ? (
                      <>
                        <Loader2 className="mr-1.5 size-3 animate-spin" />
                        {t('multiViewLoading')}
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-1.5 size-3" />
                        {t('multiViewRegenerateButton')}
                      </>
                    )}
                  </Button>
                  <Lightbox
                    open={multiViewLightboxIndex >= 0}
                    close={() => setMultiViewLightboxIndex(-1)}
                    index={multiViewLightboxIndex}
                    slides={[
                      { src: sourceImage.url, alt: t('viewFront') },
                      ...effectiveMultiViewViews.map((view) => ({
                        src: view.url,
                        alt: getViewLabel(view.view),
                      })),
                    ]}
                    plugins={[Zoom, Counter]}
                    carousel={{ finite: true }}
                    zoom={{ maxZoomPixelRatio: 3, scrollToZoom: true }}
                    styles={{
                      container: { backgroundColor: 'rgba(0, 0, 0, 0.9)' },
                    }}
                    animation={{ fade: 300, swipe: 300 }}
                  />
                </>
              )}

              {supportsMultiViewInput && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setManualMultiViewOpen((open) => !open)}
                    className="h-8 justify-start rounded-full px-2 text-xs"
                  >
                    <Upload className="mr-1.5 size-3" />
                    {manualMultiViewOpen
                      ? t('manualViewHide')
                      : t('manualViewShow')}
                  </Button>

                  {manualMultiViewOpen && (
                    <div className="grid grid-cols-3 gap-1.5">
                      {GENERATED_VIEW_ANGLES.map((view) => {
                        const manualImage = manualMultiViewImages[view]
                        const isUploading = uploadingManualView === view
                        const label = getViewLabel(view)
                        return (
                          <div
                            key={view}
                            className="relative flex min-w-0 flex-col gap-1"
                          >
                            <div className="relative aspect-square overflow-hidden rounded-md border border-dashed border-border/60 bg-muted/30">
                              {manualImage ? (
                                <Image
                                  src={manualImage.url}
                                  alt={label}
                                  fill
                                  unoptimized
                                  className="object-cover"
                                  sizes="80px"
                                />
                              ) : (
                                <div className="flex size-full items-center justify-center text-muted-foreground">
                                  <ImageIcon className="size-4" />
                                </div>
                              )}
                              <span className="absolute bottom-0 left-0 right-0 bg-background/80 py-0.5 text-center text-[9px] font-medium text-foreground backdrop-blur-sm">
                                {label}
                              </span>
                              {manualImage && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveManualView(view)}
                                  className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-background/85 text-foreground shadow-sm backdrop-blur-sm hover:bg-background"
                                  aria-label={t('manualViewRemoveLabel', {
                                    view: label,
                                  })}
                                >
                                  <X className="size-3" />
                                </button>
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleManualViewUploadClick(view)}
                              disabled={uploadingManualView !== null}
                              className="h-7 rounded-full px-2 text-[10px]"
                            >
                              {isUploading ? (
                                <Loader2 className="mr-1 size-3 animate-spin" />
                              ) : (
                                <Upload className="mr-1 size-3" />
                              )}
                              {manualImage
                                ? t('manualViewReplace')
                                : t('manualViewUpload')}
                            </Button>
                            <input
                              ref={(node) => {
                                manualViewInputRefs.current[view] = node
                              }}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(event) =>
                                handleManualViewFileChange(view, event)
                              }
                            />
                          </div>
                        )
                      })}
                    </div>
                  )}
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
                  const messageKey = getModelMessageKey(model.id)
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

          {isHunyuanV3 && (
            <div className="flex flex-col gap-3">
              {supportsMeshFirstPreview && (
                <div className="rounded-lg border border-border/50 bg-background/50 px-3 py-2 text-xs leading-5 text-muted-foreground">
                  {t('meshPreviewHint')}
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <Label htmlFor="enable-pbr" className="text-sm font-medium">
                    {t('enablePbrLabel')}
                  </Label>
                  <span className="text-xs text-muted-foreground">
                    {t('enablePbrHint')}
                  </span>
                </div>
                <Switch
                  id="enable-pbr"
                  checked={enablePbr}
                  onCheckedChange={setEnablePbr}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  {t('faceCountLabel')}
                </Label>
                <Select
                  value={String(faceCount)}
                  onValueChange={(v) => setFaceCount(Number(v))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FACE_COUNT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {isTrellis2 && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    {t('trellisResolutionLabel')}
                  </Label>
                  <Select
                    value={String(trellisResolution)}
                    onValueChange={(v) =>
                      setTrellisResolution(
                        Number(v) as (typeof TRELLIS_2_RESOLUTIONS)[number],
                      )
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRELLIS_2_RESOLUTIONS.map((value) => (
                        <SelectItem key={value} value={String(value)}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    {t('trellisTextureLabel')}
                  </Label>
                  <Select
                    value={String(trellisTextureSize)}
                    onValueChange={(v) =>
                      setTrellisTextureSize(
                        Number(v) as (typeof TRELLIS_2_TEXTURE_SIZES)[number],
                      )
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRELLIS_2_TEXTURE_SIZES.map((value) => (
                        <SelectItem key={value} value={String(value)}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  {t('trellisDecimationLabel')}
                </Label>
                <Select
                  value={String(trellisDecimationTarget)}
                  onValueChange={(v) => setTrellisDecimationTarget(Number(v))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRELLIS_DECIMATION_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <Label
                    htmlFor="trellis-remesh"
                    className="text-sm font-medium"
                  >
                    {t('trellisRemeshLabel')}
                  </Label>
                  <span className="text-xs text-muted-foreground">
                    {t('trellisRemeshHint')}
                  </span>
                </div>
                <Switch
                  id="trellis-remesh"
                  checked={trellisRemesh}
                  onCheckedChange={setTrellisRemesh}
                />
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
        onSelect={handleSelectSourceImage}
        initialGenerations={initialGenerations}
        initialTotal={initialTotal}
        initialHasMore={initialHasMore}
        initialNextCursor={initialNextCursor}
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
