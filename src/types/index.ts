import { z } from 'zod'

import { PROFILE, PROMPT_ENHANCE, VIDEO_GENERATION } from '@/constants/config'
import {
  AUDIO_FORMATS,
  AUDIO_LATENCIES,
  AUDIO_MP3_BITRATES,
  AUDIO_OPUS_BITRATES,
  TTS_CHUNK_LENGTH_RANGE,
  TTS_MAX_TEXT_LENGTH,
  TTS_REPETITION_PENALTY_RANGE,
  TTS_TEMPERATURE_RANGE,
  TTS_TOP_P_RANGE,
  TTS_VOLUME_RANGE,
} from '@/constants/audio-options'
import { CHARACTER_CARD } from '@/constants/character-card'
import {
  BACKGROUND_CARD,
  STYLE_CARD,
  CARD_RECIPE,
} from '@/constants/card-types'
import { API_KEY_ADAPTER_OPTIONS } from '@/constants/api-keys'
import { AI_MODELS, getModelById } from '@/constants/models'
import { AI_ADAPTER_TYPES, type ProviderConfig } from '@/constants/providers'
import { VIDEO_RESOLUTIONS } from '@/constants/video-options'
import {
  HUNYUAN3D_FACE_COUNT,
  MODEL_3D_GENERATE_TYPES,
  MODEL_3D_PREVIEW_MODES,
  MODEL_3D_POLYGON_TYPES,
  MODEL_3D_PROGRESS_STAGES,
  RODIN_GEOMETRY_FILE_FORMATS,
  RODIN_GEOMETRY_INSTRUCT_MODES,
  RODIN_MATERIALS,
  RODIN_MAX_REFERENCE_IMAGES,
  RODIN_MESH_MODES,
  RODIN_QUALITIES,
  RODIN_QUALITY_OVERRIDE,
  RODIN_TEXTURE_MODES,
  RODIN_TIERS,
  TRELLIS_2_DECIMATION_TARGET,
  TRELLIS_2_RESOLUTIONS,
  TRELLIS_2_SAMPLING_STEPS,
  TRELLIS_2_TEXTURE_SIZES,
} from '@/constants/model-3d-generation'
import {
  AUDIO_EMOTIONS,
  AUDIO_PAUSE_MARKERS,
  AUDIO_PACES,
  VOICE_CARD_AGES,
  VOICE_CARD_DEFAULT_PACE,
  VOICE_CARD_DEFAULT_PROVIDER,
  VOICE_CARD_GENDERS,
  VOICE_CARD_PACES,
  VOICE_CARD_PITCHES,
  VOICE_CARD_PROVIDERS,
} from '@/constants/voice-cards'
import { WORKFLOW_IDS } from '@/constants/workflows'
import { EXECUTION_WORKFLOW_IDS } from '@/constants/execution'
// Re-export ModelOption from constants for convenience
export type { ModelOption } from '@/constants/models'
export type {
  NodeWorkflowEdge,
  NodeWorkflowCharacterReference,
  NodeWorkflowCharacterImageMode,
  NodeWorkflowGenerationStatus,
  NodeWorkflowImageOutputSource,
  NodeWorkflowField,
  NodeWorkflowLoraSelection,
  NodeWorkflowMediaKind,
  NodeWorkflowModelOption,
  NodeWorkflowModelOptionsByType,
  NodeWorkflowModelProviderConfig,
  NodeWorkflowModelSelection,
  NodeWorkflowNode,
  NodeWorkflowNodeData,
  NodeWorkflowProject,
  NodeWorkflowProjectSummary,
  NodeWorkflowReferenceAsset,
  NodeWorkflowReferenceRole,
  NodeWorkflowReferenceSource,
  NodeWorkflowState,
  NodeWorkflowStateSnapshot,
  NodeWorkflowStorageSnapshot,
  NodeWorkflowStatus,
} from '@/types/node-workflow'
export type {
  NodeAssistantMessage,
  NodeAssistantMessageRole,
  NodeAssistantNodeContext,
  NodeAssistantRequest,
} from '@/types/node-assistant'
export {
  ActionDraftSchema,
  BeatDraftSchema,
  CharacterDraftSchema,
  SceneDraftSchema,
  ScriptBreakdownApiSuccessResponseSchema,
  ScriptBreakdownPlannerSchema,
  ScriptBreakdownRequestSchema,
  ScriptBreakdownResponseDataSchema,
  ScriptBreakdownResultSchema,
  ShotDraftSchema,
} from '@/types/script-breakdown'
export type {
  ActionDraft,
  BeatDraft,
  CharacterDraft,
  SceneDraft,
  ScriptBreakdownApiSuccessResponse,
  ScriptBreakdownPlanner,
  ScriptBreakdownRequest,
  ScriptBreakdownResponseData,
  ScriptBreakdownResult,
  ShotDraft,
} from '@/types/script-breakdown'
export {
  SeedancePromptPlanApiSuccessResponseSchema,
  SeedancePromptPlanPlannerSchema,
  SeedancePromptPlanRequestSchema,
  SeedancePromptPlanResponseDataSchema,
  SeedancePromptPlanResultSchema,
  SeedancePromptTimelineItemSchema,
} from '@/types/seedance-prompt-plan'
export type {
  SeedancePromptPlanApiSuccessResponse,
  SeedancePromptPlanPlanner,
  SeedancePromptPlanRequest,
  SeedancePromptPlanResponseData,
  SeedancePromptPlanResult,
  SeedancePromptTimelineItem,
} from '@/types/seedance-prompt-plan'

// ─── Advanced Generation Parameters ──────────────────────────────

/** Zod schema for a single LoRA configuration */
export const LoraSchema = z.object({
  /** LoRA model URL (HuggingFace, Civitai, or direct HTTPS link) */
  url: z.string().url().max(500),
  /** LoRA weight/scale (0.1–2.0, default 1.0) */
  scale: z.number().min(0.1).max(2).optional(),
})

/** Zod schema for provider-specific advanced parameters */
export const AdvancedParamsSchema = z.object({
  negativePrompt: z.string().max(2000).optional(),
  guidanceScale: z.number().min(0).max(30).optional(),
  steps: z.number().int().min(1).max(100).optional(),
  seed: z.number().int().min(-1).max(4294967295).optional(),
  referenceStrength: z.number().min(0.01).max(0.99).optional(),
  quality: z.enum(['auto', 'low', 'medium', 'high']).optional(),
  background: z.string().optional(),
  style: z.string().optional(),
  /** LoRA models to apply (up to 5, FAL/Replicate only) */
  loras: z.array(LoraSchema).max(5).optional(),
})

export type AdvancedParams = z.infer<typeof AdvancedParamsSchema>

// ─── Generation Snapshot (B0) ────────────────────────────────────

export const GenerationObservabilitySnapshotSchema = z.object({
  version: z.literal(1),
  startedAt: z.string(),
  completedAt: z.string(),
  totalMs: z.number().nonnegative(),
  stageDurationsMs: z.record(z.string(), z.number().nonnegative()),
  notes: z.array(z.string()).optional(),
})

/** Point-in-time capture of all input parameters for a generation */
export const GenerationSnapshotSchema = z.object({
  /** Original user prompt (before recipe compilation) */
  freePrompt: z.string().optional(),
  /** Final prompt sent to provider (after compilation/enhancement) */
  compiledPrompt: z.string(),
  /** Model used for generation */
  modelId: z.string(),
  /** Aspect ratio */
  aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']),
  /** Advanced parameters snapshot */
  advancedParams: AdvancedParamsSchema.optional(),
  /** Reference image URLs */
  referenceImages: z.array(z.string()).optional(),
  /** Card IDs used (card mode only) */
  characterCardId: z.string().optional(),
  backgroundCardId: z.string().optional(),
  styleCardId: z.string().optional(),
  /** API key ID used (BYOK route) */
  apiKeyId: z.string().optional(),
  /** Project ID */
  projectId: z.string().optional(),
  /** Whether free tier was used */
  isFreeGeneration: z.boolean().optional(),
  /** Credit cost */
  creditCost: z.number().optional(),
  /** Seed (duplicated for quick access without parsing snapshot) */
  seed: z.number().optional(),
  /** Server-side generation stage timings */
  observability: GenerationObservabilitySnapshotSchema.optional(),
})

export type GenerationSnapshot = z.infer<typeof GenerationSnapshotSchema>

// ─── ActiveRun State Model (B0) ──────────────────────────────────

export type RunItemStatus = 'pending' | 'generating' | 'completed' | 'failed'
export type RunGroupMode = 'single' | 'compare' | 'variant'

interface RunItemBase {
  id: string
  modelId: string
}

export type PendingRunItem = RunItemBase & {
  status: 'pending' | 'generating'
  generation: GenerationRecord | null
  error: null
}

export type CompletedRunItem = RunItemBase & {
  status: 'completed'
  generation: GenerationRecord
  error: null
}

export type FailedRunItem = RunItemBase & {
  status: 'failed'
  generation: null
  error: string
}

export type RunItem = PendingRunItem | CompletedRunItem | FailedRunItem

export interface ActiveRun {
  id: string
  mode: RunGroupMode
  items: RunItem[]
  selectedItemId: string | null
  prompt: string
  startedAt: number
}

// ─── Generate Request ─────────────────────────────────────────────

export const RecipeUsageSchema = z.object({
  recipeId: z.string().trim().min(1),
  recipeVersion: z.number().int().positive().optional(),
  useMode: z.enum(['replace', 'insert', 'apply']),
})

export type RecipeUsage = z.infer<typeof RecipeUsageSchema>

/** Zod schema for image generation request validation */
export const GenerateRequestSchema = z.object({
  /** User's text prompt describing the desired image */
  prompt: z
    .string()
    .trim()
    .min(1, 'Prompt is required')
    .max(4000, 'Prompt is too long (max 4000 characters)'),
  /** Selected AI model identifier */
  modelId: z.string().trim().min(1, 'Model is required').max(160),
  /** Aspect ratio for the generated image */
  aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']).default('1:1'),
  /** Optional reference image for img2img (base64 data URL or https URL) */
  referenceImage: z.string().optional(),
  /** Optional multiple reference images for character/style consistency */
  referenceImages: z.array(z.string()).optional(),
  /** Optional specific API key ID to use for this generation */
  apiKeyId: z.string().trim().min(1).optional(),
  /** Optional provider-specific advanced parameters */
  advancedParams: AdvancedParamsSchema.optional(),
  /** Optional character card IDs to link to this generation (multi-card) */
  characterCardIds: z.array(z.string().trim().min(1)).max(5).optional(),
  /** Optional project ID to associate this generation with */
  projectId: z.string().trim().min(1).optional(),
  /** Optional prompt template usage metadata for generation lineage */
  recipeUsage: RecipeUsageSchema.optional(),
})

/** Image generation request type (derived from Zod schema) */
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>

// ─── Generate Response ────────────────────────────────────────────

/** Successful generation response data */
export interface GenerateResponseData {
  generation: GenerationRecord
}

/** Image generation API response */
export interface GenerateResponse {
  /** Whether the generation was successful */
  success: boolean
  /** Response data (present when success is true) */
  data?: GenerateResponseData
  /** Error message (present when success is false) */
  error?: string
  /** Machine-readable error code for i18n translation on the client */
  errorCode?: string
  /** Stable translation key for client-side localization */
  i18nKey?: string
}

// ─── Unified Generation Config (image + video) ──────────────────

/** Unified generation config schema covering image, video, and audio modes */
export const GenerationConfigSchema = z.object({
  outputType: z.enum(['image', 'video', 'audio', 'model_3d']),
  prompt: z
    .string()
    .trim()
    .min(1, 'Prompt is required')
    .max(4000, 'Prompt is too long (max 4000 characters)'),
  modelId: z.string().trim().min(1, 'Model is required').max(160),
  aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']).default('1:1'),
  referenceImage: z.string().optional(),
  referenceImages: z.array(z.string()).optional(),
  apiKeyId: z.string().trim().min(1).optional(),
  advancedParams: AdvancedParamsSchema.optional(),
  characterCardIds: z.array(z.string().trim().min(1)).max(5).optional(),
  projectId: z.string().trim().min(1).optional(),
  // video-specific fields (ignored when outputType === 'image')
  duration: z.number().min(1).max(10).optional(),
  negativePrompt: z.string().max(2000).optional(),
  resolution: z.enum(VIDEO_RESOLUTIONS).optional(),
})

/** Unified generation config type */
export type GenerationConfig = z.infer<typeof GenerationConfigSchema>

// ─── Video Generate Request ───────────────────────────────────────

export const GenerateVideoRequestSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, 'Prompt is required')
    .max(4000, 'Prompt is too long (max 4000 characters)'),
  modelId: z.string().trim().min(1, 'Model is required').max(160),
  aspectRatio: z
    .enum(['1:1', '16:9', '9:16', '4:3', '3:4'])
    .default(VIDEO_GENERATION.DEFAULT_ASPECT_RATIO),
  /**
   * Video duration in seconds, or the literal `'auto'` token to let the
   * provider decide (Seedance 2.0 supports this). Falls back to the system
   * default when omitted. Builders that don't recognise 'auto' (Veo, Kling,
   * Runway, Volcengine) coerce it to their configured default.
   */
  duration: z
    .union([
      z.number().min(1).max(VIDEO_GENERATION.MAX_DURATION),
      z.literal('auto'),
    ])
    .default(VIDEO_GENERATION.DEFAULT_DURATION),
  referenceImage: z.string().optional(),
  /**
   * Multi-reference video models (e.g. Veo 3.1 reference-to-video) take an
   * array of subject/scene references. When omitted, the service falls back
   * to wrapping the singular `referenceImage` so existing single-image
   * callers keep working unchanged.
   */
  referenceImages: z.array(z.string()).max(3).optional(),
  /**
   * Reference audio URLs (mp3/wav, up to 15s each, up to 3 clips). Only
   * consumed by video models whose audio.mode === 'reference' (currently
   * the Seedance 2.0 reference-to-video endpoints). Other models ignore.
   */
  audioUrls: z.array(z.string().trim().min(1)).max(3).optional(),
  /**
   * Per-clip binding labels — character names attached to each audio URL
   * by the Node Studio harvest when a voice node is wired through a
   * character node. The Seedance Reference builder uses these to label
   * `@AudioN` tokens as `"{Name} (@AudioN)"` so multi-character scenes
   * tell the model whose voice is whose. When omitted, falls back to
   * unlabeled tokens derived from `audioUrls`.
   */
  audioBindings: z
    .array(
      z.object({
        url: z.string().trim().min(1),
        characterName: z.string().trim().min(1).max(160).optional(),
      }),
    )
    .max(3)
    .optional(),
  /**
   * Reference video URLs (mp4 etc., combined duration 2-15s, ≤50MB total,
   * up to 3 clips). Only consumed by the Seedance 2.0 reference-to-video
   * endpoints; other models ignore. Passing a video reference also unlocks
   * a 40% price discount on Seedance Reference.
   */
  videoUrls: z.array(z.string().trim().min(1)).max(3).optional(),
  negativePrompt: z.string().trim().max(2000).optional(),
  resolution: z.enum(VIDEO_RESOLUTIONS).optional(),
  apiKeyId: z.string().trim().min(1).optional(),
  workflowId: z
    .enum([WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO, WORKFLOW_IDS.CHARACTER_TO_VIDEO])
    .optional(),
  characterCardIds: z.array(z.string().trim().min(1)).max(5).optional(),
})

export type GenerateVideoRequest = z.infer<typeof GenerateVideoRequestSchema>

export type GenerateVideoResponse = GenerateResponse

// ─── Audio Generate Request ─────────────────────────────────────

