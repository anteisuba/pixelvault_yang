import { z } from 'zod'

import {
  GENERATION_LIMITS,
  PROMPT_ENHANCE,
  VIDEO_GENERATION,
} from '@/constants/config'
import { API_KEY_ADAPTER_OPTIONS } from '@/constants/api-keys'
import type { AI_ADAPTER_TYPES, ProviderConfig } from '@/constants/providers'

// Re-export ModelOption from constants for convenience
export type { ModelOption } from '@/constants/models'

// ─── Advanced Generation Parameters ──────────────────────────────

/** Zod schema for provider-specific advanced parameters */
export const AdvancedParamsSchema = z.object({
  negativePrompt: z.string().max(2000).optional(),
  guidanceScale: z.number().min(0).max(30).optional(),
  steps: z.number().int().min(1).max(100).optional(),
  seed: z.number().int().min(-1).max(4294967295).optional(),
  referenceStrength: z.number().min(0.01).max(0.99).optional(),
  quality: z.string().optional(),
  background: z.string().optional(),
  style: z.string().optional(),
})

export type AdvancedParams = z.infer<typeof AdvancedParamsSchema>

// ─── Generate Request ─────────────────────────────────────────────

/** Zod schema for image generation request validation */
export const GenerateRequestSchema = z.object({
  /** User's text prompt describing the desired image */
  prompt: z
    .string()
    .trim()
    .min(1, 'Prompt is required')
    .max(
      GENERATION_LIMITS.PROMPT_MAX_LENGTH,
      `Prompt must be less than ${GENERATION_LIMITS.PROMPT_MAX_LENGTH} characters`,
    ),
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
}

// ─── Video Generate Request ───────────────────────────────────────

export const GenerateVideoRequestSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, 'Prompt is required')
    .max(
      GENERATION_LIMITS.PROMPT_MAX_LENGTH,
      `Prompt must be less than ${GENERATION_LIMITS.PROMPT_MAX_LENGTH} characters`,
    ),
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
  resolution: z.enum(['480p', '540p', '720p', '1080p']).optional(),
  apiKeyId: z.string().trim().min(1).optional(),
})

export type GenerateVideoRequest = z.infer<typeof GenerateVideoRequestSchema>

export type GenerateVideoResponse = GenerateResponse

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
  userId?: string | null
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
  data?: Pick<GenerationRecord, 'id' | 'isPublic' | 'isPromptPublic'>
  error?: string
}

// ─── Gallery Search & Filter ──────────────────────────────────────

export const GALLERY_SORT_OPTIONS = ['newest', 'oldest'] as const
export type GallerySortOption = (typeof GALLERY_SORT_OPTIONS)[number]

export const OUTPUT_TYPE_FILTER_OPTIONS = ['all', 'image', 'video'] as const
export type OutputTypeFilter = (typeof OUTPUT_TYPE_FILTER_OPTIONS)[number]

export const GallerySearchSchema = z.object({
  search: z.string().trim().max(200).optional(),
  model: z.string().trim().max(100).optional(),
  sort: z.enum(GALLERY_SORT_OPTIONS).default('newest'),
  type: z.enum(OUTPUT_TYPE_FILTER_OPTIONS).default('all'),
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
    .max(GENERATION_LIMITS.PROMPT_MAX_LENGTH),
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
