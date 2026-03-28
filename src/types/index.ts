import { z } from 'zod'

import { PROFILE, PROMPT_ENHANCE, VIDEO_GENERATION } from '@/constants/config'
import { CHARACTER_CARD } from '@/constants/character-card'
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
  prompt: z.string().trim().min(1, 'Prompt is required'),
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
}

// ─── Video Generate Request ───────────────────────────────────────

export const GenerateVideoRequestSchema = z.object({
  prompt: z.string().trim().min(1, 'Prompt is required'),
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
  characterCardIds: z.array(z.string().trim().min(1)).max(5).optional(),
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
  isFeatured?: boolean
  userId?: string | null
  /** Creator info — present in gallery context */
  creator?: {
    username: string
    displayName: string | null
    avatarUrl: string | null
  } | null
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
  prompt: z.string().trim().min(1, 'Prompt is required'),
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