export const GenerateAudioRequestSchema = z
  .object({
    prompt: z
      .string()
      .trim()
      .min(1, 'Text is required')
      .max(
        TTS_MAX_TEXT_LENGTH,
        `Text is too long (max ${TTS_MAX_TEXT_LENGTH} characters)`,
      ),
    modelId: z.string().trim().min(1, 'Model is required').max(160),
    voiceId: z.string().trim().min(1).max(200).optional(),
    emotion: z.enum(AUDIO_EMOTIONS).optional(),
    pace: z.enum(AUDIO_PACES).optional(),
    pauseMarkers: z.array(z.enum(AUDIO_PAUSE_MARKERS)).optional(),
    pronunciationDictionary: z.record(z.string(), z.string()).optional(),
    speed: z.number().min(0.5).max(2.0).optional(),
    volume: z
      .number()
      .min(TTS_VOLUME_RANGE.min)
      .max(TTS_VOLUME_RANGE.max)
      .optional(),
    normalizeLoudness: z.boolean().optional(),
    normalizeText: z.boolean().optional(),
    withTimestamps: z.boolean().optional(),
    format: z.enum(AUDIO_FORMATS).optional(),
    sampleRate: z.number().int().min(8000).max(48000).optional(),
    mp3Bitrate: z
      .number()
      .refine((value) =>
        AUDIO_MP3_BITRATES.includes(
          value as (typeof AUDIO_MP3_BITRATES)[number],
        ),
      )
      .optional(),
    opusBitrate: z
      .number()
      .refine((value) =>
        AUDIO_OPUS_BITRATES.includes(
          value as (typeof AUDIO_OPUS_BITRATES)[number],
        ),
      )
      .optional(),
    latency: z.enum(AUDIO_LATENCIES).optional(),
    temperature: z
      .number()
      .min(TTS_TEMPERATURE_RANGE.min)
      .max(TTS_TEMPERATURE_RANGE.max)
      .optional(),
    topP: z
      .number()
      .min(TTS_TOP_P_RANGE.min)
      .max(TTS_TOP_P_RANGE.max)
      .optional(),
    chunkLength: z
      .number()
      .int()
      .min(TTS_CHUNK_LENGTH_RANGE.min)
      .max(TTS_CHUNK_LENGTH_RANGE.max)
      .optional(),
    repetitionPenalty: z
      .number()
      .min(TTS_REPETITION_PENALTY_RANGE.min)
      .max(TTS_REPETITION_PENALTY_RANGE.max)
      .optional(),
    speakerVoiceIds: z
      .array(z.string().trim().min(1).max(200))
      .max(8)
      .optional(),
    referenceAudioUrl: z.string().url().optional(),
    referenceText: z.string().trim().max(TTS_MAX_TEXT_LENGTH).optional(),
    apiKeyId: z.string().trim().min(1).optional(),
  })
  .refine(
    (data) => {
      // Fish Audio's `references` payload requires `text` whenever an inline
      // audio URL is provided. Reject partial pairs at the API boundary so
      // the user gets a clear 400 instead of a silently dropped reference.
      const hasUrl = typeof data.referenceAudioUrl === 'string'
      const hasText =
        typeof data.referenceText === 'string' && data.referenceText.length > 0
      return hasUrl === hasText
    },
    {
      message:
        'referenceAudioUrl and referenceText must both be provided or both omitted',
      path: ['referenceText'],
    },
  )

export type GenerateAudioRequest = z.infer<typeof GenerateAudioRequestSchema>

export interface AudioSubmitResponseData {
  jobId: string
  /** Optional provider identifier; front-end must not depend on it. */
  requestId?: string
}

export interface AsyncJobSubmitResponseData {
  jobId: string
  requestId: string
}

export const AsyncJobStatusSchema = z.enum([
  'IN_QUEUE',
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED',
])
export type AsyncJobStatus = z.infer<typeof AsyncJobStatusSchema>

export const AudioStatusRequestSchema = z.object({
  jobId: z.string().trim().min(1, 'Job ID is required'),
})

export type GenerateAudioResponseData =
  | {
      generation: GenerationRecord
      jobId?: never
      requestId?: never
    }
  | (AudioSubmitResponseData & {
      generation?: never
    })

export interface GenerateAudioResponse {
  success: boolean
  data?: GenerateAudioResponseData
  error?: string
  errorCode?: string
  i18nKey?: string
}

export type AudioStatusResponseData =
  | {
      jobId: string
      status: 'IN_QUEUE' | 'IN_PROGRESS'
      generation?: never
    }
  | {
      jobId: string
      status: 'COMPLETED'
      generation: GenerationRecord
    }
  | {
      jobId: string
      status: 'FAILED'
      generation?: never
    }

export interface AudioStatusResponse {
  success: boolean
  data?: AudioStatusResponseData
  error?: string
}

// ─── Image Edit ──────────────────────────────────────────────────
// Moved from /api/image/edit/route.ts to centralize all schemas

/**
 * Provider model identifier (e.g. `fal-ai/aura-sr`, `gemini-3-pro-image-preview`).
 * Plain string at the schema level — the picker passes the concrete ID for the
 * task; servers validate that the ID is registered for the requested task.
 */
const EditModelIdSchema = z.string().trim().min(1).max(200)

export const ImageEditSchema = z.object({
  action: z.enum(['upscale', 'remove-background']),
  imageUrl: z.string().url(),
  /**
   * Persist the edited result to R2 + create a Generation row. Defaults to
   * true so fal.ai's temporary CDN URL (which expires) is always captured.
   * Callers that explicitly want a preview-only response pass false.
   */
  persist: z.boolean().optional().default(true),
  /** Optional source generation ID — when provided, the persisted row links back. */
  generationId: z.string().trim().min(1).optional(),
  /** Optional model override; service uses task-level default when omitted. */
  modelId: EditModelIdSchema.optional(),
  /**
   * Upscale-only: target multiplier. 4x = the default Aura SR pipeline; 2x
   * routes to Clarity Upscaler with `scale_factor: 2`. Ignored for the
   * remove-background action.
   */
  targetScale: z.enum(['2x', '4x']).optional(),
})

export type ImageEditRequest = z.infer<typeof ImageEditSchema>

export const InpaintRequestSchema = z.object({
  imageUrl: z.string().url(),
  maskImageUrl: z.string().trim().min(1),
  prompt: z.string().trim().min(1).max(1000),
  negativePrompt: z.string().max(500).optional(),
  apiKeyId: z.string().trim().min(1).optional(),
  sourceGenerationId: z.string().trim().min(1).optional(),
  modelId: EditModelIdSchema.optional(),
})

export type InpaintRequest = z.infer<typeof InpaintRequestSchema>

export const OutpaintPaddingSchema = z.object({
  top: z.number().int().min(0).max(512),
  right: z.number().int().min(0).max(512),
  bottom: z.number().int().min(0).max(512),
  left: z.number().int().min(0).max(512),
})

export const OutpaintRequestSchema = z.object({
  imageUrl: z.string().url(),
  padding: OutpaintPaddingSchema,
  prompt: z.string().trim().min(1).max(1000),
  negativePrompt: z.string().max(500).optional(),
  apiKeyId: z.string().trim().min(1).optional(),
  sourceGenerationId: z.string().trim().min(1).optional(),
  modelId: EditModelIdSchema.optional(),
})

export type OutpaintRequest = z.infer<typeof OutpaintRequestSchema>
export type OutpaintPadding = z.infer<typeof OutpaintPaddingSchema>

// ─── Element Extraction (text-guided cutout) ────────────────────

/**
 * Extract a single element from an image based on a free-text prompt. The
 * server runs grounded segmentation (fal lang-segment-anything by default),
 * inverts the mask when the prompt implies background, and returns a PNG
 * with alpha so the user gets a transparent cutout.
 */
export const ImageExtractSchema = z.object({
  imageUrl: z.string().url(),
  /** Short English phrase describing the element ("clothing", "hair", "the cat"). */
  prompt: z.string().trim().min(1).max(200),
  /** When true, invert the segmentation mask — used by the "background" preset. */
  invert: z.boolean().optional(),
  sourceGenerationId: z.string().trim().min(1).optional(),
  apiKeyId: z.string().trim().min(1).optional(),
  modelId: z.string().trim().min(1).max(200).optional(),
})

export type ImageExtractRequest = z.infer<typeof ImageExtractSchema>

// ─── Image Layer Decomposition (See-Through) ────────────────────

export const ImageDecomposeSchema = z.object({
  imageUrl: z.string().url(),
  /** Inference resolution (768–1536, step 64). Default: 1280 (trained resolution). */
  resolution: z
    .number()
    .int()
    .min(768)
    .max(1536)
    .refine((v) => v % 64 === 0, {
      message: 'Resolution must be a multiple of 64',
    })
    .optional()
    .default(1280),
  /** Reproducibility seed (0–9999). Default: 42. */
  seed: z.number().int().min(0).max(9999).optional().default(42),
  /** When true, persist PSD and layer PNGs to R2 */
  persist: z.boolean().optional(),
  /** Source generation ID (required when persist is true) */
  generationId: z.string().optional(),
  /** Optional model override (e.g. a different HF Space). Default in service. */
  modelId: EditModelIdSchema.optional(),
})

export type ImageDecomposeRequest = z.infer<typeof ImageDecomposeSchema>

/** A single decomposed layer from See-Through */
export interface DecomposedLayer {
  /** Semantic label (e.g. "front_hair", "left_eye", "upper_body") */
  name: string
  /** URL to the layer PNG */
  imageUrl: string
}

/** Full result of image layer decomposition */
export interface ImageDecomposeResult {
  /** Individual layer images */
  layers: DecomposedLayer[]
  /** URL to download the layered PSD file */
  psdUrl: string
  /** Total number of layers extracted */
  layerCount: number
}

// ─── Video Queue (submit + poll) ─────────────────────────────────

export const VideoJobStatusSchema = AsyncJobStatusSchema
export type VideoJobStatus = AsyncJobStatus

export const VideoStatusRequestSchema = AudioStatusRequestSchema

export type VideoSubmitResponseData = AsyncJobSubmitResponseData

export interface VideoSubmitResponse {
  success: boolean
  data?: VideoSubmitResponseData
  error?: string
}

export type VideoStatusResponseData = AudioStatusResponseData

export interface VideoStatusResponse {
  success: boolean
  data?: VideoStatusResponseData
  error?: string
}

// ─── User Image Upload ──────────────────────────────────────────

export const UploadImageRequestSchema = z
  .object({
    /** Image as a data URL (data:image/png;base64,...). Decoded server-side. */
    imageDataUrl: z
      .string()
      .trim()
      .min(1)
      .startsWith('data:', 'Must be a data URL')
      .optional(),
    /**
     * Remote https URL the server fetches and persists. Lets the client
     * "import" a pasted URL into the gallery without piping the binary
     * through the browser.
     */
    imageUrl: z.string().trim().url().optional(),
    /** Optional note saved as the prompt field for browsing context */
    note: z.string().trim().max(500).optional(),
    /** Optional project to assign the upload to */
    projectId: z.string().trim().min(1).optional(),
  })
  .refine((value) => Boolean(value.imageDataUrl ?? value.imageUrl), {
    message: 'Either imageDataUrl or imageUrl must be provided',
    path: ['imageDataUrl'],
  })

export type UploadImageRequest = z.infer<typeof UploadImageRequestSchema>

export interface UploadImageResponse {
  success: boolean
  data?: { generation: GenerationRecord }
  error?: string
}

// ─── 3D Generate Request + Queue (submit + poll) ─────────────────

export const Model3DMultiViewImagesSchema = z
  .object({
    backImageUrl: z.string().trim().url().optional(),
    leftImageUrl: z.string().trim().url().optional(),
    rightImageUrl: z.string().trim().url().optional(),
    topImageUrl: z.string().trim().url().optional(),
    bottomImageUrl: z.string().trim().url().optional(),
    leftFrontImageUrl: z.string().trim().url().optional(),
    rightFrontImageUrl: z.string().trim().url().optional(),
  })
  .partial()

