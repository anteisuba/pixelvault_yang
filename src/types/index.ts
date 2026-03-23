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
  /** Optional specific API key ID to use for this generation */
  apiKeyId: z.string().trim().min(1).optional(),
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
  prompt: string
  negativePrompt?: string | null
  model: string
  provider: string
  requestCount: number
  isPublic: boolean
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

// ─── Visibility Toggle ────────────────────────────────────────────

export interface ToggleVisibilityResponse {
  success: boolean
  data?: Pick<GenerationRecord, 'id' | 'isPublic'>
  error?: string
}

// ─── Gallery Search & Filter ──────────────────────────────────────

export const GALLERY_SORT_OPTIONS = ['newest', 'oldest'] as const
export type GallerySortOption = (typeof GALLERY_SORT_OPTIONS)[number]

export const GallerySearchSchema = z.object({
  search: z.string().trim().max(200).optional(),
  model: z.string().trim().max(100).optional(),
  sort: z.enum(GALLERY_SORT_OPTIONS).default('newest'),
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
})

export type UsageSummary = z.infer<typeof UsageSummarySchema>

// ─── Prompt Enhancement ──────────────────────────────────────────

export const EnhancePromptRequestSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, 'Prompt is required')
    .max(PROMPT_ENHANCE.MAX_INPUT_LENGTH),
  style: z.enum(PROMPT_ENHANCE.STYLES),
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
  imageData: z.string().min(1, 'Image data is required'),
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

export const GenerateVariationsRequestSchema = z.object({
  modelIds: z.array(z.string().trim().min(1)).min(1).max(9),
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

export const CreateArenaMatchRequestSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, 'Prompt is required')
    .max(GENERATION_LIMITS.PROMPT_MAX_LENGTH),
  aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']).default('1:1'),
})

export type CreateArenaMatchRequest = z.infer<
  typeof CreateArenaMatchRequestSchema
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
