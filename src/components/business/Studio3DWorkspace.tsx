'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Box,
  Check,
  ChevronDown,
  Dices,
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
  MODEL_3D_MULTIVIEW_MODEL_IDS,
  MODEL_3D_SOURCE_QUALITY,
  RODIN_FACE_COUNT_LABEL,
  RODIN_GEOMETRY_FILE_FORMAT,
  RODIN_GEOMETRY_FILE_FORMATS,
  RODIN_GEOMETRY_INSTRUCT_MODE,
  RODIN_GEOMETRY_INSTRUCT_MODES,
  RODIN_IS_MICRO_REQUIRED_TIER,
  RODIN_MATERIAL,
  RODIN_MATERIALS,
  RODIN_MAX_REFERENCE_IMAGES,
  RODIN_MESH_MODE,
  RODIN_MESH_MODES,
  RODIN_QUALITY,
  RODIN_QUALITIES,
  RODIN_TEXTURE_MODE,
  RODIN_TEXTURE_MODES,
  RODIN_TIER,
  RODIN_TIER_CREDITS,
  RODIN_TIER_ESTIMATED_SECONDS,
  RODIN_HIGHPACK_EXTRA_CREDITS,
  RODIN_TIERS,
  TRELLIS_2_DECIMATION_TARGET,
  TRELLIS_2_RESOLUTIONS,
  TRELLIS_2_TEXTURE_SIZES,
  type RodinGeometryFileFormat,
  type RodinGeometryInstructMode,
  type RodinMaterial,
  type RodinMeshMode,
  type RodinQuality,
  type RodinTextureMode,
  type RodinTier,
} from '@/constants/model-3d-generation'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { GENERATED_VIEW_ANGLES } from '@/constants/three-d-ready-prompt'
import { USER_UPLOAD_MAX_BYTES } from '@/constants/uploads'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { QuickSetupDialog } from '@/components/business/studio/QuickSetupDialog'
import { ModelViewer } from '@/components/business/ModelViewer'
import { StageStepperBar } from '@/components/business/StageStepperBar'
import { WireframeModelPreview } from '@/components/business/WireframeModelPreview'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { prepareImageUpload } from '@/lib/prepare-image-upload'
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

type Preset3DId = 'fidelity' | 'detail' | 'fast'

interface Preset3D {
  id: Preset3DId
  multiViewModelId: string
  enablePbr: boolean
  faceCount: number
}

// PR1-A2: opinionated 3D parameter bundles for Hunyuan3D v3 / v3.1 Pro.
// `fidelity` is the default — 500k faces stays sharper than 1M/1.5M because
// texel density holds up, and Flux Kontext preserves pose for the side views.
// `detail` only pays off for texture-heavy industrial subjects. `fast` keeps
// the same Flux Kontext multi-view source (the speed/cost difference is in
// PBR off + 500k face budget) — previously it swapped to Gemini Flash, but
// Gemini's reference-edit was both less stable on anime/figurine subjects
// and prone to 60s timeouts that tripped the per-provider circuit breaker
// once 5 concurrent angle calls fanned out.
const PRESETS_3D: readonly Preset3D[] = [
  {
    id: 'fidelity',
    multiViewModelId: AI_MODELS.FLUX_KONTEXT_PRO,
    enablePbr: true,
    faceCount: HUNYUAN3D_FACE_COUNT.DEFAULT,
  },
  {
    id: 'detail',
    multiViewModelId: AI_MODELS.FLUX_KONTEXT_PRO,
    enablePbr: true,
    faceCount: HUNYUAN3D_FACE_COUNT.HIGH,
  },
  {
    id: 'fast',
    multiViewModelId: AI_MODELS.FLUX_KONTEXT_PRO,
    enablePbr: false,
    faceCount: HUNYUAN3D_FACE_COUNT.DEFAULT,
  },
] as const

const PRESET_I18N: Record<Preset3DId, { label: string; hint: string }> = {
  fidelity: { label: 'presetFidelityLabel', hint: 'presetFidelityHint' },
  detail: { label: 'presetDetailLabel', hint: 'presetDetailHint' },
  fast: { label: 'presetFastLabel', hint: 'presetFastHint' },
}

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
    if (view.view === 'leftFront') images.leftFrontImageUrl = view.url
    if (view.view === 'rightFront') images.rightFrontImageUrl = view.url
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

interface RodinAngleSlotProps {
  angle: string
  label: string
  url: string | null
  isUploading: boolean
  onUpload: () => void
  onRemove: () => void
}