export const Generate3DRequestSchema = z.object({
  /**
   * Public URL of the source image. Required for image-to-3D mode. For Rodin
   * Gen-2.5 text-to-3D (`rodinPrompt` set, no image), this field is omitted
   * and the service skips source quality checks / preprocessing entirely.
   */
  imageUrl: z.string().trim().url('Source image URL is required').optional(),
  modelId: z.string().trim().min(1, 'Model is required').max(160),
  /** Hunyuan3D: enable PBR-textured mesh (3x cost). Ignored by TripoSR. */
  texturedMesh: z.boolean().optional(),
  /** Hunyuan3D octree resolution: 256 / 512 / 1024 */
  octreeResolution: z
    .union([z.literal(256), z.literal(512), z.literal(1024)])
    .optional(),
  /** Hunyuan3D v3/v3.1: optional side views for less ambiguous geometry. */
  multiViewImages: Model3DMultiViewImagesSchema.optional(),
  /** Hunyuan3D v3/v3.1: PBR material maps. */
  enablePbr: z.boolean().optional(),
  /** Hunyuan3D v3/v3.1 polygon budget. */
  faceCount: z
    .number()
    .int()
    .min(HUNYUAN3D_FACE_COUNT.MIN)
    .max(HUNYUAN3D_FACE_COUNT.MAX)
    .optional(),
  /** Hunyuan3D generation task type. */
  generateType: z.enum(MODEL_3D_GENERATE_TYPES).optional(),
  /** Hunyuan3D v3.1 Pro: run geometry preview before final textured result. */
  previewMode: z.enum(MODEL_3D_PREVIEW_MODES).optional(),
  /** Hunyuan3D v3 low-poly polygon type. */
  polygonType: z.enum(MODEL_3D_POLYGON_TYPES).optional(),
  /** Trellis 2 output resolution. */
  trellisResolution: z
    .union(
      TRELLIS_2_RESOLUTIONS.map((value) => z.literal(value)) as [
        z.ZodLiteral<512>,
        z.ZodLiteral<1024>,
        z.ZodLiteral<1536>,
      ],
    )
    .optional(),
  /** Trellis 2 baked texture size. */
  trellisTextureSize: z
    .union(
      TRELLIS_2_TEXTURE_SIZES.map((value) => z.literal(value)) as [
        z.ZodLiteral<1024>,
        z.ZodLiteral<2048>,
        z.ZodLiteral<4096>,
      ],
    )
    .optional(),
  /** Trellis 2 final mesh vertex target. */
  trellisDecimationTarget: z
    .number()
    .int()
    .min(TRELLIS_2_DECIMATION_TARGET.MIN)
    .max(TRELLIS_2_DECIMATION_TARGET.MAX)
    .optional(),
  /** Trellis 2 topology cleanup. */
  trellisRemesh: z.boolean().optional(),
  /** Trellis 2 projection back onto original surface after remesh. */
  trellisRemeshProject: z.number().min(0).max(1).optional(),
  /** Trellis 2 structure-stage sampling steps. */
  trellisStructureSamplingSteps: z
    .number()
    .int()
    .min(TRELLIS_2_SAMPLING_STEPS.MIN)
    .max(TRELLIS_2_SAMPLING_STEPS.MAX)
    .optional(),
  /** Trellis 2 shape-stage sampling steps. */
  trellisShapeSamplingSteps: z
    .number()
    .int()
    .min(TRELLIS_2_SAMPLING_STEPS.MIN)
    .max(TRELLIS_2_SAMPLING_STEPS.MAX)
    .optional(),
  /** Trellis 2 texture-stage sampling steps. */
  trellisTextureSamplingSteps: z
    .number()
    .int()
    .min(TRELLIS_2_SAMPLING_STEPS.MIN)
    .max(TRELLIS_2_SAMPLING_STEPS.MAX)
    .optional(),
  /** TripoSR: remove background before reconstruction */
  removeBackground: z.boolean().optional(),
  /** Hyper3D Rodin: quality tier */
  rodinTier: z.enum(RODIN_TIERS).optional(),
  /** Hyper3D Rodin: mesh topology mode */
  rodinMeshMode: z.enum(RODIN_MESH_MODES).optional(),
  /** Hyper3D Rodin: texture shading mode */
  rodinTextureMode: z.enum(RODIN_TEXTURE_MODES).optional(),
  /** Hyper3D Rodin: PBR material type */
  rodinMaterial: z.enum(RODIN_MATERIALS).optional(),
  /** Hyper3D Rodin: pack more geometry detail (costs extra) */
  rodinHighPack: z.boolean().optional(),
  /** Hyper3D Rodin: T/A canonical pose alignment */
  rodinTAPose: z.boolean().optional(),
  /** Hyper3D Rodin: HD texture quality */
  rodinHdTexture: z.boolean().optional(),
  /** Hyper3D Rodin: texture delight / lighting removal */
  rodinTextureDelight: z.boolean().optional(),
  /** Hyper3D Rodin: polygon count override */
  rodinQualityOverride: z
    .number()
    .int()
    .min(RODIN_QUALITY_OVERRIDE.RAW_STANDARD.min)
    .max(RODIN_QUALITY_OVERRIDE.RAW_HIGH.max)
    .optional(),
  /** Hyper3D Rodin: additional reference images (up to RODIN_MAX_REFERENCE_IMAGES-1 extra) */
  rodinAdditionalImageUrls: z
    .array(z.string().trim().url())
    .max(RODIN_MAX_REFERENCE_IMAGES - 1)
    .optional(),
  /**
   * Hyper3D Rodin: bounding-box hint as 3 integers
   * [Width(Y), Height(Z), Length(X)] per official Gen-2.5 docs
   * https://developer.hyper3d.ai/api-specification/rodin-gen2.5
   */
  rodinBboxCondition: z.array(z.number().int()).length(3).optional(),
  /** Hyper3D Rodin Gen-2.5: geometry quality preset (extra-low / low / medium / high) */
  rodinQuality: z.enum(RODIN_QUALITIES).optional(),
  /** Hyper3D Rodin Gen-2.5: faithful (default) or creative geometry interpretation */
  rodinGeometryInstructMode: z.enum(RODIN_GEOMETRY_INSTRUCT_MODES).optional(),
  /** Hyper3D Rodin Gen-2.5: geometry export format. Defaults to glb. */
  rodinGeometryFileFormat: z.enum(RODIN_GEOMETRY_FILE_FORMATS).optional(),
  /** Hyper3D Rodin Gen-2.5: optional natural-language prompt to guide the model */
  rodinPrompt: z.string().trim().max(2000).optional(),
  /** Hyper3D Rodin Gen-2.5: preserve original alpha channel from reference image */
  rodinUseOriginalAlpha: z.boolean().optional(),
  /** Hyper3D Rodin Gen-2.5: emit an extra preview render alongside the mesh */
  rodinPreviewRender: z.boolean().optional(),
  /** Hyper3D Rodin Gen-2.5 Extreme-High only: enable micro-geometry detail */
  rodinIsMicro: z.boolean().optional(),
  /** Reproducibility seed (-1 or omitted = random) */
  seed: z.number().int().min(-1).optional(),
  /** Saved API key ID (BYOK) */
  apiKeyId: z.string().trim().min(1).optional(),
  /** Source image generation ID (for lineage tracking, optional) */
  sourceGenerationId: z.string().trim().min(1).optional(),
  /** Project ID for grouping */
  projectId: z.string().trim().min(1).optional(),
  /** Prompt note saved with the generation (the source image's prompt is the real driver) */
  prompt: z.string().trim().max(1000).optional(),
  /**
   * Auto-prepare the source image before handing it to the 3D model:
   * upscale small images to ≥1024px, white-pad non-square aspect to 1:1.
   * Defaults to true. Set false to send the user's raw image straight in.
   */
  prep3D: z.boolean().optional(),
  /**
   * PR3-α: when true and previewMode === MESH_FIRST, the job pauses at
   * MESH_READY after Stage 1 (Geometry) completes — the user must explicitly
   * call /api/generate-3d/continue to kick off Stage 2 (Normal / texture).
   * When false the existing auto-chain behaviour is preserved.
   */
  staged: z.boolean().optional(),
  /**
   * Hyper3D Rodin Gen-2.5: when true, force `material='None'` on the dispatched
   * provider input so the first job emits a mesh-only preview (faster + cheaper,
   * no texture cost). The UI surfaces a "Continue with textures" button after
   * the mesh-only Generation lands; clicking it re-submits a second independent
   * job with the user's actual material choice + `parentGenerationId` set.
   * Distinct from Hunyuan3D's `previewMode=MESH_FIRST` (single-job two-stage
   * pipeline) — Rodin is two fully independent jobs that each bill separately.
   */
  rodinMeshFirst: z.boolean().optional(),
  /**
   * Mesh-first lineage: id of the mesh-only Generation that this textured
   * generation continues from. Persisted onto the textured Generation's
   * `snapshot` JSON so the gallery / UI can hide the mesh-only preview once
   * its textured continuation exists.
   */
  parentGenerationId: z.string().trim().min(1).optional(),
  /**
   * Hyper3D Rodin Gen-2.5 texture-only continuation: when true, the service
   * dispatches to /api/v2/rodin_texture_only (not /api/v2/rodin) so the exact
   * mesh from `parentGenerationId` is preserved and only textures are
   * generated. Requires `parentGenerationId` to point at a completed
   * mesh-only Generation owned by the same user. The service reads the
   * parent's `modelUrl` + `referenceImageUrl` to construct the request.
   */
  rodinTextureOnly: z.boolean().optional(),
})

export type Generate3DRequest = z.infer<typeof Generate3DRequestSchema>

// ─── PR3-α: Staged-generation user actions ──────────────────────────

export const Continue3DRequestSchema = z.object({
  jobId: z.string().trim().min(1),
  /** Optional override of the Stage 2 seed; defaults to the original. */
  seed: z.number().int().min(-1).optional(),
})

export type Continue3DRequest = z.infer<typeof Continue3DRequestSchema>

export const RetryMesh3DRequestSchema = z.object({
  jobId: z.string().trim().min(1),
  /** Optional new seed for Stage 1. Omit to let fal pick one. */
  seed: z.number().int().min(-1).optional(),
  /** Optional replacement multi-view side images (e.g. after regeneration). */
  multiViewImages: Model3DMultiViewImagesSchema.optional(),
  /** Optional new face budget if user dialled it up after seeing the mesh. */
  faceCount: z
    .number()
    .int()
    .min(HUNYUAN3D_FACE_COUNT.MIN)
    .max(HUNYUAN3D_FACE_COUNT.MAX)
    .optional(),
})

export type RetryMesh3DRequest = z.infer<typeof RetryMesh3DRequestSchema>

export const Cancel3DRequestSchema = z.object({
  jobId: z.string().trim().min(1),
})

export type Cancel3DRequest = z.infer<typeof Cancel3DRequestSchema>

export const Model3DStatusRequestSchema = AudioStatusRequestSchema
export type Model3DSubmitResponseData = AsyncJobSubmitResponseData
export type Model3DStatusResponseData =
  | {
      jobId: string
      status: 'IN_QUEUE' | 'IN_PROGRESS'
      generation?: never
      previewModelUrl?: string
      meshModelUrl?: string
      stage?: (typeof MODEL_3D_PROGRESS_STAGES)[number]
      /**
       * Temporary provider URL surfaced during the `uploading` stage so the
       * UI can render the finished mesh before R2 ingest completes. Only set
       * when the worker has the fal result but hasn't finalized the R2
       * upload yet.
       */
      provisionalModelUrl?: string
      /**
       * Best-effort byte counter for the R2 ingest, readable when the status
       * poll lands on the same worker running the upload. `total` may be 0
       * if the source provider didn't advertise content-length.
       */
      uploadProgress?: { loaded: number; total: number }
    }
  | {
      jobId: string
      status: 'COMPLETED'
      generation: GenerationRecord
      previewModelUrl?: string
      stage?: (typeof MODEL_3D_PROGRESS_STAGES)[number]
    }
  | {
      jobId: string
      status: 'FAILED'
      generation?: never
      previewModelUrl?: string
      stage?: (typeof MODEL_3D_PROGRESS_STAGES)[number]
      cancelled?: boolean
    }

// ─── Multi-View Generation (reference-edit chain for 3D inputs) ─────

/**
 * Generate alternate camera angles of a source image. These are temporary
 * provider URLs, not Generation rows, so the final 3D run is the only
 * archived output. Hunyuan v3/v3.1 can consume the returned views directly.
 */
export const MultiViewGenerateRequestSchema = z.object({
  /** Public URL of the front-view source image (reference) */
  imageUrl: z.string().trim().url('Source image URL is required'),
  /** Source image generation ID (for lineage tracking) */
  sourceGenerationId: z.string().trim().min(1).optional(),
  /** Reference-aware image model. Defaults to gemini-2.5-flash-image. */
  modelId: z.string().trim().min(1).max(160).optional(),
  /** Saved API key ID (BYOK) */
  apiKeyId: z.string().trim().min(1).optional(),
  /** Project ID for grouping the resulting view rows */
  projectId: z.string().trim().min(1).optional(),
})

export type MultiViewGenerateRequest = z.infer<
  typeof MultiViewGenerateRequestSchema
>

export interface MultiViewImageRecord {
  id: string
  /**
   * `back / left / right` are the three orthogonal angles auto-generated for
   * Hunyuan3D feeds. `leftFront / rightFront` are 45° diagonal variants kept
   * available for manual workflows; they aren't part of the default fan-out.
   */
  view: 'back' | 'left' | 'right' | 'leftFront' | 'rightFront'
  url: string
  width: number
  height: number
  prompt: string
  model: string
  provider: string
}

export interface MultiViewGenerateResponseData {
  /** Temporary side-view URLs in stable order [back, left, right]. */
  views: MultiViewImageRecord[]
}

export interface MultiViewGenerateResponse {
  success: boolean
  data?: MultiViewGenerateResponseData
  error?: string
  errorCode?: string
  i18nKey?: string
}

export interface Model3DSubmitResponse {
  success: boolean
  data?: Model3DSubmitResponseData
  error?: string
}

export interface Model3DStatusResponse {
  success: boolean
  data?: Model3DStatusResponseData
  error?: string
}

// ─── Execution Worker Callback ───────────────────────────────────

export const ExecutionCallbackPayloadSchema = z.object({
  runId: z.string().trim().min(1, 'Run ID is required'),
  kind: z.enum(['ping', 'status', 'result']),
  ts: z.union([z.string().datetime(), z.number().int().nonnegative()]),
  data: z.unknown().optional(),
})

export type ExecutionCallbackPayload = z.infer<
  typeof ExecutionCallbackPayloadSchema
>

export const ExecutionCallbackResultDataSchema = z.object({
  artifactUrl: z.string().trim().url(),
  thumbnailUrl: z.string().trim().url().optional(),
  providerMetadata: z.record(z.string(), z.unknown()).optional(),
  cost: z.number().nonnegative().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  duration: z.number().nonnegative().optional(),
  requestCount: z.number().int().positive().optional(),
  mimeType: z.string().trim().min(1).optional(),
  fetchHeaders: z.record(z.string(), z.string()).optional(),
  /** 3D: pre-uploaded R2 storage key (Hyper3D Rodin worker uploads GLB before callback) */
  glbR2Key: z.string().trim().min(1).optional(),
})

export type ExecutionCallbackResultData = z.infer<
  typeof ExecutionCallbackResultDataSchema
>

export const ExecutionCallbackErrorDataSchema = z.object({
  error: z.string().trim().min(1),
  providerMetadata: z.record(z.string(), z.unknown()).optional(),
  requestCount: z.number().int().positive().optional(),
})

export type ExecutionCallbackErrorData = z.infer<
  typeof ExecutionCallbackErrorDataSchema
>

export const ResolveKeyRequestSchema = z
  .object({
    runId: z.string().trim().min(1, 'Run ID is required'),
    apiKeyId: z.string().trim().min(1, 'API key ID is required').optional(),
    adapterType: z
      .enum(
        Object.values(AI_ADAPTER_TYPES) as [
          AI_ADAPTER_TYPES,
          ...AI_ADAPTER_TYPES[],
        ],
      )
      .optional(),
    useSystemKey: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.apiKeyId || value.useSystemKey) return

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['apiKeyId'],
      message: 'Either API key ID or system key flag is required',
    })
  })

export const ResolveKeyResponseSchema = z.object({
  apiKey: z.string().min(1),
})

export type ResolveKeyRequest = z.infer<typeof ResolveKeyRequestSchema>
export type ResolveKeyResponse = z.infer<typeof ResolveKeyResponseSchema>

const WorkerRunContextBaseSchema = z.object({
  runId: z.string().trim().min(1),
  workflowId: z.enum([
    EXECUTION_WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO,
    EXECUTION_WORKFLOW_IDS.FAL_QUEUE,
  ]),
  providerId: z.string().trim().min(1),
  apiKeyId: z.string().trim().min(1).optional(),
  useSystemKey: z.boolean().optional(),
  callbackUrl: z.string().trim().url(),
  resolveKeyUrl: z.string().trim().url(),
  timeoutMs: z.number().int().positive(),
  maxAttempts: z.number().int().positive(),
  pollIntervalMs: z.number().int().positive(),
})

const WorkerVideoProviderInputSchema = z.object({
  prompt: z.string().min(1),
  modelId: z.string().min(1),
  externalModelId: z.string().min(1),
  aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']),
  /** Either a number of seconds, or 'auto' (Seedance-only literal). */
  duration: z
    .union([
      z.number().min(1).max(VIDEO_GENERATION.MAX_DURATION),
      z.literal('auto'),
    ])
    .optional(),
  referenceImage: z.string().optional(),
  /** Multi-reference array for Veo 3.1 reference-to-video. */
  referenceImages: z.array(z.string()).max(3).optional(),
  /** Reference audio clips for Seedance reference-to-video voice cloning. */
  audioUrls: z.array(z.string()).max(3).optional(),
  /**
   * Optional binding labels (character name per clip) for Seedance Reference.
   * When present, the worker builder emits "{Name} (@AudioN)" tokens.
   */
  audioBindings: z
    .array(
      z.object({
        url: z.string().min(1),
        characterName: z.string().min(1).max(160).optional(),
      }),
    )
    .max(3)
    .optional(),
  /** Reference video clips for Seedance reference-to-video. */
  videoUrls: z.array(z.string()).max(3).optional(),
  negativePrompt: z.string().optional(),
  resolution: z.enum(VIDEO_RESOLUTIONS).optional(),
  i2vModelId: z.string().optional(),
  videoDefaults: z.unknown().optional(),
  providerBaseUrl: z.string().trim().url().optional(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
})

const WorkerAudioProviderInputSchema = z.object({
  prompt: z.string().min(1),
  modelId: z.string().min(1),
  externalModelId: z.string().min(1),
  referenceAudioUrl: z.string().url(),
  referenceText: z.string().trim().max(TTS_MAX_TEXT_LENGTH).optional(),
  voiceId: z.string().min(1).optional(),
  speed: z.number().min(0.5).max(2.0).optional(),
  volume: z
    .number()
    .min(TTS_VOLUME_RANGE.min)
    .max(TTS_VOLUME_RANGE.max)
    .optional(),
  normalizeLoudness: z.boolean().optional(),
  normalizeText: z.boolean().optional(),
  withTimestamps: z.boolean().optional(),
  format: z.enum(AUDIO_FORMATS).optional(),
  sampleRate: z.number().int().min(8000).max(48000).optional(),
  mp3Bitrate: z
    .number()
    .refine((value) =>
      AUDIO_MP3_BITRATES.includes(value as (typeof AUDIO_MP3_BITRATES)[number]),
    )
    .optional(),
  opusBitrate: z
    .number()
    .refine((value) =>
      AUDIO_OPUS_BITRATES.includes(
        value as (typeof AUDIO_OPUS_BITRATES)[number],
      ),
    )
    .optional(),
  latency: z.enum(AUDIO_LATENCIES).optional(),
  temperature: z
    .number()
    .min(TTS_TEMPERATURE_RANGE.min)
    .max(TTS_TEMPERATURE_RANGE.max)
    .optional(),
  topP: z.number().min(TTS_TOP_P_RANGE.min).max(TTS_TOP_P_RANGE.max).optional(),
  chunkLength: z
    .number()
    .int()
    .min(TTS_CHUNK_LENGTH_RANGE.min)
    .max(TTS_CHUNK_LENGTH_RANGE.max)
    .optional(),
  repetitionPenalty: z
    .number()
    .min(TTS_REPETITION_PENALTY_RANGE.min)
    .max(TTS_REPETITION_PENALTY_RANGE.max)
    .optional(),
  speakerVoiceIds: z.array(z.string().trim().min(1).max(200)).max(8).optional(),
})

export const WorkerRunContextSchema = z
  .discriminatedUnion('outputType', [
    WorkerRunContextBaseSchema.extend({
      outputType: z.literal('VIDEO'),
      providerInput: WorkerVideoProviderInputSchema,
    }),
    WorkerRunContextBaseSchema.extend({
      outputType: z.literal('AUDIO'),
      providerInput: WorkerAudioProviderInputSchema,
    }),
  ])
  .superRefine((value, ctx) => {
    if (value.apiKeyId || value.useSystemKey) return

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['apiKeyId'],
      message: 'Either API key ID or system key flag is required',
    })
  })

