import { z } from 'zod'

import { PROFILE, PROMPT_ENHANCE, VIDEO_GENERATION } from '@/constants/config'
import { CHARACTER_CARD } from '@/constants/character-card'
import {
  BACKGROUND_CARD,
  STYLE_CARD,
  CARD_RECIPE,
} from '@/constants/card-types'
import { API_KEY_ADAPTER_OPTIONS } from '@/constants/api-keys'
import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES, type ProviderConfig } from '@/constants/providers'
import { VIDEO_RESOLUTIONS } from '@/constants/video-options'

// Re-export ModelOption from constants for convenience
export type { ModelOption } from '@/constants/models'

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
})

export type GenerationSnapshot = z.infer<typeof GenerationSnapshotSchema>

// ─── ActiveRun State Model (B0) ──────────────────────────────────

export type RunItemStatus = 'pending' | 'generating' | 'completed' | 'failed'
export type RunGroupMode = 'single' | 'compare' | 'variant'

export interface RunItem {
  id: string
  modelId: string
  status: RunItemStatus
  generation: GenerationRecord | null
  error: string | null
}

export interface ActiveRun {
  id: string
  mode: RunGroupMode
  items: RunItem[]
  selectedItemId: string | null
  prompt: string
  startedAt: number
}

// ─── Generate Request ─────────────────────────────────────────────

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

/** Unified generation config schema covering both image and video modes */
export const GenerationConfigSchema = z.object({
  outputType: z.enum(['image', 'video']),
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
  duration: z
    .number()
    .min(1)
    .max(VIDEO_GENERATION.MAX_DURATION)
    .default(VIDEO_GENERATION.DEFAULT_DURATION),
  referenceImage: z.string().optional(),
  negativePrompt: z.string().trim().max(2000).optional(),
  resolution: z.enum(VIDEO_RESOLUTIONS).optional(),
  apiKeyId: z.string().trim().min(1).optional(),
  characterCardIds: z.array(z.string().trim().min(1)).max(5).optional(),
})

export type GenerateVideoRequest = z.infer<typeof GenerateVideoRequestSchema>

export type GenerateVideoResponse = GenerateResponse

// ─── Image Edit ──────────────────────────────────────────────────
// Moved from /api/image/edit/route.ts to centralize all schemas

export const ImageEditSchema = z.object({
  action: z.enum(['upscale', 'remove-background']),
  imageUrl: z.string().url(),
  /** When true, persist the edited result to R2 and create a Generation record */
  persist: z.boolean().optional(),
  /** Source generation ID (required when persist is true) */
  generationId: z.string().optional(),
})

export type ImageEditRequest = z.infer<typeof ImageEditSchema>

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

export const VideoJobStatusSchema = z.enum([
  'IN_QUEUE',
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED',
])
export type VideoJobStatus = z.infer<typeof VideoJobStatusSchema>

export const VideoStatusRequestSchema = z.object({
  jobId: z.string().trim().min(1, 'Job ID is required'),
})

export interface VideoSubmitResponseData {
  jobId: string
  requestId: string
}

export interface VideoSubmitResponse {
  success: boolean
  data?: VideoSubmitResponseData
  error?: string
}

export interface VideoStatusResponseData {
  jobId: string
  status: VideoJobStatus
  generation?: GenerationRecord
}

export interface VideoStatusResponse {
  success: boolean
  data?: VideoStatusResponseData
  error?: string
}

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

export type OutputType = 'IMAGE' | 'VIDEO' | 'AUDIO'
export type GenerationStatus = 'PENDING' | 'COMPLETED' | 'FAILED'

export interface GenerationRecord {
  id: string
  createdAt: Date
  outputType: OutputType
  status: GenerationStatus
  url: string
  storageKey: string
  mimeType: string
  width: number
  height: number
  duration?: number | null
  referenceImageUrl?: string | null
  prompt: string
  negativePrompt?: string | null
  model: string
  provider: string
  requestCount: number
  isPublic: boolean
  isPromptPublic: boolean
  isFeatured?: boolean
  userId?: string | null
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

export const ProviderConfigSchema = z.object({
  label: z.string().trim().min(1).max(60),
  baseUrl: z.string().trim().url().max(300),
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
export type ApiKeyHealthStatus = 'available' | 'no_key' | 'failed'

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

export const OUTPUT_TYPE_FILTER_OPTIONS = ['all', 'image', 'video'] as const
export type OutputTypeFilter = (typeof OUTPUT_TYPE_FILTER_OPTIONS)[number]

export const GALLERY_TIME_RANGE_OPTIONS = ['all', 'today', 'week'] as const
export type GalleryTimeRange = (typeof GALLERY_TIME_RANGE_OPTIONS)[number]

export const GallerySearchSchema = z.object({
  search: z.string().trim().max(200).optional(),
  model: z.string().trim().max(100).optional(),
  sort: z.enum(GALLERY_SORT_OPTIONS).default('newest'),
  type: z.enum(OUTPUT_TYPE_FILTER_OPTIONS).default('all'),
  timeRange: z.enum(GALLERY_TIME_RANGE_OPTIONS).default('all'),
  liked: z.enum(['1']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export type GallerySearchParams = z.infer<typeof GallerySearchSchema>

// ─── Gallery Response ─────────────────────────────────────────────

export interface GalleryResponseData {
  generations: GenerationRecord[]
  page: number
  limit: number
  total: number
  hasMore: boolean
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
  apiKeyId: z.string().optional(),
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
        data.startsWith('https://'),
      'Image must be a valid image data URL (PNG, JPEG, WebP, GIF) or HTTPS URL',
    ),
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
})

export type CreateProjectRequest = z.infer<typeof CreateProjectSchema>

export const UpdateProjectSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  description: z.string().trim().max(500).nullable().optional(),
})

export type UpdateProjectRequest = z.infer<typeof UpdateProjectSchema>

export interface ProjectRecord {
  id: string
  name: string
  description: string | null
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
    total: number
    hasMore: boolean
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
  outputType: z.enum(['IMAGE', 'VIDEO', 'AUDIO']),
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
  })
  .refine((data) => !!(data.modelId || data.styleCardId), {
    message: 'Either modelId or styleCardId is required',
  })
  .refine((data) => !(data.modelId && data.styleCardId), {
    message: 'Cannot specify both modelId and styleCardId',
    path: ['modelId'],
  })

export type StudioGenerateRequest = z.infer<typeof StudioGenerateSchema>