function RodinAngleSlot({
  label,
  url,
  isUploading,
  onUpload,
  onRemove,
}: RodinAngleSlotProps) {
  if (isUploading) {
    return (
      <div className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-border/60 bg-muted/20">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (url) {
    return (
      <div className="group relative aspect-square overflow-hidden rounded-md border border-primary/40 bg-primary/5">
        <Image
          src={url}
          alt={label}
          fill
          unoptimized
          className="object-cover"
          sizes="80px"
        />
        <span className="absolute bottom-0 left-0 right-0 bg-background/80 py-0.5 text-center text-[9px] font-medium text-foreground backdrop-blur-sm">
          {label}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="absolute right-0.5 top-0.5 hidden rounded-sm bg-background/80 p-0.5 text-foreground hover:bg-background group-hover:flex"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onUpload}
      className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border/60 text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
    >
      <ImageIcon className="h-3.5 w-3.5" />
      <span className="text-[9px] font-medium uppercase tracking-wide">
        {label}
      </span>
    </button>
  )
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
  const [quickSetupOpen, setQuickSetupOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedModelId, setSelectedModelId] = useState<string>(
    AI_MODELS.RODIN_GEN_2_5,
  )
  const [enablePbr, setEnablePbr] = useState(true)
  // PR1-A2: default face budget is 500k (the `fidelity` preset). Counter-
  // intuitively this is sharper than 1M/1.5M for character/figurine subjects
  // because texel density stays high. High/Max budgets are still selectable
  // via the `detail` preset or the manual face-count dropdown.
  const [faceCount, setFaceCount] = useState<number>(
    HUNYUAN3D_FACE_COUNT.DEFAULT,
  )
  const [trellisResolution, setTrellisResolution] =
    useState<(typeof TRELLIS_2_RESOLUTIONS)[number]>(1536)
  const [trellisTextureSize, setTrellisTextureSize] =
    useState<(typeof TRELLIS_2_TEXTURE_SIZES)[number]>(4096)
  const [trellisDecimationTarget, setTrellisDecimationTarget] =
    useState<number>(TRELLIS_2_DECIMATION_TARGET.HIGH)
  const [trellisRemesh, setTrellisRemesh] = useState(true)
  const [removeBackground, setRemoveBackground] = useState(true)
  // Rodin Gen-2.5 parameters (defaults mirror Rodin web UI: tier=High,
  // mesh_mode=Raw + quality=high → 500K Triangle, faithful geometry, high texture)
  const [rodinTier, setRodinTier] = useState<RodinTier>(RODIN_TIER.HIGH)
  const [rodinMeshMode, setRodinMeshMode] = useState<RodinMeshMode>(
    RODIN_MESH_MODE.RAW,
  )
  const [rodinQuality, setRodinQuality] = useState<RodinQuality>(
    RODIN_QUALITY.HIGH,
  )
  const [rodinTextureMode, setRodinTextureMode] = useState<RodinTextureMode>(
    RODIN_TEXTURE_MODE.HIGH,
  )
  const [rodinMaterial, setRodinMaterial] = useState<RodinMaterial>(
    RODIN_MATERIAL.PBR,
  )
  const [rodinHighPack, setRodinHighPack] = useState(false)
  const [rodinGeometryInstructMode, setRodinGeometryInstructMode] =
    useState<RodinGeometryInstructMode>(RODIN_GEOMETRY_INSTRUCT_MODE.FAITHFUL)
  const [rodinTAPose, setRodinTAPose] = useState(false)
  const [rodinHdTexture, setRodinHdTexture] = useState(false)
  const [rodinTextureDelight, setRodinTextureDelight] = useState(false)
  const [rodinIsMicro, setRodinIsMicro] = useState(false)
  const [rodinUseOriginalAlpha, setRodinUseOriginalAlpha] = useState(false)
  const [rodinPreviewRender, setRodinPreviewRender] = useState(false)
  const [rodinPrompt, setRodinPrompt] = useState('')
  const [rodinGeometryFileFormat, setRodinGeometryFileFormat] =
    useState<RodinGeometryFileFormat>(RODIN_GEOMETRY_FILE_FORMAT.GLB)
  const [rodinSeedInput, setRodinSeedInput] = useState('')
  const [rodinQualityOverrideInput, setRodinQualityOverrideInput] = useState('')
  const [rodinBboxWidth, setRodinBboxWidth] = useState('')
  const [rodinBboxHeight, setRodinBboxHeight] = useState('')
  const [rodinBboxLength, setRodinBboxLength] = useState('')
  const [rodinAdvancedOpen, setRodinAdvancedOpen] = useState(false)
  // Additional reference image URLs (beyond the front/source image). Max 4.
  const [rodinAdditionalImages, setRodinAdditionalImages] = useState<string[]>(
    [],
  )
  // Rodin mesh-first: when ON, the first job is dispatched with material='None'
  // (untextured mesh only). The viewer then surfaces a "Continue with textures"
  // button that re-submits a second independent job with the user's actual
  // `rodinMaterial` choice + `parentGenerationId` set. OFF preserves the
  // single-job behaviour.
  const [rodinMeshFirst, setRodinMeshFirst] = useState(false)
  // Client-side "Keep as final" memory — server doesn't know about it (avoids
  // a Generation mutation route). Once dismissed for a given mesh Generation
  // id the Continue/Keep buttons stop appearing on subsequent views of it.
  const [keptAsFinalIds, setKeptAsFinalIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [uploadingRodinAngle, setUploadingRodinAngle] = useState<string | null>(
    null,
  )
  const rodinImageFileRefs = useRef<
    Partial<Record<string, HTMLInputElement | null>>
  >({})
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

  // PR1-A2: derived from the three knobs the preset bundles touch. Highlights
  // the matching chip when the user's current settings happen to match a
  // preset; goes null the moment they hand-tune anything off-preset.
  const activePresetId = useMemo<Preset3DId | null>(() => {
    const match = PRESETS_3D.find(
      (p) =>
        p.multiViewModelId === selectedMultiViewModelId &&
        p.enablePbr === enablePbr &&
        p.faceCount === faceCount,
    )
    return match?.id ?? null
  }, [selectedMultiViewModelId, enablePbr, faceCount])

  const applyPreset = (preset: Preset3D) => {
    setSelectedMultiViewModelId(preset.multiViewModelId)
    setEnablePbr(preset.enablePbr)
    setFaceCount(preset.faceCount)
  }

  const {
    isGenerating,
    stage,
    elapsedSeconds,
    previewModelUrl,
    provisionalModelUrl,
    uploadProgress,
    generatedGeneration,
    jobId: activeJobId,
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
  const multiViewUses3DRouteKey =
    selectedMultiViewModel?.adapterType === AI_ADAPTER_TYPES.FAL
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

  // Rodin BYOK keys — optional, system key is the fallback
  const rodinActiveKeys = useMemo(
    () =>
      keys.filter(
        (k) => k.adapterType === AI_ADAPTER_TYPES.HYPER3D_RODIN && k.isActive,
      ),
    [keys],
  )
  const [selectedRodinKeyId, setSelectedRodinKeyId] = useState<string>('')
  useEffect(() => {
    if (rodinActiveKeys.length === 0) {
      if (selectedRodinKeyId) setSelectedRodinKeyId('')
      return
    }
    const stillValid = rodinActiveKeys.some((k) => k.id === selectedRodinKeyId)
    if (!stillValid) setSelectedRodinKeyId(rodinActiveKeys[0].id)
  }, [rodinActiveKeys, selectedRodinKeyId])

  const selectedModel = useMemo(
    () => models.find((m) => m.id === selectedModelId),
    [models, selectedModelId],
  )
  const isHunyuanV3 = HUNYUAN3D_V3_MODEL_IDS.has(selectedModelId)
  const isTrellis2 = selectedModelId === AI_MODELS.TRELLIS_2
  const isTriposr = selectedModelId === AI_MODELS.TRIPOSR
  const isRodin = selectedModelId === AI_MODELS.RODIN_GEN_2_5
  const hasRodinKey = rodinActiveKeys.length > 0
  const supportsMultiViewInput = isHunyuanV3
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
    (isRodin ? hasRodinKey : hasFalKey) &&
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
    seed?: number
    /** Rodin mesh-first: force the toggle OFF on this submit (used by the
     *  "Continue with textures" path so the textured pass doesn't loop). */
    forceMeshFirstOff?: boolean
    /** Rodin mesh-first: lineage pointer from a textured continuation back to
     *  its mesh-only parent Generation. */
    parentGenerationId?: string
    /** Rodin texture-only continuation: dispatches to
     *  /api/v2/rodin_texture_only so the exact parent mesh is preserved. */
    rodinTextureOnly?: boolean
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

    const targetIsRodin = targetModelId === AI_MODELS.RODIN_GEN_2_5

    const params: Generate3DRequest = {
      imageUrl: targetSourceUrl,
      modelId: targetModelId,
      ...(targetSourceGenId && { sourceGenerationId: targetSourceGenId }),
      ...(targetPrompt && { prompt: targetPrompt }),
      prep3D,
      // FAL key for FAL-based models; Rodin key (or nothing → system key) for Rodin
      ...(!targetIsRodin && selectedApiKeyId && { apiKeyId: selectedApiKeyId }),
      ...(targetIsRodin &&
        selectedRodinKeyId && {
          apiKeyId: selectedRodinKeyId,
        }),
      ...(override?.seed != null && { seed: override.seed }),
      ...(targetIsHunyuanV3 && {
        enablePbr,
        faceCount,
        generateType: MODEL_3D_GENERATE_TYPE.NORMAL,
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
      ...(targetIsRodin &&
        (() => {
          const trimmedPrompt = rodinPrompt.trim()
          const parsedSeed = Number.parseInt(rodinSeedInput, 10)
          const parsedQualityOverride = Number.parseInt(
            rodinQualityOverrideInput,
            10,
          )
          const bboxWidth = Number.parseFloat(rodinBboxWidth)
          const bboxHeight = Number.parseFloat(rodinBboxHeight)
          const bboxLength = Number.parseFloat(rodinBboxLength)
          const bboxAllValid =
            Number.isFinite(bboxWidth) &&
            Number.isFinite(bboxHeight) &&
            Number.isFinite(bboxLength)
          const isMicroEffective =
            rodinTier === RODIN_IS_MICRO_REQUIRED_TIER && rodinIsMicro

          return {
            rodinTier,
            rodinMeshMode,
            rodinQuality,
            rodinTextureMode,
            rodinMaterial,
            rodinHighPack,
            rodinGeometryInstructMode,
            rodinGeometryFileFormat,
            ...(rodinTAPose && { rodinTAPose: true }),
            ...(rodinHdTexture && { rodinHdTexture: true }),
            ...(rodinTextureDelight && { rodinTextureDelight: true }),
            ...(rodinUseOriginalAlpha && { rodinUseOriginalAlpha: true }),
            ...(rodinPreviewRender && { rodinPreviewRender: true }),
            ...(isMicroEffective && { rodinIsMicro: true }),
            ...(trimmedPrompt && { rodinPrompt: trimmedPrompt }),
            ...(Number.isFinite(parsedSeed) &&
              parsedSeed >= -1 && { seed: parsedSeed }),
            ...(Number.isFinite(parsedQualityOverride) &&
              parsedQualityOverride > 0 && {
                rodinQualityOverride: parsedQualityOverride,
              }),
            ...(bboxAllValid && {
              // [Width(Y), Height(Z), Length(X)] per official Rodin Gen-2.5 docs
              rodinBboxCondition: [
                Math.round(bboxWidth),
                Math.round(bboxHeight),
                Math.round(bboxLength),
              ],
            }),
            ...(rodinAdditionalImages.length > 0 && {
              rodinAdditionalImageUrls: rodinAdditionalImages.slice(
                0,
                RODIN_MAX_REFERENCE_IMAGES - 1,
              ),
            }),
            // Mesh-first: dispatched as material='None' server-side. The
            // "Continue with textures" button on the resulting Generation
            // re-submits with rodinMeshFirst=false + parentGenerationId set.
            ...(rodinMeshFirst &&
              !override?.forceMeshFirstOff && { rodinMeshFirst: true }),
            ...(override?.parentGenerationId && {
              parentGenerationId: override.parentGenerationId,
            }),
            // Texture-only continuation: dispatched to
            // /api/v2/rodin_texture_only with the parent mesh + same reference
            // image. Preserves the exact mesh geometry from the parent.
            ...(override?.rodinTextureOnly && { rodinTextureOnly: true }),
          }
        })()),
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

  // PR1-A4: reroll the seed while reusing the existing multi-view images.
  // `effectiveMultiViewViews` is unchanged, so submitGenerate auto-passes the
  // same back/left/right/leftFront/rightFront URLs — only the Hunyuan seed
  // changes. ~30s per attempt because no multi-view regeneration.
  const canRetryWithNewSeed =
    !!sourceImage &&
    !!displayGeneration &&
    HUNYUAN3D_V3_MODEL_IDS.has(displayGeneration.model) &&
    !isGenerating &&
    hasFalKey &&
    sourceQualityIssues.length === 0

  const handleRetryWithNewSeed = async () => {
    if (!canRetryWithNewSeed || !displayGeneration) return
    // Seed range matches the Hunyuan field expected by fal (0–9999 int).
    const newSeed = Math.floor(Math.random() * 10000)
    await submitGenerate({
      modelId: displayGeneration.model,
      seed: newSeed,
    })
  }

  // Rodin mesh-first continuation. Visible when the current Generation was the
  // mesh-only first pass (snapshot.rodinMeshFirst === true) and the user hasn't
  // dismissed the affordance ("Keep as final"). Clicking re-submits a second
  // independent Rodin job using the SAME source image + the user's CURRENT
  // material selection in the Inspector (defaults to PBR), with
  // rodinMeshFirst forced OFF + parentGenerationId set for lineage.
  const meshFirstSnapshot =
    displayGeneration?.snapshot &&
    typeof displayGeneration.snapshot === 'object' &&
    !Array.isArray(displayGeneration.snapshot)
      ? (displayGeneration.snapshot as Record<string, unknown>)
      : null
  const isDisplayingMeshOnlyPreview =
    !!displayGeneration &&
    displayGeneration.model === AI_MODELS.RODIN_GEN_2_5 &&
    meshFirstSnapshot?.rodinMeshFirst === true
  const canContinueToTextures =
    isDisplayingMeshOnlyPreview &&
    !isGenerating &&
    hasRodinKey &&
    !keptAsFinalIds.has(displayGeneration!.id) &&
    !!(displayGeneration!.referenceImageUrl ?? displayGeneration!.url)

  const handleContinueToTextures = async () => {
    if (!canContinueToTextures || !displayGeneration) return
    const sourceUrl =
      displayGeneration.referenceImageUrl ?? displayGeneration.url
    await submitGenerate({
      modelId: AI_MODELS.RODIN_GEN_2_5,
      sourceUrl,
      sourceGenerationId: null,
      forceMeshFirstOff: true,
      parentGenerationId: displayGeneration.id,
      // Use /api/v2/rodin_texture_only so the parent mesh is preserved
      // exactly — no geometry drift between preview and final output.
      rodinTextureOnly: true,
    })
  }

  const handleKeepAsFinal = () => {
    if (!displayGeneration) return
    setKeptAsFinalIds((prev) => {
      const next = new Set(prev)
      next.add(displayGeneration.id)
      return next
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
      ...((multiViewUses3DRouteKey
        ? selectedApiKeyId
        : selectedMultiViewApiKeyId) && {
        apiKeyId: multiViewUses3DRouteKey
          ? selectedApiKeyId
          : selectedMultiViewApiKeyId,
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

  const getViewLabel = (view: GeneratedSideView) => {
    if (view === 'back') return t('viewBack')
    if (view === 'left') return t('viewLeft')
    if (view === 'right') return t('viewRight')
    if (view === 'leftFront') return t('viewLeftFront')
    return t('viewRightFront')
  }

  // Shared by both upload entry points (manual side-view and source image).
  // Wraps the lib helper with Model3DGenerate-namespace i18n keys.
  const prepareUploadFile = (file: File): Promise<File | null> => {
    const maxMb = String(USER_UPLOAD_MAX_BYTES / 1024 / 1024)
    return prepareImageUpload(file, {
      maxBytes: USER_UPLOAD_MAX_BYTES,
      messages: {
        compressing: t('uploadCompressing'),
        compressed: ({ from, to }) => t('uploadCompressed', { from, to }),
        gifTooLarge: t('errorGifTooLarge', { maxMb }),
        tooLarge: t('errorFileTooLarge', { maxMb }),
      },
    })
  }

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

    setUploadingManualView(view)
    try {
      const uploadFile = await prepareUploadFile(file)
      if (!uploadFile) return
      const dataUrl = await readFileAsDataUrl(uploadFile)
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

  // Rodin multi-view upload handlers (T12)
  const RODIN_EXTRA_ANGLES = ['back', 'left', 'right', 'leftFront'] as const
  type RodinExtraAngle = (typeof RODIN_EXTRA_ANGLES)[number]

  const getRodinAngleLabel = (angle: RodinExtraAngle) => {
    if (angle === 'back') return t('viewBack')
    if (angle === 'left') return t('viewLeft')
    if (angle === 'right') return t('viewRight')
    return t('viewLeftFront')
  }

  const handleRodinImageUploadClick = (angle: RodinExtraAngle) => {
    rodinImageFileRefs.current[angle]?.click()
  }

  const handleRemoveRodinImage = (angle: RodinExtraAngle) => {
    const idx = RODIN_EXTRA_ANGLES.indexOf(angle)
    setRodinAdditionalImages((prev) => {
      const next = [...prev]
      next.splice(idx, 1)
      return next
    })
  }

  const handleRodinImageFileChange = async (
    angle: RodinExtraAngle,
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error(t('errorUnsupportedFile'))
      return
    }

    setUploadingRodinAngle(angle)
    try {
      const uploadFile = await prepareUploadFile(file)
      if (!uploadFile) return
      const dataUrl = await readFileAsDataUrl(uploadFile)
      const response = await uploadImageAPI({
        imageDataUrl: dataUrl,
        note: t('manualViewUploadNote', { view: getRodinAngleLabel(angle) }),
      })
      if (!response.success || !response.data) {
        toast.error(response.error ?? t('errorFallback'))
        return
      }

      const url = response.data.generation.url
      const idx = RODIN_EXTRA_ANGLES.indexOf(angle)
      setRodinAdditionalImages((prev) => {
        const next = [...prev]
        // Ensure slot is long enough, fill gaps with empty strings
        while (next.length < idx) next.push('')
        next[idx] = url
        return next.filter(Boolean)
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('errorUnexpected'))
    } finally {
      setUploadingRodinAngle(null)
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

    setUploading(true)
    try {
      const uploadFile = await prepareUploadFile(file)
      if (!uploadFile) return
      const dataUrl = await readFileAsDataUrl(uploadFile)
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
                 * PR1-A4: reroll the seed using the same multi-view images.
                 * "Not quite right, try again" is the core workflow for the
                 * fidelity-driven user — skipping multi-view regeneration
                 * keeps each retry to ~30s and avoids paying for new side
                 * views every time.
                 */}
                {canRetryWithNewSeed && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleRetryWithNewSeed()}
                    title={t('retrySeedHint')}
                  >
                    <Dices className="mr-1.5 size-3.5" />
                    {t('retrySeedLabel')}
                  </Button>
                )}
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
                {/* Rodin mesh-first continuation pair. Appears once on a
                    mesh-only preview; "Keep as final" dismisses both
                    (client-side state, see keptAsFinalIds). */}
                {canContinueToTextures && (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleContinueToTextures()}
                    >
                      <Sparkles className="mr-1.5 size-3.5" />
                      {t('rodinContinueToTextureLabel')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleKeepAsFinal}
                    >
                      <Check className="mr-1.5 size-3.5" />
                      {t('rodinKeepAsFinalLabel')}
                    </Button>
                  </>
                )}
              </div>
              {isDisplayingMeshOnlyPreview && (
                <div className="absolute left-1/2 top-6 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 shadow-sm backdrop-blur-sm dark:text-amber-300">
                  <Box className="size-3.5" />
                  <span>{t('rodinMeshOnlyPreviewBadge')}</span>
                </div>
              )}
            </div>
          ) : isGenerating && provisionalModelUrl ? (
            /*
             * PR2-B2: fal returned the finished GLB, R2 ingest is still
             * running. Render the temporary URL so the user can rotate the
             * model immediately; the "saving to assets" banner explains why
             * the download button is missing. Once status flips to COMPLETED
             * the `displayGeneration` branch above takes over with the
             * permanent R2 URL.
             */
            <div className="relative size-full">
              <ModelViewer
                src={provisionalModelUrl}
                poster={sourceImage?.url}
                alt={t('provisionalSavingLabel')}
                className="h-full w-full"
              />
              <div className="absolute left-1/2 top-6 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-700 shadow-sm backdrop-blur-sm dark:text-emerald-300">
                <Check className="size-3.5" />
                <span>{t('provisionalSavingLabel')}</span>
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
            /*
             * Two-step progress at the bottom of the canvas.
             * Geometry → Texture → Done. The hook's fine-grained stage
             * (queued / mesh / texture / uploading) collapses into two buckets:
             *   queued, mesh             → 'geometry'
             *   texture, uploading       → 'texture'
             * Detail line surfaces upload bytes during R2 ingest.
             */
            <StageStepperBar
              className="absolute bottom-6 left-6 right-6 mx-auto max-w-md"
              currentStage={
                stage === 'texture' || stage === 'uploading'
                  ? 'texture'
                  : 'geometry'
              }
              totalElapsedSeconds={elapsedSeconds}
              detail={
                uploadProgress
                  ? uploadProgress.total > 0
                    ? t('uploadProgressKnown', {
                        progress: `${(uploadProgress.loaded / 1024 / 1024).toFixed(1)} / ${(uploadProgress.total / 1024 / 1024).toFixed(1)} MB`,
                      })
                    : t('uploadProgressUnknown')
                  : generationStageLabel
              }
            />
          )}
        </main>

        {/* Right panel — source, multi-view, preset, advanced params, generate */}
        <aside className="flex min-h-0 w-full shrink-0 flex-col gap-4 overflow-y-auto border-t border-border/40 bg-muted/10 p-5 md:w-80 md:border-l md:border-t-0">
          {/* Model Hero Card — shows active model + "Change" switcher */}
          <div className="rounded-lg border border-border/60 bg-card p-3">
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/40">
                <Box className="size-5 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {tModels(`${getModelMessageKey(selectedModelId)}.label`)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {selectedModel?.adapterType === AI_ADAPTER_TYPES.HYPER3D_RODIN
                    ? 'Hyper3D'
                    : selectedModel?.adapterType === AI_ADAPTER_TYPES.FAL
                      ? 'fal.ai'
                      : (selectedModel?.adapterType ?? '')}
                  {' · '}
                  {selectedModel?.cost ?? 0} cr / gen
                </p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 shrink-0 rounded-full px-2.5 text-xs font-medium"
                  >
                    {t('changeModelButton')}
                    <ChevronDown className="ml-1 size-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {models.map((model) => {
                    const messageKey = getModelMessageKey(model.id)
                    return (
                      <DropdownMenuItem
                        key={model.id}
                        onClick={() => setSelectedModelId(model.id)}
                        className={cn(
                          model.id === selectedModelId &&
                            'bg-accent font-medium',
                        )}
                      >
                        {tModels(`${messageKey}.label`)}
                      </DropdownMenuItem>
                    )
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* API key missing banner — shown below the model card, specific to selected adapter */}
          {!isLoadingKeys && (isRodin ? !hasRodinKey : !hasFalKey) && (
            <div className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                <AlertTriangle className="size-3.5" />
                {isRodin
                  ? t('rodinApiKeyMissingTitle')
                  : t('apiKeyMissingTitle')}
              </div>
              <p className="font-serif text-xs leading-5 text-muted-foreground">
                {isRodin
                  ? t('rodinApiKeyMissingDescription')
                  : t('apiKeyMissingDescription')}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setQuickSetupOpen(true)}
                className="self-start rounded-full text-xs"
              >
                {t('setupApiKeyButton')}
              </Button>
            </div>
          )}

          {/* Compact image picker — mirrors Image Studio bottom-toolbar chip pattern */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              {t('sourceImageLabel')}
            </Label>
            {sourceImage ? (
              <div className="flex gap-3 rounded-lg border border-border/50 bg-background/60 p-2">
                <div className="relative size-20 shrink-0 overflow-hidden rounded-md ring-1 ring-border/40">
                  <Image
                    src={sourceImage.url}
                    alt={t('sourceImageLabel')}
                    fill
                    unoptimized
                    className="object-cover"
                    sizes="80px"
                  />
                  <button
                    type="button"
                    onClick={handleClearSource}
                    className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-background/85 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-background"
                    aria-label={t('removeSourceImageLabel')}
                  >
                    <X className="size-3" />
                  </button>
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {sourceImage.prompt || t('sourceImageLabel')}
                    </p>
                    {sourceImage.width > 0 && sourceImage.height > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {sourceImage.width}×{sourceImage.height}
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPickerOpen(true)}
                      disabled={uploading || isGenerating}
                      className="h-8 rounded-full px-2"
                      aria-label={t('selectFromAssets')}
                      title={t('selectFromAssets')}
                    >
                      <FolderOpen className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleUploadClick}
                      disabled={uploading || isGenerating}
                      className="h-8 rounded-full px-2"
                      aria-label={
                        uploading ? t('uploading') : t('uploadButton')
                      }
                      title={uploading ? t('uploading') : t('uploadButton')}
                    >
                      {uploading ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Upload className="size-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border/60 bg-muted/30 px-4 py-5 text-center">
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

          {sourceImage && sourceQualityIssues.length > 0 && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs leading-5 text-destructive">
              <div className="mb-1 flex items-center gap-1.5 font-medium">
                <AlertTriangle className="size-3.5" />
                <span>{t('sourceQualityBlocked')}</span>
              </div>
              <ul className="list-disc space-y-1 pl-4">
                {sourceQualityIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          )}

          {/*
           * Multi-view section — model selector always visible for HunyuanV3;
           * generation controls only appear once a source image is chosen.
           */}
          {supportsMultiViewInput && (
            <div className="rounded-lg border border-border/60 bg-background/60 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                  <Wand2 className="size-3" />
                  {t('multiViewLabel')}
                </Label>
                <Select
                  value={selectedMultiViewModelId}
                  onValueChange={(v) => setSelectedMultiViewModelId(v)}
                >
                  <SelectTrigger className="h-6 w-auto max-w-[150px] rounded-full px-2 text-[11px]">
                    <SelectValue />
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
              </div>

              {sourceImage && (
                <>
                  {effectiveMultiViewViews.length === 0 ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleGenerate4Views()}
                        disabled={
                          isGeneratingViews || !canUseSelectedMultiViewModel
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
                        {canUseSelectedMultiViewModel
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
                                isFront
                                  ? 'ring-2 ring-primary'
                                  : 'ring-border/40',
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
                        onClick={() =>
                          void handleGenerate4Views({ force: true })
                        }
                        disabled={
                          isGeneratingViews || !canUseSelectedMultiViewModel
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

                  {/* Manual upload — always available when a source image is set */}
                  <div className="mt-2 flex flex-col gap-2 border-t border-border/30 pt-2">
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
                                onClick={() =>
                                  handleManualViewUploadClick(view)
                                }
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
                  </div>
                </>
              )}
            </div>
          )}

          {/* HunyuanV3 controls — individual cards matching Rodin style */}
          {isHunyuanV3 && (
            <div className="flex flex-col gap-2">
              <div className="rounded-lg border border-border/60 bg-background/60 p-3">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="enable-pbr" className="text-sm font-medium">
                      {t('enablePbrLabel')}
                    </Label>
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
              </div>
              <div className="rounded-lg border border-border/60 bg-background/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label
                    htmlFor="prep-3d-hunyuan"
                    className="text-sm font-medium"
                  >
                    {t('prep3DLabel')}
                  </Label>
                  <Switch
                    id="prep-3d-hunyuan"
                    checked={prep3D}
                    onCheckedChange={setPrep3D}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Trellis 2 controls — individual cards */}
          {isTrellis2 && (
            <div className="flex flex-col gap-2">
              <div className="rounded-lg border border-border/60 bg-background/60 p-3">
                <div className="grid grid-cols-2 gap-3">
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
              </div>
              <div className="rounded-lg border border-border/60 bg-background/60 p-3">
                <Label className="mb-2 block text-xs uppercase tracking-wider text-muted-foreground">
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
              <div className="rounded-lg border border-border/60 bg-background/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label
                    htmlFor="trellis-remesh"
                    className="text-sm font-medium"
                  >
                    {t('trellisRemeshLabel')}
                  </Label>
                  <Switch
                    id="trellis-remesh"
                    checked={trellisRemesh}
                    onCheckedChange={setTrellisRemesh}
                  />
                </div>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label
                    htmlFor="prep-3d-trellis"
                    className="text-sm font-medium"
                  >
                    {t('prep3DLabel')}
                  </Label>
                  <Switch
                    id="prep-3d-trellis"
                    checked={prep3D}
                    onCheckedChange={setPrep3D}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TripoSR controls */}
          {isTriposr && (
            <div className="flex flex-col gap-2">
              <div className="rounded-lg border border-border/60 bg-background/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="remove-bg" className="text-sm font-medium">
                    {t('removeBackgroundLabel')}
                  </Label>
                  <Switch
                    id="remove-bg"
                    checked={removeBackground}
                    onCheckedChange={setRemoveBackground}
                  />
                </div>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label
                    htmlFor="prep-3d-triposr"
                    className="text-sm font-medium"
                  >
                    {t('prep3DLabel')}
                  </Label>
                  <Switch
                    id="prep-3d-triposr"
                    checked={prep3D}
                    onCheckedChange={setPrep3D}
                  />
                </div>
              </div>
            </div>
          )}

          {/* T11: Rodin Inspector — Quality / Geometry / Texture & Material */}
          {isRodin && (
            <div className="flex flex-col gap-2">
              {/* Quality card — A-style horizontal tier tabs */}
              <div className="rounded-lg border border-border/60 bg-background/60 p-3">
                <Label className="mb-2 block text-xs uppercase tracking-wider text-muted-foreground">
                  {t('rodinTierLabel')}
                </Label>
                <div className="flex gap-0.5 rounded-md bg-muted/50 p-0.5">
                  {RODIN_TIERS.map((tier) => {
                    const isActive = rodinTier === tier
                    const credits = RODIN_TIER_CREDITS[tier]
                    return (
                      <button
                        key={tier}
                        type="button"
                        onClick={() => setRodinTier(tier)}
                        className={cn(
                          'flex flex-1 flex-col items-center rounded px-0.5 py-1.5 text-center transition-colors',
                          isActive
                            ? 'border-b-2 border-primary bg-background text-primary shadow-sm'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        <span className="text-[10px] font-medium leading-tight">
                          {tier === RODIN_TIER.EXTREME_LOW
                            ? 'XS'
                            : tier === RODIN_TIER.EXTREME_HIGH
                              ? 'XH'
                              : tier.replace('Gen-2.5-', '')}
                        </span>
                        <span className="text-[9px] leading-tight opacity-70">
                          {credits} cr
                        </span>
                      </button>
                    )
                  })}
                </div>
                <p className="mt-1.5 font-serif text-[11px] italic text-muted-foreground">
                  ~{Math.round(RODIN_TIER_ESTIMATED_SECONDS[rodinTier] / 60)}{' '}
                  min ·{' '}
                  {RODIN_TIER_CREDITS[rodinTier] +
                    (rodinHighPack ? RODIN_HIGHPACK_EXTRA_CREDITS : 0)}{' '}
                  cr
                </p>
              </div>

              {/* Geometry preset card — unified mesh_mode + quality grid */}
              <div className="rounded-lg border border-border/60 bg-background/60 p-3">
                <Label className="mb-2 block text-xs uppercase tracking-wider text-muted-foreground">
                  {t('rodinMeshModeLabel')}
                </Label>
                <div className="grid grid-cols-4 gap-1.5">
                  {RODIN_MESH_MODES.flatMap((mode) =>
                    RODIN_QUALITIES.map((quality) => {
                      const isActive =
                        rodinMeshMode === mode && rodinQuality === quality
                      const faceLabel = RODIN_FACE_COUNT_LABEL[mode][quality]
                      return (
                        <button
                          key={`${mode}-${quality}`}
                          type="button"
                          onClick={() => {
                            setRodinMeshMode(mode)
                            setRodinQuality(quality)
                          }}
                          className={cn(
                            'flex flex-col items-center gap-0.5 rounded-md border px-1 py-2 text-center transition-colors',
                            isActive
                              ? 'border-primary bg-primary/5 text-primary'
                              : 'border-border/60 text-muted-foreground hover:border-border hover:text-foreground',
                          )}
                        >
                          <span className="text-[12px] font-semibold leading-tight">
                            {faceLabel}
                          </span>
                          <span className="text-[10px] leading-tight opacity-80">
                            {mode === RODIN_MESH_MODE.QUAD
                              ? 'Quad'
                              : 'Triangle'}
                          </span>
                        </button>
                      )
                    }),
                  )}
                </div>
                <p className="mt-1.5 font-serif text-[11px] italic text-muted-foreground">
                  {t('rodinMeshModeHint')}
                </p>
              </div>

              {/* Material card — segmented + HighPack switch */}
              <div className="rounded-lg border border-border/60 bg-background/60 p-3">
                <Label className="mb-2 block text-xs uppercase tracking-wider text-muted-foreground">
                  {t('rodinMaterialLabel')}
                </Label>
                <div className="flex gap-0.5 rounded-md bg-muted/50 p-0.5">
                  {RODIN_MATERIALS.map((mat) => (
                    <button
                      key={mat}
                      type="button"
                      onClick={() => setRodinMaterial(mat)}
                      className={cn(
                        'flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors',
                        rodinMaterial === mat
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {mat}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2 border-t border-border/40 pt-2">
                  <Switch
                    id="rodin-highpack"
                    checked={rodinHighPack}
                    onCheckedChange={setRodinHighPack}
                  />
                  <Label
                    htmlFor="rodin-highpack"
                    className="flex-1 cursor-pointer text-xs font-medium"
                  >
                    {t('rodinHighPackLabel')}
                  </Label>
                </div>
                {/* Mesh-first preview: dispatches first job with material=None.
                    A "Continue with textures" affordance appears on the
                    resulting Generation. */}
                <div className="mt-2 flex items-start gap-2 border-t border-border/40 pt-2">
                  <Switch
                    id="rodin-mesh-first"
                    checked={rodinMeshFirst}
                    onCheckedChange={setRodinMeshFirst}
                  />
                  <div className="flex-1">
                    <Label
                      htmlFor="rodin-mesh-first"
                      className="cursor-pointer text-xs font-medium"
                    >
                      {t('rodinMeshFirstLabel')}
                    </Label>
                    <p className="mt-0.5 font-serif text-[11px] italic leading-snug text-muted-foreground">
                      {t('rodinMeshFirstHint')}
                    </p>
                  </div>
                </div>
              </div>

              {/* T12: Input Images — cross/compass layout */}
              {sourceImage && (
                <div className="rounded-lg border border-border/60 bg-background/60 p-3">
                  <Label className="mb-2 block text-xs uppercase tracking-wider text-muted-foreground">
                    {t('rodinAdditionalImagesLabel')}
                  </Label>
                  {/* 3×3 grid: cross shape — Front center, Back top, Left/Right sides, LFrt bottom-left */}
                  <div className="grid grid-cols-3 gap-1.5">
                    {/* Row 1: _ Back _ */}
                    <div />
                    <RodinAngleSlot
                      angle="back"
                      label={t('viewBack')}
                      url={(() => {
                        const idx = RODIN_EXTRA_ANGLES.indexOf('back')
                        return rodinAdditionalImages[idx] ?? null
                      })()}
                      isUploading={uploadingRodinAngle === 'back'}
                      onUpload={() => handleRodinImageUploadClick('back')}
                      onRemove={() => handleRemoveRodinImage('back')}
                    />
                    <div />
                    {/* Row 2: Left Front Right */}
                    <RodinAngleSlot
                      angle="left"
                      label={t('viewLeft')}
                      url={(() => {
                        const idx = RODIN_EXTRA_ANGLES.indexOf('left')
                        return rodinAdditionalImages[idx] ?? null
                      })()}
                      isUploading={uploadingRodinAngle === 'left'}
                      onUpload={() => handleRodinImageUploadClick('left')}
                      onRemove={() => handleRemoveRodinImage('left')}
                    />
                    {/* Front = sourceImage (always filled) */}
                    <div className="relative aspect-square overflow-hidden rounded-md border-2 border-primary/40 bg-muted/30">
                      <Image
                        src={sourceImage.url}
                        alt={t('sourceImageLabel')}
                        fill
                        unoptimized
                        className="object-cover"
                        sizes="80px"
                      />
                      <span className="absolute bottom-0 left-0 right-0 bg-background/80 py-0.5 text-center text-[9px] font-medium text-foreground backdrop-blur-sm">
                        {t('viewFront')}
                      </span>
                    </div>
                    <RodinAngleSlot
                      angle="right"
                      label={t('viewRight')}
                      url={(() => {
                        const idx = RODIN_EXTRA_ANGLES.indexOf('right')
                        return rodinAdditionalImages[idx] ?? null
                      })()}
                      isUploading={uploadingRodinAngle === 'right'}
                      onUpload={() => handleRodinImageUploadClick('right')}
                      onRemove={() => handleRemoveRodinImage('right')}
                    />
                    {/* Row 3: LFrt _ _ */}
                    <RodinAngleSlot
                      angle="leftFront"
                      label={t('viewLeftFront')}
                      url={(() => {
                        const idx = RODIN_EXTRA_ANGLES.indexOf('leftFront')
                        return rodinAdditionalImages[idx] ?? null
                      })()}
                      isUploading={uploadingRodinAngle === 'leftFront'}
                      onUpload={() => handleRodinImageUploadClick('leftFront')}
                      onRemove={() => handleRemoveRodinImage('leftFront')}
                    />
                    <div />
                    <div />
                  </div>
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    {t('rodinAdditionalImagesHint')}
                  </p>
                  {/* Hidden file inputs for each angle */}
                  {RODIN_EXTRA_ANGLES.map((angle) => (
                    <input
                      key={angle}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      ref={(el) => {
                        rodinImageFileRefs.current[angle] = el
                      }}
                      onChange={(e) =>
                        void handleRodinImageFileChange(angle, e)
                      }
                    />
                  ))}
                </div>
              )}

              {/* Geometry instruction card — faithful vs creative */}
              <div className="rounded-lg border border-border/60 bg-background/60 p-3">
                <Label className="mb-2 block text-xs uppercase tracking-wider text-muted-foreground">
                  {t('rodinGeometryInstructModeLabel')}
                </Label>
                <div className="flex gap-0.5 rounded-md bg-muted/50 p-0.5">
                  {RODIN_GEOMETRY_INSTRUCT_MODES.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setRodinGeometryInstructMode(mode)}
                      className={cn(
                        'flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors',
                        rodinGeometryInstructMode === mode
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {mode === RODIN_GEOMETRY_INSTRUCT_MODE.FAITHFUL
                        ? t('rodinFaithfulLabel')
                        : t('rodinCreativeLabel')}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 font-serif text-[11px] italic text-muted-foreground">
                  {t('rodinGeometryInstructModeHint')}
                </p>
              </div>

              {/* Texture quality card — 5-way segmented */}
              <div className="rounded-lg border border-border/60 bg-background/60 p-3">
                <Label className="mb-2 block text-xs uppercase tracking-wider text-muted-foreground">
                  {t('rodinTextureModeLabel')}
                </Label>
                <div className="flex gap-0.5 rounded-md bg-muted/50 p-0.5">
                  {RODIN_TEXTURE_MODES.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setRodinTextureMode(mode)}
                      className={cn(
                        'flex-1 rounded px-1 py-1 text-[10px] font-medium capitalize transition-colors',
                        rodinTextureMode === mode
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Advanced collapsible — extra Gen-2.5 knobs */}
              <div className="rounded-lg border border-border/60 bg-background/60">
                <button
                  type="button"
                  onClick={() => setRodinAdvancedOpen((v) => !v)}
                  className="flex w-full items-center justify-between rounded-t-lg px-3 py-2.5 text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:bg-muted/40"
                >
                  <span>{t('rodinAdvancedSectionLabel')}</span>
                  <ChevronDown
                    className={cn(
                      'size-4 transition-transform',
                      rodinAdvancedOpen && 'rotate-180',
                    )}
                  />
                </button>
                {rodinAdvancedOpen && (
                  <div className="flex flex-col gap-3 border-t border-border/40 p-3">
                    {/* Toggle row 1 */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex items-center gap-2">
                        <Switch
                          id="rodin-tapose"
                          checked={rodinTAPose}
                          onCheckedChange={setRodinTAPose}
                        />
                        <Label
                          htmlFor="rodin-tapose"
                          className="flex-1 cursor-pointer text-xs"
                        >
                          {t('rodinTAPoseLabel')}
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          id="rodin-hd-texture"
                          checked={rodinHdTexture}
                          onCheckedChange={setRodinHdTexture}
                        />
                        <Label
                          htmlFor="rodin-hd-texture"
                          className="flex-1 cursor-pointer text-xs"
                        >
                          {t('rodinHdTextureLabel')}
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          id="rodin-texture-delight"
                          checked={rodinTextureDelight}
                          onCheckedChange={setRodinTextureDelight}
                        />
                        <Label
                          htmlFor="rodin-texture-delight"
                          className="flex-1 cursor-pointer text-xs"
                        >
                          {t('rodinTextureDelightLabel')}
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          id="rodin-use-original-alpha"
                          checked={rodinUseOriginalAlpha}
                          onCheckedChange={setRodinUseOriginalAlpha}
                        />
                        <Label
                          htmlFor="rodin-use-original-alpha"
                          className="flex-1 cursor-pointer text-xs"
                        >
                          {t('rodinUseOriginalAlphaLabel')}
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          id="rodin-preview-render"
                          checked={rodinPreviewRender}
                          onCheckedChange={setRodinPreviewRender}
                        />
                        <Label
                          htmlFor="rodin-preview-render"
                          className="flex-1 cursor-pointer text-xs"
                        >
                          {t('rodinPreviewRenderLabel')}
                        </Label>
                      </div>
                      <div
                        className={cn(
                          'flex items-center gap-2',
                          rodinTier !== RODIN_IS_MICRO_REQUIRED_TIER &&
                            'opacity-50',
                        )}
                      >
                        <Switch
                          id="rodin-is-micro"
                          checked={rodinIsMicro}
                          disabled={rodinTier !== RODIN_IS_MICRO_REQUIRED_TIER}
                          onCheckedChange={setRodinIsMicro}
                        />
                        <Label
                          htmlFor="rodin-is-micro"
                          className="flex-1 cursor-pointer text-xs"
                        >
                          {t('rodinIsMicroLabel')}
                        </Label>
                      </div>
                    </div>

                    {/* Prompt */}
                    <div className="flex flex-col gap-1">
                      <Label
                        htmlFor="rodin-prompt"
                        className="text-[11px] uppercase tracking-wider text-muted-foreground"
                      >
                        {t('rodinPromptLabel')}
                      </Label>
                      <textarea
                        id="rodin-prompt"
                        value={rodinPrompt}
                        onChange={(e) => setRodinPrompt(e.target.value)}
                        placeholder={t('rodinPromptPlaceholder')}
                        rows={2}
                        className="w-full resize-none rounded-md border border-border/60 bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                      />
                    </div>

                    {/* File format */}
                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor="rodin-format"
                        className="w-24 shrink-0 text-[11px] uppercase tracking-wider text-muted-foreground"
                      >
                        {t('rodinGeometryFileFormatLabel')}
                      </Label>
                      <Select
                        value={rodinGeometryFileFormat}
                        onValueChange={(v) =>
                          setRodinGeometryFileFormat(
                            v as RodinGeometryFileFormat,
                          )
                        }
                      >
                        <SelectTrigger
                          id="rodin-format"
                          className="h-8 flex-1 text-xs"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RODIN_GEOMETRY_FILE_FORMATS.map((fmt) => (
                            <SelectItem
                              key={fmt}
                              value={fmt}
                              className="text-xs"
                            >
                              {fmt.toUpperCase()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Numeric inputs */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <Label
                          htmlFor="rodin-seed"
                          className="text-[11px] uppercase tracking-wider text-muted-foreground"
                        >
                          Seed
                        </Label>
                        <input
                          id="rodin-seed"
                          type="number"
                          inputMode="numeric"
                          value={rodinSeedInput}
                          onChange={(e) => setRodinSeedInput(e.target.value)}
                          placeholder="-1"
                          className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label
                          htmlFor="rodin-quality-override"
                          className="text-[11px] uppercase tracking-wider text-muted-foreground"
                        >
                          {t('rodinQualityOverrideLabel')}
                        </Label>
                        <input
                          id="rodin-quality-override"
                          type="number"
                          inputMode="numeric"
                          value={rodinQualityOverrideInput}
                          onChange={(e) =>
                            setRodinQualityOverrideInput(e.target.value)
                          }
                          placeholder="auto"
                          className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Bbox condition (W / H / L) */}
                    <div className="flex flex-col gap-1">
                      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        Bounding Box
                      </Label>
                      <div className="grid grid-cols-3 gap-1.5">
                        <input
                          type="number"
                          inputMode="decimal"
                          value={rodinBboxWidth}
                          onChange={(e) => setRodinBboxWidth(e.target.value)}
                          placeholder="W"
                          className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                        />
                        <input
                          type="number"
                          inputMode="decimal"
                          value={rodinBboxHeight}
                          onChange={(e) => setRodinBboxHeight(e.target.value)}
                          placeholder="H"
                          className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                        />
                        <input
                          type="number"
                          inputMode="decimal"
                          value={rodinBboxLength}
                          onChange={(e) => setRodinBboxLength(e.target.value)}
                          placeholder="L"
                          className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Rodin BYOK key selector (optional) */}
              {rodinActiveKeys.length > 1 && (
                <div className="rounded-lg border border-border/60 bg-background/60 p-3">
                  <Label className="mb-2 block text-xs uppercase tracking-wider text-muted-foreground">
                    {t('apiKeyDropdownLabel')}
                  </Label>
                  <Select
                    value={selectedRodinKeyId}
                    onValueChange={setSelectedRodinKeyId}
                  >
                    <SelectTrigger className="w-full">
                      {(() => {
                        const sel = rodinActiveKeys.find(
                          (k) => k.id === selectedRodinKeyId,
                        )
                        return sel ? (
                          <span className="font-medium">{sel.label}</span>
                        ) : (
                          <span className="text-muted-foreground">
                            {t('apiKeyDropdownPlaceholder')}
                          </span>
                        )
                      })()}
                    </SelectTrigger>
                    <SelectContent>
                      {rodinActiveKeys.map((k) => (
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
      <QuickSetupDialog
        open={quickSetupOpen}
        onOpenChange={setQuickSetupOpen}
        modelId={selectedModelId}
        modelLabel={tModels(`${getModelMessageKey(selectedModelId)}.label`)}
        adapterType={selectedModel?.adapterType ?? AI_ADAPTER_TYPES.FAL}
        optionId={`workspace:3d:${selectedModelId}`}
      />
    </div>
  )
}