export const WorkerDispatchResultSchema = z.object({
  workflowInstanceId: z.string().min(1),
})

export type WorkerRunContext = z.infer<typeof WorkerRunContextSchema>
export type WorkerDispatchResult = z.infer<typeof WorkerDispatchResultSchema>

export const LongVideoPipelineWorkerRunContextSchema = z.object({
  runId: z.string().trim().min(1),
  workflowId: z.literal(EXECUTION_WORKFLOW_IDS.LONG_VIDEO_PIPELINE),
  pipelineId: z.string().trim().min(1),
  advanceUrl: z.string().trim().url(),
  timeoutMs: z.number().int().positive(),
  maxAttempts: z.number().int().positive(),
  pollIntervalMs: z.number().int().positive(),
})

export type LongVideoPipelineWorkerRunContext = z.infer<
  typeof LongVideoPipelineWorkerRunContextSchema
>

export const WorkerModel3DRunContextSchema = z.object({
  runId: z.string().trim().min(1),
  workflowId: z.enum([
    EXECUTION_WORKFLOW_IDS.HYPER3D_RODIN,
    EXECUTION_WORKFLOW_IDS.HUNYUAN3D,
  ]),
  outputType: z.literal('MODEL_3D'),
  providerId: z.string().trim().min(1),
  userId: z.string().trim().min(1).optional(),
  apiKeyId: z.string().trim().min(1).optional(),
  useSystemKey: z.boolean().optional(),
  callbackUrl: z.string().trim().url(),
  resolveKeyUrl: z.string().trim().url(),
  timeoutMs: z.number().int().positive(),
  maxAttempts: z.number().int().positive(),
  pollIntervalMs: z.number().int().positive(),
  providerInput: z
    .object({
      // Optional for Rodin text-to-3D mode (prompt only, no source image).
      imageUrl: z.string().url().optional(),
      modelId: z.string().min(1),
      externalModelId: z.string().min(1),
      seed: z.number().int().optional(),
      // Rodin-specific
      tier: z.string().optional(),
      meshMode: z.string().optional(),
      quality: z.string().optional(),
      textureMode: z.string().optional(),
      material: z.string().optional(),
      highPack: z.boolean().optional(),
      taPose: z.boolean().optional(),
      hdTexture: z.boolean().optional(),
      textureDelight: z.boolean().optional(),
      qualityOverride: z.number().optional(),
      bboxCondition: z.unknown().optional(),
      additionalImageUrls: z.array(z.string().url()).optional(),
      geometryInstructMode: z.string().optional(),
      geometryFileFormat: z.string().optional(),
      prompt: z.string().optional(),
      useOriginalAlpha: z.boolean().optional(),
      previewRender: z.boolean().optional(),
      isMicro: z.boolean().optional(),
      // Rodin texture-only continuation: re-textures an existing mesh GLB
      // without regenerating geometry. See submitRodinTextureOnlyJob in
      // workers/execution/src/index.ts.
      rodinTextureOnly: z.boolean().optional(),
      parentMeshUrl: z.string().url().optional(),
      // fal / Hunyuan3D
      enablePbr: z.boolean().optional(),
      faceCount: z.number().int().optional(),
      multiViewImages: z.record(z.string(), z.string()).optional(),
      removeBackground: z.boolean().optional(),
      octreeResolution: z.number().int().optional(),
      generateType: z.string().optional(),
      polygonType: z.string().optional(),
    })
    .passthrough(),
})

export type WorkerModel3DRunContext = z.infer<
  typeof WorkerModel3DRunContextSchema
>

// ─── Long Video Pipeline ──────────────────────────────────────────

export const LongVideoRequestSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, 'Prompt is required')
    .max(4000, 'Prompt is too long (max 4000 characters)'),
  modelId: z.string().trim().min(1, 'Model is required').max(160),
  aspectRatio: z
    .enum(['1:1', '16:9', '9:16', '4:3', '3:4'])
    .default(VIDEO_GENERATION.DEFAULT_ASPECT_RATIO),
  targetDuration: z
    .number()
    .int()
    .min(10)
    .max(VIDEO_GENERATION.MAX_LONG_VIDEO_DURATION),
  referenceImage: z.string().optional(),
  negativePrompt: z.string().trim().max(2000).optional(),
  resolution: z.enum(VIDEO_RESOLUTIONS).optional(),
  apiKeyId: z.string().trim().min(1).optional(),
  characterCardIds: z.array(z.string().trim().min(1)).max(5).optional(),
})

export type LongVideoRequest = z.infer<typeof LongVideoRequestSchema>

export const LongVideoStatusRequestSchema = z.object({
  pipelineId: z.string().trim().min(1, 'Pipeline ID is required'),
})

export const LongVideoPipelineAdvanceRequestSchema = z.object({
  runId: z.string().trim().min(1, 'Run ID is required'),
  pipelineId: z.string().trim().min(1, 'Pipeline ID is required'),
  action: z.enum(['advance', 'fail']).default('advance'),
  attempt: z.number().int().positive().optional(),
  error: z.string().trim().max(2000).optional(),
})

export type PipelineClipStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'

export type VideoPipelineStatus =
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'

export interface PipelineClipRecord {
  clipIndex: number
  status: PipelineClipStatus
  videoUrl?: string | null
  durationSec?: number | null
  errorMessage?: string | null
}

export interface PipelineStatusRecord {
  pipelineId: string
  status: VideoPipelineStatus
  totalClips: number
  completedClips: number
  currentDurationSec: number
  targetDurationSec: number
  clips: PipelineClipRecord[]
  generation?: GenerationRecord
  errorMessage?: string | null
}

export interface LongVideoSubmitResponseData {
  pipelineId: string
  totalClips: number
  estimatedDurationSec: number
}

export interface LongVideoSubmitResponse {
  success: boolean
  data?: LongVideoSubmitResponseData
  error?: string
}

export interface LongVideoStatusResponse {
  success: boolean
  data?: PipelineStatusRecord
  error?: string
}

// ─── Image Record ─────────────────────────────────────────────────

export type OutputType = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'MODEL_3D'
export type GenerationStatus = 'PENDING' | 'COMPLETED' | 'FAILED'

export interface GenerationRecord {
  id: string
  createdAt: Date
  outputType: OutputType
  status: GenerationStatus
  url: string
  storageKey: string
  mimeType: string
  thumbnailUrl?: string | null
  thumbnailStorageKey?: string | null
  previewUrl?: string | null
  previewStorageKey?: string | null
  width: number
  height: number
  duration?: number | null
  referenceImageUrl?: string | null
  referenceImages?: ReferenceAsset[]
  /** GLB file URL for MODEL_3D outputs */
  modelUrl?: string | null
  /** R2 storage key for the GLB file */
  modelStorageKey?: string | null
  prompt: string
  negativePrompt?: string | null
  model: string
  provider: string
  requestCount: number
  isPublic: boolean
  isPromptPublic: boolean
  isFeatured?: boolean
  userId?: string | null
  /** Project (folder) the generation belongs to. `null` means Unassigned. */
  projectId?: string | null
  /** Creator info — present in gallery context */
  creator?: {
    username: string
    displayName: string | null
    avatarUrl: string | null
  } | null
  /** B0: Full input parameter snapshot — parse with GenerationSnapshotSchema */
  snapshot?: unknown
  /** B0: Seed used for generation (bigint from DB, string/number after JSON) */
  seed?: bigint | string | number | null
  /** B0: Run group ID for compare/variant */
  runGroupId?: string | null
  /** B0: Run group type */
  runGroupType?: string
  /** B0: Position in run group */
  runGroupIndex?: number
  /** B0: Winner flag for compare mode */
  isWinner?: boolean
  /** Like count — present in gallery context */
  likeCount?: number
  /** Whether the current viewer has liked this — present when viewer is authenticated */
  isLiked?: boolean
}

// ─── API Key ──────────────────────────────────────────────────────

// `baseUrl` flows into outbound fetch() in apiKey.service.ts (verify) and the
// execution worker (live calls). User-controlled values must be https-only —
// http allows an attacker-registered key to point at internal services and
// have the server attach Bearer/x-goog-api-key headers to the request. SSRF
// hostname blocking is enforced at fetch time via `safeFetch`.
export const ProviderConfigSchema = z.object({
  label: z.string().trim().min(1).max(60),
  baseUrl: z
    .string()
    .trim()
    .url()
    .max(300)
    .refine((v) => v.startsWith('https://'), 'baseUrl must use https'),
})
export type ProviderConfigInput = z.infer<typeof ProviderConfigSchema>

export const CreateApiKeySchema = z.object({
  adapterType: z.enum(API_KEY_ADAPTER_OPTIONS),
  providerConfig: ProviderConfigSchema,
  modelId: z.string().trim().min(1).max(160),
  label: z.string().trim().min(1).max(50),
  keyValue: z.string().trim().min(10),
})
export type CreateApiKeyRequest = z.infer<typeof CreateApiKeySchema>

export const UpdateApiKeySchema = z.object({
  label: z.string().min(1).max(50).optional(),
  isActive: z.boolean().optional(),
  keyValue: z.string().trim().min(10).optional(),
})
export type UpdateApiKeyRequest = z.infer<typeof UpdateApiKeySchema>

export interface UserApiKeyRecord {
  id: string
  modelId: string
  adapterType: AI_ADAPTER_TYPES
  providerConfig: ProviderConfig
  label: string
  maskedKey: string
  isActive: boolean
  createdAt: Date
}

export interface ApiKeysResponse {
  success: boolean
  data?: UserApiKeyRecord[]
  error?: string
}

export interface ApiKeyResponse {
  success: boolean
  data?: UserApiKeyRecord
  error?: string
}

/** Result of verifying a user's API key */
export type ApiKeyHealthStatus = 'available' | 'no_key' | 'failed' | 'unknown'

export interface ApiKeyVerifyResult {
  id: string
  status: ApiKeyHealthStatus
  latencyMs?: number
  error?: string
}

export interface ApiKeyVerifyResponse {
  success: boolean
  data?: ApiKeyVerifyResult
  error?: string
}

// ─── Visibility Toggle ────────────────────────────────────────────

export interface ToggleVisibilityResponse {
  success: boolean
  data?: Pick<GenerationRecord, 'id' | 'isPublic' | 'isPromptPublic'> & {
    isFeatured?: boolean
  }
  error?: string
  errorCode?: string
  i18nKey?: string
}

// ─── Gallery Search & Filter ──────────────────────────────────────

export const GALLERY_SORT_OPTIONS = ['newest', 'oldest'] as const
export type GallerySortOption = (typeof GALLERY_SORT_OPTIONS)[number]

export const OUTPUT_TYPE_FILTER_OPTIONS = [
  'all',
  'image',
  'video',
  'audio',
  'model_3d',
] as const
export type OutputTypeFilter = (typeof OUTPUT_TYPE_FILTER_OPTIONS)[number]

export const GALLERY_TIME_RANGE_OPTIONS = ['all', 'today', 'week'] as const
export type GalleryTimeRange = (typeof GALLERY_TIME_RANGE_OPTIONS)[number]

export const GallerySearchSchema = z.object({
  search: z.string().trim().max(200).optional(),
  model: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((model) => (model ? getModelById(model)?.id : undefined)),
  sort: z.enum(GALLERY_SORT_OPTIONS).default('newest'),
  type: z.enum(OUTPUT_TYPE_FILTER_OPTIONS).default('all'),
  timeRange: z.enum(GALLERY_TIME_RANGE_OPTIONS).default('all'),
  liked: z.enum(['1']).optional(),
  /**
   * Filter generations by project. Pass a project UUID to scope the feed to
   * that project, the literal "none" to surface unassigned generations only,
   * or omit the field for "all projects". Optional — does not break existing
   * call sites.
   */
  projectId: z.string().trim().max(64).optional(),
  /**
   * Filter by Generation.provider — used by the asset browser's
   * "Local assets" sidebar entry to scope to user-uploaded rows.
   */
  provider: z.string().trim().max(64).optional(),
  published: z.enum(['1']).optional(),
  cursor: z.string().trim().max(256).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export type GallerySearchParams = z.infer<typeof GallerySearchSchema>

// ─── Gallery Response ─────────────────────────────────────────────

export interface GalleryResponseData {
  generations: GenerationRecord[]
  page: number
  limit: number
  total: number | null
  hasMore: boolean
  nextCursor: string | null
}

/**
 * Aggregate counts powering the /assets right-sidebar. Returned by
 * GET /api/assets/section-counts so each sidebar entry can render its
 * own number without one count query per item.
 */
export interface AssetSectionCounts {
  all: number
  favorites: number
  published: number
  image: number
  video: number
  audio: number
  /** Optional — only populated once the section-counts service knows about MODEL_3D. */
  model_3d?: number
  unassigned: number
  /** Keyed by project UUID. */
  byProject: Record<string, number>
}

export interface GalleryResponse {
  success: boolean
  data?: GalleryResponseData
  error?: string
  errorCode?: string
  i18nKey?: string
}

export const UsageSummarySchema = z.object({
  totalRequests: z.number().int().nonnegative(),
  successfulRequests: z.number().int().nonnegative(),
  failedRequests: z.number().int().nonnegative(),
  last30DaysRequests: z.number().int().nonnegative(),
  lastRequestAt: z.string().datetime().nullable(),
  freeGenerationsToday: z.number().int().nonnegative(),
  freeGenerationLimit: z.number().int().nonnegative(),
})

export type UsageSummary = z.infer<typeof UsageSummarySchema>

// ─── Delete Generation ───────────────────────────────────────────

export interface DeleteGenerationResponse {
  success: boolean
  error?: string
}

// ─── Prompt Enhancement ──────────────────────────────────────────

export const EnhancePromptRequestSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, 'Prompt is required')
    .max(PROMPT_ENHANCE.MAX_INPUT_LENGTH),
  style: z.enum(PROMPT_ENHANCE.STYLES),
  /** Current model ID for model-aware enhancement hints */
  modelId: z.string().optional(),
  apiKeyId: z.string().optional(),
  /** When true, search the curated inspiration library and inject top-3
   *  matches as a few-shot reference block into the system prompt. */
  useInspirationContext: z.boolean().optional(),
})

export type EnhancePromptRequest = z.infer<typeof EnhancePromptRequestSchema>

export interface EnhancePromptResponseData {
  original: string
  enhanced: string
  style: string
}

export interface EnhancePromptResponse {
  success: boolean
  data?: EnhancePromptResponseData
  error?: string
}

// ─── Prompt Assistant (Chat-based) ───────────────────────────────

export const PromptAssistantMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
})

export const PromptAssistantResponseLanguageSchema = z.enum([
  'english',
  'japanese',
  'chinese',
])
export const PromptAssistantModeSchema = z.enum(['general', 'lora'])

export const PromptAssistantRequestSchema = z.object({
  messages: z.array(PromptAssistantMessageSchema).min(1),
  /** Current generation model (for model-aware prompt formatting) */
  modelId: z.string().optional(),
  /** Reference image base64 or URL (for style analysis) */
  referenceImageData: z.string().optional(),
  /** Current prompt in the textarea (for context) */
  currentPrompt: z.string().optional(),
  /** User-selected API key for LLM calls */
  apiKeyId: z.string().optional(),
  /** User-selected language for assistant prompt output */
  responseLanguage: PromptAssistantResponseLanguageSchema.optional(),
  /** Specialized prompt conversion mode */
  mode: PromptAssistantModeSchema.optional(),
  /** When true (and only on the first turn), inject top-3 curated
   *  inspiration prompts as a few-shot reference block. */
  useInspirationContext: z.boolean().optional(),
})

export type PromptAssistantRequest = z.infer<
  typeof PromptAssistantRequestSchema
>
export type PromptAssistantMessage = z.infer<
  typeof PromptAssistantMessageSchema
>
export type PromptAssistantResponseLanguage = z.infer<
  typeof PromptAssistantResponseLanguageSchema
>
export type PromptAssistantMode = z.infer<typeof PromptAssistantModeSchema>

export interface PromptAssistantResponseData {
  prompt: string
}

export interface PromptAssistantResponse {
  success: boolean
  data?: PromptAssistantResponseData
  error?: string
}

// ─── Prompt Feedback ─────────────────────────────────────────────

export const PromptFeedbackRequestSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, 'Prompt is required')
    .max(PROMPT_ENHANCE.MAX_INPUT_LENGTH),
  context: z.string().max(500).optional(),
  apiKeyId: z.string().optional(),
})

export type PromptFeedbackRequest = z.infer<typeof PromptFeedbackRequestSchema>

export interface PromptFeedbackSuggestion {
  category: string
  suggestion: string
  example?: string
}

export interface PromptFeedbackResponseData {
  originalPrompt: string
  overallAssessment: string
  suggestions: PromptFeedbackSuggestion[]
  improvedPrompt: string
}

export interface PromptFeedbackResponse {
  success: boolean
  data?: PromptFeedbackResponseData
  error?: string
}

// ─── Generation Feedback (Conversational Refinement) ────────────

/** A single message in the refinement conversation */
export const ConversationMessageSchema = z.object({
  role: z.enum(['assistant', 'user']),
  content: z.string().min(1),
})
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>

/** Request for one turn of the refinement conversation */
export const GenerationFeedbackRequestSchema = z.object({
  imageUrl: z.string().min(1),
  originalPrompt: z.string().min(1),
  messages: z.array(ConversationMessageSchema),
  locale: z.string().min(2).max(5).default('en'),
  apiKeyId: z.string().optional(),
})
export type GenerationFeedbackRequest = z.infer<
  typeof GenerationFeedbackRequestSchema
>

/** AI response — either asks more questions or delivers a final prompt */
export interface GenerationFeedbackResult {
  reply: string
  refinedPrompt: string | null
  negativeAdditions: string[]
  done: boolean
}

export interface GenerationFeedbackResponse {
  success: boolean
  data?: GenerationFeedbackResult
  error?: string
}

// ─── Image Reverse Engineering ───────────────────────────────────

/** Dimensions available for selective image analysis */
export const AnalysisDimensionEnum = z.enum([
  'artStyle',
  'character',
  'background',
  'overall',
  'tags',
])
export type AnalysisDimension = z.infer<typeof AnalysisDimensionEnum>

export const AnalyzeImageRequestSchema = z.object({
  imageData: z
    .string()
    .min(1, 'Image data is required')
    .refine(
      (data) =>
        data.startsWith('data:image/png') ||
        data.startsWith('data:image/jpeg') ||
        data.startsWith('data:image/webp') ||
        data.startsWith('data:image/gif') ||
        data.startsWith('http://') ||
        data.startsWith('https://'),
      'Image must be a valid image data URL (PNG, JPEG, WebP, GIF) or HTTP(S) URL',
    ),
  /** Which dimensions to extract. If omitted, returns a single combined prompt (legacy). */
  dimensions: z.array(AnalysisDimensionEnum).min(1).optional(),
  apiKeyId: z.string().optional(),
})

export type AnalyzeImageRequest = z.infer<typeof AnalyzeImageRequestSchema>

export interface ImageAnalysisRecord {
  id: string
  sourceImageUrl: string
  generatedPrompt: string
  modelUsed: string
  createdAt: Date
}

export interface AnalyzeImageResponseData {
  id: string
  generatedPrompt: string
  /** Extracted dimensions (null when legacy mode without dimensions param) */
  dimensions: Partial<Record<AnalysisDimension, string>> | null
  sourceImageUrl: string
}

export interface AnalyzeImageResponse {
  success: boolean
  data?: AnalyzeImageResponseData
  error?: string
}

export const GenerateVariationsModelSchema = z.object({
  modelId: z.string().trim().min(1),
  apiKeyId: z.string().trim().min(1).optional(),
})

export type GenerateVariationsModel = z.infer<
  typeof GenerateVariationsModelSchema
>

export const GenerateVariationsRequestSchema = z.object({
  models: z.array(GenerateVariationsModelSchema).min(1).max(9),
  aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']).default('1:1'),
})

export type GenerateVariationsRequest = z.infer<
  typeof GenerateVariationsRequestSchema
>

export interface GenerateVariationsResponseData {
  variations: GenerationRecord[]
  failed: string[]
}

export interface GenerateVariationsResponse {
  success: boolean
  data?: GenerateVariationsResponseData
  error?: string
}

// ─── Arena ───────────────────────────────────────────────────────

export const ArenaModelSelectionSchema = z.object({
  modelId: z.string().min(1),
  apiKeyId: z.string().optional(),
})

export type ArenaModelSelection = z.infer<typeof ArenaModelSelectionSchema>

export const CreateArenaMatchRequestSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, 'Prompt is required')
    .max(4000, 'Prompt is too long (max 4000 characters)'),
  aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']).default('1:1'),
  models: z.array(ArenaModelSelectionSchema).min(2).optional(),
  referenceImage: z.string().optional(),
  advancedParams: AdvancedParamsSchema.optional(),
})

export type CreateArenaMatchRequest = z.infer<
  typeof CreateArenaMatchRequestSchema
>

export const CreateArenaEntryRequestSchema = z.object({
  modelId: z.string().min(1),
  apiKeyId: z.string().optional(),
  slotIndex: z.number().int().min(0),
  advancedParams: AdvancedParamsSchema.optional(),
})

export type CreateArenaEntryRequest = z.infer<
  typeof CreateArenaEntryRequestSchema
>

export const ArenaVoteRequestSchema = z.object({
  winnerEntryId: z.string().trim().min(1),
})

export type ArenaVoteRequest = z.infer<typeof ArenaVoteRequestSchema>

export type ArenaEntryStatus = 'pending' | 'completed' | 'failed'

export interface ArenaEntryRecord {
  id: string
  slotIndex: number
  modelId: string
  status: ArenaEntryStatus
  imageUrl?: string
  wasVoted: boolean
}

export interface ArenaMatchRecord {
  id: string
  prompt: string
  aspectRatio: string
  referenceImage: string | null
  winnerId: string | null
  votedAt: Date | null
  createdAt: Date
  entries: ArenaEntryRecord[]
}

export interface CreateArenaMatchResponse {
  success: boolean
  data?: { matchId: string }
  error?: string
}

export interface ArenaMatchResponse {
  success: boolean
  data?: ArenaMatchRecord
  error?: string
}

export interface ArenaVoteResponse {
  success: boolean
  data?: { winnerId: string; eloUpdates: EloUpdate[] }
  error?: string
}

export interface EloUpdate {
  modelId: string
  oldRating: number
  newRating: number
  change: number
}

export interface LeaderboardEntry {
  modelId: string
  modelFamily: string | null
  rating: number
  matchCount: number
  winCount: number
  winRate: number
}

export interface ArenaLeaderboardResponse {
  success: boolean
  data?: LeaderboardEntry[]
  error?: string
}

// ─── Arena History & Personal Stats ─────────────────────────────

export interface ArenaHistoryEntry {
  id: string
  prompt: string
  aspectRatio: string
  winnerId: string | null
  votedAt: string | null
  createdAt: string
  entries: {
    id: string
    modelId: string
    slotIndex: number
    wasVoted: boolean
    imageUrl: string | null
  }[]
}

export interface ArenaHistoryResponse {
  success: boolean
  data?: {
    matches: ArenaHistoryEntry[]
    total: number
    hasMore: boolean
  }
  error?: string
}

export interface PersonalModelStat {
  modelId: string
  matchCount: number
  winCount: number
  winRate: number
}

export interface ArenaPersonalStatsResponse {
  success: boolean
  data?: {
    totalMatches: number
    stats: PersonalModelStat[]
  }
  error?: string
}

// ─── Storyboard ──────────────────────────────────────────────────

export const CreateStoryRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  generationIds: z.array(z.string().trim().min(1)).min(1).max(20),
})

export type CreateStoryRequest = z.infer<typeof CreateStoryRequestSchema>

export const UpdateStoryRequestSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  displayMode: z.enum(['scroll', 'comic']).optional(),
  isPublic: z.boolean().optional(),
})

export type UpdateStoryRequest = z.infer<typeof UpdateStoryRequestSchema>

export const GenerateNarrativeRequestSchema = z.object({
  tone: z
    .enum(['humorous', 'dramatic', 'poetic', 'adventure'])
    .default('dramatic'),
})

export type GenerateNarrativeRequest = z.infer<
  typeof GenerateNarrativeRequestSchema
>
export type NarrativeTone = GenerateNarrativeRequest['tone']

// ─── Projects ───────────────────────────────────────────────────

export const CreateProjectSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  description: z.string().trim().max(500).optional(),
  parentId: z.string().trim().min(1).max(64).nullable().optional(),
})

export type CreateProjectRequest = z.infer<typeof CreateProjectSchema>

export const UpdateProjectSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  parentId: z.string().trim().min(1).max(64).nullable().optional(),
})

export type UpdateProjectRequest = z.infer<typeof UpdateProjectSchema>

export interface ProjectRecord {
  id: string
  name: string
  description: string | null
  parentId: string | null
  generationCount: number
  latestGenerationUrl: string | null
  createdAt: Date
  updatedAt: Date
}

export interface ProjectsResponse {
  success: boolean
  data?: ProjectRecord[]
  error?: string
}

export interface ProjectResponse {
  success: boolean
  data?: ProjectRecord
  error?: string
}

export interface ProjectHistoryResponse {
  success: boolean
  data?: {
    generations: GenerationRecord[]
    total: number
    hasMore: boolean
  }
  error?: string
}

// ─── Character Card ─────────────────────────────────────────────

/** Character card status enum */
export const CharacterCardStatusSchema = z.enum(CHARACTER_CARD.STATUSES)
export type CharacterCardStatusType = z.infer<typeof CharacterCardStatusSchema>

/** Structured source image entry with view type (for multi-angle references) */
export const SourceImageEntrySchema = z.object({
  url: z.string().min(1),
  viewType: z.enum(CHARACTER_CARD.VIEW_TYPES).default('other'),
  label: z.string().max(60).optional(),
})
export type SourceImageEntry = z.infer<typeof SourceImageEntrySchema>

/** Structured character attributes extracted by LLM */
export const CharacterAttributesSchema = z.object({
  hairColor: z.string().max(50).optional(),
  hairStyle: z.string().max(100).optional(),
  eyeColor: z.string().max(50).optional(),
  skinTone: z.string().max(50).optional(),
  bodyType: z.string().max(100).optional(),
  outfit: z.string().max(300).optional(),
  accessories: z.string().max(300).optional(),
  pose: z.string().max(200).optional(),
  expression: z.string().max(100).optional(),
  artStyle: z.string().max(200).optional(),
  colorPalette: z.string().max(200).optional(),
  distinguishingFeatures: z.string().max(500).optional(),
  freeformDescription: z.string().max(2000).optional(),
})

export type CharacterAttributes = z.infer<typeof CharacterAttributesSchema>

const sourceImageDataValidator = z
  .string()
  .min(1)
  .refine(
    (data) =>
      data.startsWith('data:image/png') ||
      data.startsWith('data:image/jpeg') ||
      data.startsWith('data:image/webp') ||
      data.startsWith('data:image/gif') ||
      data.startsWith('https://'),
    'Each image must be a valid image data URL or HTTPS URL',
  )

/** Source image upload with optional view type metadata */
export const SourceImageUploadSchema = z.object({
  data: sourceImageDataValidator,
  viewType: z.enum(CHARACTER_CARD.VIEW_TYPES).default('other'),
  label: z.string().max(60).optional(),
})
export type SourceImageUpload = z.infer<typeof SourceImageUploadSchema>

/** Create character card request */
export const CreateCharacterCardSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(CHARACTER_CARD.NAME_MAX_LENGTH),
  sourceImages: z
    .array(z.union([sourceImageDataValidator, SourceImageUploadSchema]))
    .min(1, 'At least one source image is required')
    .max(CHARACTER_CARD.MAX_SOURCE_IMAGES),
  description: z
    .string()
    .trim()
    .max(CHARACTER_CARD.DESCRIPTION_MAX_LENGTH)
    .optional(),
  tags: z
    .array(z.string().trim().max(CHARACTER_CARD.TAG_MAX_LENGTH))
    .max(CHARACTER_CARD.MAX_TAGS)
    .optional(),
  /** Parent card ID to create this as a variant */
  parentId: z.string().trim().min(1).optional(),
  /** Variant label (e.g. "Anime Style", "Realistic", "Chibi") */
  variantLabel: z
    .string()
    .trim()
    .max(CHARACTER_CARD.VARIANT_LABEL_MAX_LENGTH)
    .optional(),
  apiKeyId: z.string().trim().min(1).optional(),
})

export type CreateCharacterCardRequest = z.infer<
  typeof CreateCharacterCardSchema
>

/** Update character card request */
export const UpdateCharacterCardSchema = z.object({
  name: z.string().trim().min(1).max(CHARACTER_CARD.NAME_MAX_LENGTH).optional(),
  description: z
    .string()
    .trim()
    .max(CHARACTER_CARD.DESCRIPTION_MAX_LENGTH)
    .nullable()
    .optional(),
  tags: z
    .array(z.string().trim().max(CHARACTER_CARD.TAG_MAX_LENGTH))
    .max(CHARACTER_CARD.MAX_TAGS)
    .optional(),
  status: CharacterCardStatusSchema.optional(),
  characterPrompt: z.string().trim().max(4000).optional(),
  attributes: CharacterAttributesSchema.optional(),
  variantLabel: z
    .string()
    .trim()
    .max(CHARACTER_CARD.VARIANT_LABEL_MAX_LENGTH)
    .nullable()
    .optional(),
  /** Replace source images with structured entries */
  sourceImageEntries: z.array(SourceImageEntrySchema).optional(),
  /** Character-specific LoRA models */
  loras: z.array(LoraSchema).max(5).nullable().optional(),
})

export type UpdateCharacterCardRequest = z.infer<
  typeof UpdateCharacterCardSchema
>

/** Refine character card request */
export const RefineCharacterCardSchema = z.object({
  models: z.array(GenerateVariationsModelSchema).min(1).max(9),
  aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']).default('1:1'),
})

export type RefineCharacterCardRequest = z.infer<
  typeof RefineCharacterCardSchema
>

/** Score consistency request */
export const ScoreConsistencySchema = z.object({
  generationId: z.string().trim().min(1),
})

export type ScoreConsistencyRequest = z.infer<typeof ScoreConsistencySchema>

/** Character card record returned from API */
export interface CharacterCardRecord {
  id: string
  name: string
  description: string | null
  sourceImageUrl: string
  sourceImages: string[]
  /** Structured source images with view types (for multi-angle references) */
  sourceImageEntries: SourceImageEntry[]
  characterPrompt: string
  modelPrompts: Record<string, string> | null
  referenceImages: string[] | null
  attributes: CharacterAttributes | null
  loras: z.infer<typeof LoraSchema>[] | null
  tags: string[]
  status: CharacterCardStatusType
  stabilityScore: number | null
  /** Parent card ID (null for root cards) */
  parentId: string | null
  /** Variant label (e.g. "Anime Style", "3D Model") */
  variantLabel: string | null
  /** Child variant cards */
  variants: CharacterCardRecord[]
  createdAt: Date
  updatedAt: Date
}

/** Consistency score breakdown */
export interface ConsistencyScoreBreakdown {
  face: number
  hair: number
  outfit: number
  pose: number
  style: number
}

/** Consistency score result */
export interface ConsistencyScoreResult {
  overallScore: number
  breakdown: ConsistencyScoreBreakdown
  suggestions: string[]
}

/** Refine result for a single generation */
export interface RefineGenerationResult {
  generation: GenerationRecord
  score: ConsistencyScoreResult | null
}

/** Character card API responses */
export interface CharacterCardResponse {
  success: boolean
  data?: CharacterCardRecord
  error?: string
}

export interface CharacterCardsResponse {
  success: boolean
  data?: CharacterCardRecord[]
  error?: string
}

export interface CharacterCardRefineResponse {
  success: boolean
  data?: {
    results: RefineGenerationResult[]
    improved: boolean
    newStabilityScore: number | null
  }
  error?: string
}

export interface ConsistencyScoreResponse {
  success: boolean
  data?: ConsistencyScoreResult
  error?: string
}

export interface CharacterCardGalleryResponse {
  success: boolean
  data?: {
    generations: GenerationRecord[]
    total: number | null
    hasMore: boolean
    nextCursor: string | null
  }
  error?: string
}

export interface StoryPanelRecord {
  id: string
  generationId: string | null
  orderIndex: number
  caption: string | null
  narration: string | null
  generation?: {
    id: string
    url: string
    prompt: string
    model: string
  } | null
}

export interface StoryRecord {
  id: string
  title: string
  displayMode: string
  isPublic: boolean
  createdAt: Date
  updatedAt: Date
  panels: StoryPanelRecord[]
}

export interface StoryListItem {
  id: string
  title: string
  displayMode: string
  isPublic: boolean
  panelCount: number
  coverImageUrl: string | null
  createdAt: Date
}

export interface CreateStoryResponse {
  success: boolean
  data?: StoryRecord
  error?: string
}

export interface StoryResponse {
  success: boolean
  data?: StoryRecord
  error?: string
}

export interface StoryListResponse {
  success: boolean
  data?: StoryListItem[]
  error?: string
}

export interface GenerateNarrativeResponse {
  success: boolean
  data?: { panels: Array<{ id: string; narration: string; caption: string }> }
  error?: string
}

// ─── Model Config (Admin) ───────────────────────────────────────

export const ModelConfigSchema = z.object({
  modelId: z.string().trim().min(1).max(100),
  externalModelId: z.string().trim().min(1).max(300),
  adapterType: z.string().trim().min(1).max(50),
  outputType: z.enum(['IMAGE', 'VIDEO', 'AUDIO', 'MODEL_3D']),
  cost: z.number().int().min(0).max(100),
  available: z.boolean(),
  officialUrl: z.string().url().optional().nullable(),
  timeoutMs: z.number().int().min(1000).max(600000).optional().nullable(),
  qualityTier: z.enum(['budget', 'standard', 'premium']).optional().nullable(),
  i2vModelId: z.string().max(300).optional().nullable(),
  videoDefaults: z.record(z.string(), z.unknown()).optional().nullable(),
  providerConfig: z.object({
    label: z.string(),
    baseUrl: z.string().url(),
  }),
  sortOrder: z.number().int().default(0),
})

export const CreateModelConfigSchema = ModelConfigSchema

export const UpdateModelConfigSchema = ModelConfigSchema.partial().omit({
  modelId: true,
})

export type ModelConfigInput = z.infer<typeof ModelConfigSchema>
export type UpdateModelConfigInput = z.infer<typeof UpdateModelConfigSchema>

export interface ModelConfigRecord {
  id: string
  modelId: string
  externalModelId: string
  adapterType: string
  outputType: OutputType
  cost: number
  available: boolean
  officialUrl: string | null
  timeoutMs: number | null
  qualityTier: string | null
  i2vModelId: string | null
  videoDefaults: Record<string, unknown> | null
  providerConfig: { label: string; baseUrl: string }
  sortOrder: number
  healthStatus: string | null
  lastHealthCheck: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface ModelConfigResponse {
  success: boolean
  data?: ModelConfigRecord
  error?: string
}

export interface ModelConfigListResponse {
  success: boolean
  data?: ModelConfigRecord[]
  error?: string
}

// ─── Model Health Check ─────────────────────────────────────────

export const ModelHealthStatusSchema = z.enum([
  'available',
  'unavailable',
  'degraded',
])
export type ModelHealthStatus = z.infer<typeof ModelHealthStatusSchema>

export interface ModelHealthRecord {
  modelId: string
  status: ModelHealthStatus
  lastChecked: Date
  latencyMs?: number
  error?: string
}

export interface ModelHealthResponse {
  success: boolean
  data?: ModelHealthRecord[]
  error?: string
}

export const ModelHealthRefreshSchema = z.object({
  modelId: z.string().trim().min(1).optional(),
})

// ─── Creator Profile ─────────────────────────────────────────────

export const UpdateProfileSchema = z.object({
  username: z
    .string()
    .trim()
    .min(PROFILE.USERNAME_MIN_LENGTH)
    .max(PROFILE.USERNAME_MAX_LENGTH)
    .regex(
      PROFILE.USERNAME_PATTERN,
      'Username must start with a letter and contain only letters, numbers, and hyphens',
    )
    .optional(),
  displayName: z
    .string()
    .trim()
    .max(PROFILE.DISPLAY_NAME_MAX_LENGTH)
    .nullable()
    .optional(),
  bio: z.string().trim().max(PROFILE.BIO_MAX_LENGTH).nullable().optional(),
  isPublic: z.boolean().optional(),
})

export type UpdateProfileRequest = z.infer<typeof UpdateProfileSchema>

export interface CreatorProfileRecord {
  username: string
  displayName: string | null
  avatarUrl: string | null
  bannerUrl: string | null
  bio: string | null
  isPublic: boolean
  createdAt: Date
  publicImageCount: number
  likeCount: number
  followerCount: number
  followingCount: number
}

export interface CreatorProfileWithImages extends CreatorProfileRecord {
  generations: (GenerationRecord & {
    likeCount: number
    isLiked: boolean
    isFeatured: boolean
    creator?: {
      username: string
      displayName: string | null
      avatarUrl: string | null
    }
  })[]
  total: number
  hasMore: boolean
  nextCursor: string | null
}

export interface CreatorProfileResponse {
  success: boolean
  data?: CreatorProfileWithImages
  error?: string
}

export interface UpdateProfileResponse {
  success: boolean
  data?: Pick<
    CreatorProfileRecord,
    'username' | 'displayName' | 'avatarUrl' | 'bio' | 'isPublic'
  >
  error?: string
  errorCode?: string
  i18nKey?: string
}

/** Viewer's relation to a profile — for Follow button state */
export interface ViewerRelation {
  isFollowing: boolean
  isOwnProfile: boolean
}

export interface CreatorProfilePageData extends CreatorProfileWithImages {
  viewerRelation: ViewerRelation
}

export interface CreatorProfilePageResponse {
  success: boolean
  data?: CreatorProfilePageData
  error?: string
}

// ─── Likes ───────────────────────────────────────────────────────

export const ToggleLikeSchema = z.object({
  generationId: z.string().trim().min(1, 'Generation ID is required'),
})

export type ToggleLikeRequest = z.infer<typeof ToggleLikeSchema>

export interface ToggleLikeResponse {
  success: boolean
  data?: { liked: boolean; likeCount: number }
  error?: string
}

// ─── Follows ─────────────────────────────────────────────────────

export const ToggleFollowSchema = z.object({
  targetUserId: z.string().trim().min(1, 'Target user ID is required'),
})

export type ToggleFollowRequest = z.infer<typeof ToggleFollowSchema>

export interface ToggleFollowResponse {
  success: boolean
  data?: { following: boolean; followerCount: number }
  error?: string
}

// ─── Profile Image Upload ───────────────────────────────────────

export const UploadProfileImageSchema = z.object({
  imageData: z.string().min(1, 'Image data is required'),
})

export type UploadProfileImageRequest = z.infer<typeof UploadProfileImageSchema>

export interface UploadProfileImageResponse {
  success: boolean
  data?: { url: string }
  error?: string
  errorCode?: string
  i18nKey?: string
}

// ─── Collections ────────────────────────────────────────────────

export const CreateCollectionSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  description: z.string().trim().max(500).optional(),
  isPublic: z.boolean().default(false),
})

export type CreateCollectionRequest = z.infer<typeof CreateCollectionSchema>

export const UpdateCollectionSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  isPublic: z.boolean().optional(),
})

export type UpdateCollectionRequest = z.infer<typeof UpdateCollectionSchema>

export const AddToCollectionSchema = z.object({
  generationIds: z.array(z.string().trim().min(1)).min(1).max(50),
})

export type AddToCollectionRequest = z.infer<typeof AddToCollectionSchema>

export interface CollectionRecord {
  id: string
  name: string
  description: string | null
  coverUrl: string | null
  isPublic: boolean
  itemCount: number
  createdAt: Date
  updatedAt: Date
}

export interface CollectionDetailRecord extends CollectionRecord {
  generations: GenerationRecord[]
  total: number
  hasMore: boolean
  /** Owner info — present in public context */
  owner?: {
    username: string
    displayName: string | null
    avatarUrl: string | null
  }
}

export interface CollectionsResponse {
  success: boolean
  data?: CollectionRecord[]
  error?: string
}

export interface CollectionResponse {
  success: boolean
  data?: CollectionRecord
  error?: string
}

export interface CollectionDetailResponse {
  success: boolean
  data?: CollectionDetailRecord
  error?: string
}

export interface CollectionItemsResponse {
  success: boolean
  data?: { added: number }
  error?: string
}

// ─── Composable Card System ─────────────────────────────────────

// ── Background Card ─────────────────────────────────────────────

export const BackgroundAttributesSchema = z.object({
  setting: z.string().optional(),
  lighting: z.string().optional(),
  timeOfDay: z.string().optional(),
  weather: z.string().optional(),
  architectureStyle: z.string().optional(),
  colorPalette: z.string().optional(),
  mood: z.string().optional(),
  perspective: z.string().optional(),
  depth: z.string().optional(),
  materialTexture: z.string().optional(),
  freeformDescription: z.string().optional(),
})

export type BackgroundAttributes = z.infer<typeof BackgroundAttributesSchema>

export const CreateBackgroundCardSchema = z.object({
  name: z.string().trim().min(1).max(BACKGROUND_CARD.NAME_MAX_LENGTH),
  description: z
    .string()
    .trim()
    .max(BACKGROUND_CARD.DESCRIPTION_MAX_LENGTH)
    .optional(),
  backgroundPrompt: z
    .string()
    .trim()
    .min(1)
    .max(BACKGROUND_CARD.PROMPT_MAX_LENGTH),
  sourceImageData: z.string().optional(),
  attributes: BackgroundAttributesSchema.optional(),
  tags: z
    .array(z.string().trim().max(BACKGROUND_CARD.TAG_MAX_LENGTH))
    .max(BACKGROUND_CARD.MAX_TAGS)
    .default([]),
  projectId: z.string().optional(),
})

export type CreateBackgroundCardRequest = z.infer<
  typeof CreateBackgroundCardSchema
>

export const UpdateBackgroundCardSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(BACKGROUND_CARD.NAME_MAX_LENGTH)
    .optional(),
  description: z
    .string()
    .trim()
    .max(BACKGROUND_CARD.DESCRIPTION_MAX_LENGTH)
    .nullable()
    .optional(),
  backgroundPrompt: z
    .string()
    .trim()
    .min(1)
    .max(BACKGROUND_CARD.PROMPT_MAX_LENGTH)
    .optional(),
  attributes: BackgroundAttributesSchema.optional(),
  loras: z.array(LoraSchema).max(5).nullable().optional(),
  tags: z
    .array(z.string().trim().max(BACKGROUND_CARD.TAG_MAX_LENGTH))
    .max(BACKGROUND_CARD.MAX_TAGS)
    .optional(),
  projectId: z.string().nullable().optional(),
})

export type UpdateBackgroundCardRequest = z.infer<
  typeof UpdateBackgroundCardSchema
>

export interface BackgroundCardRecord {
  id: string
  name: string
  description: string | null
  sourceImageUrl: string | null
  backgroundPrompt: string
  attributes: BackgroundAttributes | null
  loras: z.infer<typeof LoraSchema>[] | null
  tags: string[]
  projectId: string | null
  isDeleted: boolean
  createdAt: Date
  updatedAt: Date
}

export interface BackgroundCardResponse {
  success: boolean
  data?: BackgroundCardRecord
  error?: string
}

export interface BackgroundCardsResponse {
  success: boolean
  data?: BackgroundCardRecord[]
  error?: string
}

// ── Style Card ──────────────────────────────────────────────────

export const StyleAttributesSchema = z.object({
  artStyle: z.string().optional(),
  medium: z.string().optional(),
  colorPalette: z.string().optional(),
  brushwork: z.string().optional(),
  composition: z.string().optional(),
  mood: z.string().optional(),
  era: z.string().optional(),
  influences: z.string().optional(),
  detailLevel: z.string().optional(),
  lineWeight: z.string().optional(),
  contrast: z.string().optional(),
  freeformDescription: z.string().optional(),
})

export type StyleAttributes = z.infer<typeof StyleAttributesSchema>

export const CreateStyleCardSchema = z.object({
  name: z.string().trim().min(1).max(STYLE_CARD.NAME_MAX_LENGTH),
  description: z
    .string()
    .trim()
    .max(STYLE_CARD.DESCRIPTION_MAX_LENGTH)
    .optional(),
  stylePrompt: z.string().trim().min(1).max(STYLE_CARD.PROMPT_MAX_LENGTH),
  sourceImageData: z.string().optional(),
  attributes: StyleAttributesSchema.optional(),
  modelId: z.nativeEnum(AI_MODELS).optional(),
  adapterType: z.nativeEnum(AI_ADAPTER_TYPES).optional(),
  advancedParams: AdvancedParamsSchema.optional(),
  tags: z
    .array(z.string().trim().max(STYLE_CARD.TAG_MAX_LENGTH))
    .max(STYLE_CARD.MAX_TAGS)
    .default([]),
  projectId: z.string().optional(),
})

export type CreateStyleCardRequest = z.infer<typeof CreateStyleCardSchema>

export const UpdateStyleCardSchema = z.object({
  name: z.string().trim().min(1).max(STYLE_CARD.NAME_MAX_LENGTH).optional(),
  description: z
    .string()
    .trim()
    .max(STYLE_CARD.DESCRIPTION_MAX_LENGTH)
    .nullable()
    .optional(),
  stylePrompt: z
    .string()
    .trim()
    .min(1)
    .max(STYLE_CARD.PROMPT_MAX_LENGTH)
    .optional(),
  attributes: StyleAttributesSchema.optional(),
  loras: z.array(LoraSchema).max(5).nullable().optional(),
  modelId: z.nativeEnum(AI_MODELS).nullable().optional(),
  adapterType: z.nativeEnum(AI_ADAPTER_TYPES).nullable().optional(),
  advancedParams: AdvancedParamsSchema.nullable().optional(),
  tags: z
    .array(z.string().trim().max(STYLE_CARD.TAG_MAX_LENGTH))
    .max(STYLE_CARD.MAX_TAGS)
    .optional(),
  projectId: z.string().nullable().optional(),
})

export type UpdateStyleCardRequest = z.infer<typeof UpdateStyleCardSchema>

export interface StyleCardRecord {
  id: string
  name: string
  description: string | null
  sourceImageUrl: string | null
  stylePrompt: string
  attributes: StyleAttributes | null
  loras: z.infer<typeof LoraSchema>[] | null
  modelId: string | null
  adapterType: string | null
  advancedParams: AdvancedParams | null
  tags: string[]
  projectId: string | null
  isDeleted: boolean
  createdAt: Date
  updatedAt: Date
}

export interface StyleCardResponse {
  success: boolean
  data?: StyleCardRecord
  error?: string
}

export interface StyleCardsResponse {
  success: boolean
  data?: StyleCardRecord[]
  error?: string
}

// ── Card Recipe ─────────────────────────────────────────────────

export const CreateCardRecipeSchema = z.object({
  name: z.string().trim().min(1).max(CARD_RECIPE.NAME_MAX_LENGTH),
  characterCardId: z.string().optional(),
  backgroundCardId: z.string().optional(),
  styleCardId: z.string().optional(),
  freePrompt: z
    .string()
    .trim()
    .max(CARD_RECIPE.FREE_PROMPT_MAX_LENGTH)
    .optional(),
  projectId: z.string().optional(),
})

export type CreateCardRecipeRequest = z.infer<typeof CreateCardRecipeSchema>

export const UpdateCardRecipeSchema = z.object({
  name: z.string().trim().min(1).max(CARD_RECIPE.NAME_MAX_LENGTH).optional(),
  characterCardId: z.string().nullable().optional(),
  backgroundCardId: z.string().nullable().optional(),
  styleCardId: z.string().nullable().optional(),
  freePrompt: z
    .string()
    .trim()
    .max(CARD_RECIPE.FREE_PROMPT_MAX_LENGTH)
    .nullable()
    .optional(),
  projectId: z.string().nullable().optional(),
})

export type UpdateCardRecipeRequest = z.infer<typeof UpdateCardRecipeSchema>

export const RecipeSnapshotSchema = z.object({
  characterCard: z
    .object({
      id: z.string(),
      name: z.string(),
      characterPrompt: z.string(),
    })
    .optional(),
  backgroundCard: z
    .object({
      id: z.string(),
      name: z.string(),
      backgroundPrompt: z.string(),
    })
    .optional(),
  styleCard: z
    .object({
      id: z.string(),
      name: z.string(),
      stylePrompt: z.string(),
      modelId: z.string().optional(),
      adapterType: z.string().optional(),
    })
    .optional(),
  freePrompt: z.string().optional(),
  compiledPrompt: z.string(),
  compiledAt: z.string().datetime(),
})

export type RecipeSnapshot = z.infer<typeof RecipeSnapshotSchema>

export interface CardRecipeRecord {
  id: string
  name: string
  characterCardId: string | null
  backgroundCardId: string | null
  styleCardId: string | null
  freePrompt: string | null
  projectId: string | null
  isDeleted: boolean
  createdAt: Date
  updatedAt: Date
}

export interface CardRecipeDetailRecord extends CardRecipeRecord {
  characterCard: { id: string; name: string } | null
  backgroundCard: { id: string; name: string } | null
  styleCard: { id: string; name: string } | null
}

export interface CardRecipeResponse {
  success: boolean
  data?: CardRecipeDetailRecord
  error?: string
}

export interface CardRecipesResponse {
  success: boolean
  data?: CardRecipeDetailRecord[]
  error?: string
}

export interface CompileRecipeResponse {
  success: boolean
  data?: {
    compiledPrompt: string
    modelId: string
    adapterType: string
    advancedParams: AdvancedParams | null
    referenceImages: string[]
    snapshot: RecipeSnapshot
  }
  error?: string
}

// ── Civitai Token ────────────────────────────────────────────────

export const CivitaiTokenSchema = z.object({
  token: z.string().trim().min(1).max(200),
})

export type CivitaiTokenRequest = z.infer<typeof CivitaiTokenSchema>

export interface CivitaiTokenStatusResponse {
  success: boolean
  data?: { hasToken: boolean }
  error?: string
}

// ── Studio V2 Generate ──────────────────────────────────────────

export const StudioGenerateSchema = z
  .object({
    /** Quick mode: direct model selection */
    modelId: z.string().trim().min(1).max(160).optional(),
    /** Quick mode: specific API key for saved route */
    apiKeyId: z.string().trim().min(1).optional(),
    /** Card mode: card IDs */
    characterCardId: z.string().optional(),
    backgroundCardId: z.string().optional(),
    styleCardId: z.string().optional(),
    freePrompt: z
      .string()
      .trim()
      .max(CARD_RECIPE.FREE_PROMPT_MAX_LENGTH)
      .optional(),
    aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']).default('1:1'),
    projectId: z.string().optional(),
    /** User-uploaded reference images (base64 or URL) from toolbar */
    referenceImages: z.array(z.string()).optional(),
    /** Advanced params override from toolbar Advanced Settings panel */
    advancedParams: z.record(z.string(), z.unknown()).optional(),
    /** B5: Seed override for variant generation */
    seed: z.number().int().min(0).max(4294967295).optional(),
    /** B5: Run group ID for variant/compare batches */
    runGroupId: z.string().optional(),
    /** B5: Run group type */
    runGroupType: z.enum(['single', 'compare', 'variant']).optional(),
    /** B5: Position within run group (0-based) */
    runGroupIndex: z.number().int().min(0).optional(),
    /** Prompt template usage metadata for generation lineage */
    recipeUsage: RecipeUsageSchema.optional(),
  })
  .refine((data) => !!(data.modelId || data.styleCardId), {
    message: 'Either modelId or styleCardId is required',
  })
  .refine((data) => !(data.modelId && data.styleCardId), {
    message: 'Cannot specify both modelId and styleCardId',
    path: ['modelId'],
  })

export type StudioGenerateRequest = z.infer<typeof StudioGenerateSchema>

// ── B5: Select Variant Winner ───────────────────────────────────

export const SelectVariantWinnerSchema = z.object({
  runGroupId: z.string().min(1),
  generationId: z.string().min(1),
})

export type SelectVariantWinnerRequest = z.infer<
  typeof SelectVariantWinnerSchema
>

// ─── LoRA Training ────────────────────────────────────────────────

/**
 * Typed error codes the LoRA training service throws so the UI can render
 * a friendly message via i18n instead of leaking provider strings (e.g. a
 * raw fal.ai 429 or a Replicate "PEFT weight mismatch"). The API route
 * marshals these into `{code, fieldKey, messageKey}` response bodies; the
 * `useLoraTraining` hook reads `messageKey` and runs it through `t(...)`.
 *
 * Order matters for switch-coverage exhaustiveness — keep this enum and
 * the service-side mapper in `lora-training.service.ts` in sync.
 */
export const LORA_TRAINING_SUBMIT_ERROR_CODES = [
  'INSUFFICIENT_CREDITS',
  'IMAGE_TOO_LARGE',
  'BASE_MODEL_UNSUPPORTED',
  'NAMING_CONFLICT',
  'UPSTREAM_TIMEOUT',
  'RATE_LIMIT',
  'QUOTA_EXCEEDED',
  'API_KEY_INVALID',
  'INTERNAL',
] as const

export const LoraTrainingSubmitErrorCodeSchema = z.enum(
  LORA_TRAINING_SUBMIT_ERROR_CODES,
)
export type LoraTrainingSubmitErrorCode = z.infer<
  typeof LoraTrainingSubmitErrorCodeSchema
>

/**
 * Wire shape the API route returns when training submission fails. The
 * route always writes `{success: false, error, code, messageKey}` so the
 * client-side `submitLoraTrainingAPI` wrapper can stay generic — UI reads
 * `messageKey` and runs it through `t('LoraTraining.<key>')`. `fieldKey`
 * is optional so the form can highlight the offending input (e.g. the
 * "name" field for NAMING_CONFLICT).
 */
export const LoraTrainingErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  code: LoraTrainingSubmitErrorCodeSchema,
  messageKey: z.string(),
  fieldKey: z.string().optional(),
})
export type LoraTrainingErrorResponse = z.infer<
  typeof LoraTrainingErrorResponseSchema
>

export const SubmitLoraTrainingSchema = z.object({
  name: z.string().trim().min(1).max(100),
  triggerWord: z.string().trim().min(1).max(50),
  loraType: z.enum(['subject', 'style']).default('subject'),
  trainingImages: z.array(z.string()).min(5).max(50),
  characterCardId: z.string().uuid().optional(),
  apiKeyId: z.string().uuid(),
  provider: z.enum(['replicate', 'fal']).default('replicate'),
  // User-selected base model. Only 'flux-1-d' has a wired-up trainer today;
  // 'sdxl-1.0' / 'illustrious' are accepted by the schema for UI completeness
  // but the service rejects them until a real trainer endpoint lands.
  baseModel: z
    .enum(['flux-1-d', 'sdxl-1.0', 'illustrious'])
    .default('flux-1-d'),
})
export type SubmitLoraTrainingRequest = z.infer<typeof SubmitLoraTrainingSchema>

export interface LoraTrainingRecord {
  id: string
  name: string
  triggerWord: string
  loraType: string
  status: string
  progress: number
  loraUrl: string | null
  errorMessage: string | null
  characterCardId: string | null
  createdAt: Date
  completedAt: Date | null
  /**
   * Style code of the auto-created LoraAsset for COMPLETED jobs. Used by
   * the post-train "去使用" deeplink — `/studio/image?style=<code>` reuses
   * the existing LoraStackProvider URL-resolver to auto-activate the
   * trained LoRA on the canvas. Null until the COMPLETED transition
   * runs (or for non-COMPLETED statuses).
   */
  loraStyleCode: string | null
}

export interface LoraTrainingResponse {
  success: boolean
  data?: LoraTrainingRecord
  error?: string
}

export interface LoraTrainingListResponse {
  success: boolean
  data?: LoraTrainingRecord[]
  error?: string
}

// ─── LoRA Assets ──────────────────────────────────────────────────

export const LoraAssetSourceSchema = z.enum(['curated', 'trained', 'imported'])
export type LoraAssetSource = z.infer<typeof LoraAssetSourceSchema>

export const LoraAssetTypeSchema = z.enum(['subject', 'style'])
export type LoraAssetType = z.infer<typeof LoraAssetTypeSchema>

export const LoraAssetBaseFamilySchema = z.string().trim().min(1)
export type LoraAssetBaseFamily = z.infer<typeof LoraAssetBaseFamilySchema>

export const LoraAssetRecordSchema = z.object({
  id: z.string(),
  styleCode: z.string(),
  name: z.string(),
  source: LoraAssetSourceSchema,
  type: LoraAssetTypeSchema,
  baseModelFamily: LoraAssetBaseFamilySchema,
  provider: z.string(),
  triggerWord: z.string(),
  loraUrl: z.string().url(),
  coverImageUrl: z.string().url().nullable(),
  previewImageUrls: z.array(z.string().url()),
  defaultScale: z.number(),
  isPublic: z.boolean(),
  isOwn: z.boolean(),
  createdAt: z.string(),
  // Optional fields populated by the Civitai listing extractor — see
  // `CivitaiLoraLibraryItemSchema` for the strict shape. Kept optional on
  // the base record so trained / favorited / own LoRAs (which don't carry
  // these fields) still validate. Downstream consumers should treat
  // `undefined` and `null` as "no author-supplied prompt available".
  recommendedPrompt: z.string().nullable().optional(),
  recommendedPromptAlternates: z
    .array(z.object({ label: z.string(), prompt: z.string() }))
    .optional(),
  // Civitai-only identifiers needed by the Phase-2 user-generation prompt
  // miner. Optional here so the active-lora stack can store mixed source
  // types (trained / favorited / Civitai-imported) without forcing every
  // record to carry them; `useCivitaiMinedPrompts` no-ops on null.
  modelId: z.number().int().positive().optional(),
  modelVersionId: z.number().int().positive().optional(),
  fileHashAutoV3: z.string().nullable().optional(),
})

export type LoraAssetRecord = z.infer<typeof LoraAssetRecordSchema>

export const FAVORITE_LORA_TRIGGER_WORD_MAX_LENGTH = 4000

export const FavoriteLoraRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  // Civitai 上很多 LoRA 把整段推荐 prompt 当作 trigger word。数据库列是
  // 无长度的 text，所以收藏外部 LoRA 允许更长的触发词；用户自训练
  // trigger 仍由 LoraTrainingPayloadSchema 维持短词限制。
  triggerWord: z
    .string()
    .trim()
    .min(1)
    .max(FAVORITE_LORA_TRIGGER_WORD_MAX_LENGTH),
  loraUrl: z.string().url(),
  type: LoraAssetTypeSchema,
  baseModelFamily: LoraAssetBaseFamilySchema,
  provider: z.string().trim().min(1).max(40),
  coverImageUrl: z.string().url().nullable().optional(),
})
export type FavoriteLoraRequest = z.infer<typeof FavoriteLoraRequestSchema>

export const ActiveLoraSchema = z.object({
  assetId: z.string(),
  styleCode: z.string(),
  scale: z.number(),
})

export type ActiveLora = z.infer<typeof ActiveLoraSchema>

export const CivitaiLoraLibraryItemSchema = LoraAssetRecordSchema.extend({
  modelId: z.number(),
  modelVersionId: z.number(),
  versionName: z.string(),
  creatorName: z.string().nullable(),
  creatorAvatarUrl: z.string().url().nullable(),
  modelPageUrl: z.string().url(),
  tags: z.array(z.string()),
  downloadCount: z.number(),
  thumbsUpCount: z.number(),
  // Civitai 的作者声明：哪些商用场景被允许。常见值：'Image'（卖生成图）、
  // 'RentCivit'（仅 Civitai 平台租 GPU）、'Rent'（任意第三方推理服务）、
  // 'Sell'（出售模型本身）。我们在 UI 上用这个字段做 license 徽章 + 过滤。
  allowCommercialUse: z.array(z.string()),
  allowDerivatives: z.boolean(),
  // 列表 row 用的 96px 缩略图（base `coverImageUrl` 已经在 service 层 rewrite
  // 成 640px inspector 尺寸，再缩到 40×40 仍是巨大浪费）。
  thumbImageUrl: z.string().url().nullable(),
  // 「点击放大查看」对话框用的全分辨率原图。base `coverImageUrl` rewrite 后
  // 已经是 640px，放大时需要回退到原图。
  coverImageUrlOriginal: z.string().url().nullable(),
  // 同一个 LoRA 可能有多个 outfit/variant 触发词（例如 Cure Mystique 10 个
  // 造型）。`triggerWord` 是主推荐，`triggerAlternates` 是其他候选 — 空数组
  // 意味着只有一个触发词。
  triggerAlternates: z.array(z.string()),
  // Civitai 作者声明的「整段推荐 prompt」（trainedWords[0] 清洗后，或
  // description 中第一个 `<pre><code>` outfit prompt）。null 意味着作者
  // 既没写 trainedWords 也没写 description code block，UI 应回退到内部
  // 模板。
  recommendedPrompt: z.string().nullable(),
  // 多 outfit / variant LoRA 的其余 prompt 候选（来自 description 的第 2+
  // 个 code block）。`recommendedPrompt` 已经包含第一个，这里只有后续的。
  // 空数组表示没有变体。UI 应展示 chip / tab 切换让用户选择。
  recommendedPromptAlternates: z.array(
    z.object({
      label: z.string(),
      prompt: z.string(),
    }),
  ),
  // 'official' = trigger 来自 Civitai 作者；'inferred' = 我们从模型名推断的，
  // UI 应展示「推断」徽章提示用户可能不准确。
  triggerSource: z.enum(['official', 'inferred']),
  // 主 LoRA 权重文件的 Civitai AutoV3 hash（lower-case，无前缀）。客户端
  // 用它调 `/api/lora-assets/civitai/mined-prompts` 端点，从作者/社区生成
  // 图的 prompt 里反推真实激活段。null 表示该版本没有 primary file 或上
  // 游没返回 AutoV3 hash — enrichment 端点会跳过。
  fileHashAutoV3: z.string().nullable(),
})

// 用户生成图反推的「实测激活 prompt」单条记录。多张图汇总去重后产生。
export const CivitaiMinedPromptSchema = z.object({
  // outfit / variant label。多个高频段时按 `'Outfit 1'` / `'Outfit 2'` 给序号。
  label: z.string(),
  // 完整激活段（comma-separated tokens），可直接复制到 prompt。
  prompt: z.string(),
  // 该 prompt 段在采样图里出现的次数 — 用于 UI 「N 张图用了这个」hint。
  sampleCount: z.number().int().positive(),
})
export type CivitaiMinedPrompt = z.infer<typeof CivitaiMinedPromptSchema>

export const CivitaiMinedPromptsResultSchema = z.object({
  outfits: z.array(CivitaiMinedPromptSchema),
  // 实际采样的图片数（用于 UI footer「采样自 N 张作者实测图」）。
  totalSampled: z.number().int().nonnegative(),
})
export type CivitaiMinedPromptsResult = z.infer<
  typeof CivitaiMinedPromptsResultSchema
>

export type CivitaiLoraLibraryItem = z.infer<
  typeof CivitaiLoraLibraryItemSchema
>

export const CivitaiLoraLibraryResultSchema = z.object({
  items: z.array(CivitaiLoraLibraryItemSchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().nonnegative().nullable(),
  hasNextPage: z.boolean(),
  nextCursor: z.string().nullable(),
})

export type CivitaiLoraLibraryResult = z.infer<
  typeof CivitaiLoraLibraryResultSchema
>

/**
 * Server response for `GET /api/generations/[id]/replay` — the focused
 * "Use this image's LoRAs" payload. Designed to grow: today it carries
 * style codes the viewer can replay; tomorrow it can add prompt/seed
 * fields for the full "Use everything" tier without renaming the route.
 *
 * `hasHiddenLoras` is true when the source snapshot referenced LoRAs
 * the viewer can't see (private / deleted / never tracked as a
 * LoraAsset) so the UI can show a "some styles are hidden" hint
 * without leaking what they were.
 */
export const ReplayPayloadSchema = z.object({
  generationId: z.string(),
  styleCodes: z.array(z.string()),
  hasHiddenLoras: z.boolean(),
  // Phase 1C: full reproducibility — return the prompt + seed + negative
  // prompt + aspect ratio so the viewer can click "Use this image" and
  // land in Studio with the exact same setup that produced the image,
  // not just the LoRAs. `null` means the snapshot didn't carry that
  // field (older generations / unusual code paths).
  prompt: z.string().nullable(),
  seed: z.number().int().nullable(),
  negativePrompt: z.string().nullable(),
  aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']).nullable(),
})

export type ReplayPayload = z.infer<typeof ReplayPayloadSchema>

// ─── Extracted Element (reusable cutout asset) ───────────────────

/**
 * A previously-extracted element saved to the user's asset library. Produced
 * by /studio/edit/extract-element and consumed by the Studio reference-image
 * picker so the same cutout can be reused across generations without rerunning
 * the (slow, paid) extract step. The full record is what /api/extracted-elements
 * returns; the request shape that persists a new one is ExtractedElementCreateRequestSchema.
 */
export const ExtractedElementRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  prompt: z.string(),
  invert: z.boolean(),
  provider: z.enum(['fal', 'gemini', 'openai']),
  modelId: z.string(),
  sourceGenerationId: z.string().nullable(),
  sourceImageUrl: z.string().url(),
  extractedUrl: z.string().url(),
  thumbnailUrl: z.string().url().nullable(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  createdAt: z.string(),
})

export type ExtractedElementRecord = z.infer<
  typeof ExtractedElementRecordSchema
>

/**
 * POST body for /api/extracted-elements — what the "Save to assets" button on
 * the extract result panel sends. `extractedImageUrl` is the in-memory data
 * URL or R2 URL of the cutout the user just produced; the server re-hosts it
 * to R2 under the user's namespace and creates the record. Optional `name`
 * overrides the default (the prompt) for a friendlier label.
 */
export const ExtractedElementCreateRequestSchema = z.object({
  extractedImageUrl: z
    .string()
    .min(1)
    .max(10 * 1024 * 1024),
  sourceImageUrl: z.string().url(),
  sourceGenerationId: z.string().trim().min(1).optional(),
  prompt: z.string().trim().min(1).max(200),
  invert: z.boolean().optional(),
  modelId: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(120).optional(),
})

export type ExtractedElementCreateRequest = z.infer<
  typeof ExtractedElementCreateRequestSchema
>

// ─── Video Script (VS1-VS11) ─────────────────────────────────────
export * from './video-script'

// ─── Creative Control: Intent + Reference Asset ───────────────────

/**
 * A reference image and its intended creative role.
 * Used in ImageIntent to tell the model how to use the reference.
 */
export const ReferenceAssetSchema = z.object({
  /** HTTPS URL of the reference image */
  url: z.string().url(),
  /**
   * How the model should interpret this reference:
   * - identity: subject/character likeness
   * - pose: body pose / keypoints
   * - style: visual style / artistic look
   * - composition: scene layout / framing
   * - background: background / setting
   * - product: product placement / object
   * - first_frame: first frame of a video clip
   * - last_frame: last frame of a video clip
   */
  role: z.enum([
    'identity',
    'pose',
    'style',
    'composition',
    'background',
    'product',
    'first_frame',
    'last_frame',
  ]),
  /** Influence weight (0.0-1.0, provider-dependent) */
  weight: z.number().min(0).max(1).optional(),
  /** Human-readable notes passed to prompt compiler */
  notes: z.string().max(200).optional(),
})

export type ReferenceAsset = z.infer<typeof ReferenceAssetSchema>

/**
 * Structured user intent for image generation.
 * The output of intent-parser.service and the input to prompt-compiler.service.
 * All fields except `subject` are optional.
 */
export const ImageIntentSchema = z.object({
  /** Primary subject (person, object, place) */
  subject: z.string().min(1).max(500),
  /** Additional subject details (appearance, clothing, identity) */
  subjectDetails: z.string().max(500).optional(),
  /** What the subject is doing or how they are posed */
  actionOrPose: z.string().max(300).optional(),
  /** Scene / environment description */
  scene: z.string().max(500).optional(),
  /** Framing / composition (for example, close-up or wide shot) */
  composition: z.string().max(300).optional(),
  /** Camera and lens details */
  camera: z.string().max(300).optional(),
  /** Lighting setup */
  lighting: z.string().max(300).optional(),
  /** Color palette / grading notes */
  colorPalette: z.string().max(300).optional(),
  /** Visual style category */
  style: z.string().max(300).optional(),
  /** Emotional tone / atmosphere */
  mood: z.string().max(300).optional(),
  /** Elements that must appear in the result */
  mustInclude: z.array(z.string().max(100)).max(10).optional(),
  /** Elements that must not appear in the result */
  mustAvoid: z.array(z.string().max(100)).max(10).optional(),
  /** Reference images with their creative roles */
  referenceAssets: z.array(ReferenceAssetSchema).max(5).optional(),
})

export type ImageIntent = z.infer<typeof ImageIntentSchema>

export const ModelRouterPreferencesSchema = z.object({
  preferLowCost: z.boolean().optional(),
  preferLowLatency: z.boolean().optional(),
  requireHealthy: z.boolean().optional(),
})

export type ModelRouterPreferences = z.infer<
  typeof ModelRouterPreferencesSchema
>

export const GenerationPlanResponseSchema = z.object({
  intent: ImageIntentSchema,
  recommendedModels: z.array(
    z.object({
      modelId: z.string(),
      score: z.number(),
      reason: z.string(),
      matchedBestFor: z.array(z.string()),
    }),
  ),
  promptDraft: z.string(),
  negativePrompt: z.string().optional(),
  negativePromptDraft: z.string().optional(),
  estimatedCost: z.number().min(0),
  variationCount: z.number().int().min(1).max(8),
})

export type GenerationPlanResponse = z.infer<
  typeof GenerationPlanResponseSchema
>

export const GenerationPlanRequestSchema = z.object({
  /** Natural language description of what the user wants to generate */
  naturalLanguage: z.string().trim().min(1).max(2000),
  /** Optional reference images with roles */
  referenceAssets: z.array(ReferenceAssetSchema).max(5).optional(),
  /** Optional routing preferences */
  preferences: ModelRouterPreferencesSchema.optional(),
})

export type GenerationPlanRequest = z.infer<typeof GenerationPlanRequestSchema>

export const GenerationCompileRequestSchema = z.object({
  intent: ImageIntentSchema,
  modelId: z.string().trim().min(1).max(160),
})

export type GenerationCompileRequest = z.infer<
  typeof GenerationCompileRequestSchema
>

export const GenerationCompileResponseSchema = z.object({
  compiledPrompt: z.string(),
  negativePrompt: z.string().optional(),
})

export type GenerationCompileResponse = z.infer<
  typeof GenerationCompileResponseSchema
>

// ─── Creative Control: Generation Evaluation ──────────────────────

/**
 * LLM vision evaluation of a generated image against its prompt.
 * Scores are 0-10. Stored in Generation.evaluation as JSON.
 */
export const GenerationEvaluationSchema = z.object({
  /** How well the main subject matches the prompt description */
  subjectMatch: z.number().min(0).max(10),
  /** How well the visual style matches the prompt */
  styleMatch: z.number().min(0).max(10),
  /** How well the composition / framing matches the prompt */
  compositionMatch: z.number().min(0).max(10),
  /** Reference image consistency, present only when referenceAssets were used */
  referenceConsistency: z.number().min(0).max(10).optional(),
  /** Image quality: 10 = pristine, 0 = severe artifacts */
  artifactScore: z.number().min(0).max(10),
  /** Overall prompt adherence */
  promptAdherence: z.number().min(0).max(10),
  /** Weighted overall quality score */
  overall: z.number().min(0).max(10),
  /** Specific visual issues detected */
  detectedIssues: z.array(z.string().max(200)).max(10),
  /** Actionable prompt improvements */
  suggestedFixes: z.array(z.string().max(200)).max(10),
})

export type GenerationEvaluation = z.infer<typeof GenerationEvaluationSchema>

export const GenerateEvaluationRequestSchema = z.object({
  /** The ID of the generation to evaluate */
  generationId: z.string().min(1),
})

export type GenerateEvaluationRequest = z.infer<
  typeof GenerateEvaluationRequestSchema
>

// ─── Creative Control: Recipe Persistence ────────────────────────

export const CreateRecipeRequestSchema = z.object({
  /** Display name for the recipe */
  name: z.string().max(200).default(''),
  /** Media type this recipe produces */
  outputType: z.enum(['IMAGE', 'VIDEO', 'AUDIO', 'MODEL_3D']).default('IMAGE'),
  /** Structured intent parsed from the user's natural language */
  userIntent: ImageIntentSchema.optional(),
  /** Compiled, model-ready prompt string */
  compiledPrompt: z.string().min(1).max(5000),
  /** Negative prompt (optional) */
  negativePrompt: z.string().max(1000).optional(),
  /** AI model ID (AI_MODELS enum value) */
  modelId: z.string().min(1),
  /** Provider adapter identifier */
  provider: z.string().trim().min(1).max(100),
  /** Advanced generation parameters (guidance, steps, loras, etc.) */
  params: z.record(z.string(), z.unknown()).optional(),
  /** Reference images with roles */
  referenceAssets: z.array(ReferenceAssetSchema).max(5).optional(),
  /** Generation seed for reproducibility */
  seed: z.coerce.bigint().optional(),
  /** ID of the Generation this recipe was saved from */
  parentGenerationId: z.string().optional(),
})

export type CreateRecipeRequest = z.infer<typeof CreateRecipeRequestSchema>

export const CreateRecipeFromGenerationSchema = z.object({
  generationId: z.string().trim().min(1),
  name: z.string().trim().max(200).optional(),
})

export type CreateRecipeFromGenerationRequest = z.infer<
  typeof CreateRecipeFromGenerationSchema
>

export const ListRecipesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
})

export type ListRecipesQuery = z.infer<typeof ListRecipesQuerySchema>

/** Wire-format recipe record returned from the API (dates are ISO strings) */
export type RecipeRecord = {
  id: string
  userId: string
  outputType: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'MODEL_3D'
  name: string
  userIntent?: unknown
  compiledPrompt: string
  negativePrompt: string | null
  modelId: string
  provider: string
  params?: unknown
  referenceAssets?: unknown
  seed?: string | number | bigint | null
  parentGenerationId: string | null
  version: number
  evaluationSummary?: unknown
  isDeleted: boolean
  createdAt: string
  updatedAt: string
}

// ─── Inspiration Library (public curated prompts) ─────────────────

export const INSPIRATION_SORT_BY = ['rank', 'likes', 'views', 'recent'] as const
export type InspirationSortBy = (typeof INSPIRATION_SORT_BY)[number]

export const ListInspirationsQuerySchema = z.object({
  category: z.string().trim().max(80).optional(),
  query: z.string().trim().max(200).optional(),
  sortBy: z.enum(INSPIRATION_SORT_BY).default('rank'),
  limit: z.coerce.number().int().positive().max(60).default(24),
  offset: z.coerce.number().int().nonnegative().default(0),
})

export type ListInspirationsQuery = z.infer<typeof ListInspirationsQuerySchema>

export const CloneInspirationRequestSchema = z.object({
  modelId: z.string().trim().min(1).max(100).optional(),
  provider: z.string().trim().min(1).max(100).optional(),
  outputType: z.enum(['IMAGE', 'VIDEO', 'AUDIO', 'MODEL_3D']).optional(),
})

export type CloneInspirationRequest = z.infer<
  typeof CloneInspirationRequestSchema
>

/** Wire-format inspiration record returned from the API (dates ISO strings) */
export type InspirationRecord = {
  id: string
  source: string
  rank: number
  prompt: string
  author: string
  authorName: string
  likes: number
  views: number
  imageUrl: string
  modelHint: string | null
  categories: string[]
  sourceUrl: string
  rating: number | null
  score: number | null
  publishedAt: string | null
  isPublic: boolean
  createdAt: string
  updatedAt: string
}

export type ListInspirationsResponse = {
  inspirations: InspirationRecord[]
  total: number
}

// ─── Voice Card Persistence ──────────────────────────────────────

const VoiceCardRequestShape = {
  name: z.string().trim().min(1).max(100),
  provider: z.enum(VOICE_CARD_PROVIDERS),
  modelId: z.string().optional(),
  voiceId: z.string().trim().min(1).max(200).optional(),
  referenceAudioUrl: z.string().url().optional(),
  gender: z.enum(VOICE_CARD_GENDERS).optional(),
  age: z.enum(VOICE_CARD_AGES).optional(),
  tone: z.array(z.string().trim().min(1).max(50)),
  pace: z.enum(VOICE_CARD_PACES),
  pitch: z.enum(VOICE_CARD_PITCHES).optional(),
  pronunciationDictionary: z.record(z.string(), z.string()),
  sampleText: z.string().max(500).optional(),
}

export const CreateVoiceCardRequestSchema = z.object({
  ...VoiceCardRequestShape,
  provider: VoiceCardRequestShape.provider.default(VOICE_CARD_DEFAULT_PROVIDER),
  tone: VoiceCardRequestShape.tone.default([]),
  pace: VoiceCardRequestShape.pace.default(VOICE_CARD_DEFAULT_PACE),
  pronunciationDictionary:
    VoiceCardRequestShape.pronunciationDictionary.default({}),
})

export type CreateVoiceCardRequest = z.infer<
  typeof CreateVoiceCardRequestSchema
>

export const UpdateVoiceCardRequestSchema = z
  .object(VoiceCardRequestShape)
  .partial()

export type UpdateVoiceCardRequest = z.infer<
  typeof UpdateVoiceCardRequestSchema
>

export const ListVoiceCardsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
})

export type ListVoiceCardsQuery = z.infer<typeof ListVoiceCardsQuerySchema>

export type VoiceCardRecord = {
  id: string
  userId: string
  name: string
  provider: (typeof VOICE_CARD_PROVIDERS)[number]
  modelId: string | null
  voiceId: string | null
  referenceAudioUrl: string | null
  referenceAudioStorageKey: string | null
  gender: (typeof VOICE_CARD_GENDERS)[number] | null
  age: (typeof VOICE_CARD_AGES)[number] | null
  tone: string[]
  pace: (typeof VOICE_CARD_PACES)[number]
  pitch: (typeof VOICE_CARD_PITCHES)[number] | null
  pronunciationDictionary: Record<string, string>
  sampleText: string | null
  isDeleted: boolean
  createdAt: string
  updatedAt: string
}
