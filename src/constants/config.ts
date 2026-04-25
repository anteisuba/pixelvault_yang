/**
 * Application-wide configuration constants
 */

/** API usage tracking defaults */
export const API_USAGE = {
  DEFAULT_REQUESTS_PER_GENERATION: 1,
  SUMMARY_LOOKBACK_DAYS: 30,
} as const

/** Supported image size configurations */
export const IMAGE_SIZES = {
  '1:1': { width: 1024, height: 1024, label: '1:1 (Square)' },
  '16:9': { width: 1792, height: 1024, label: '16:9 (Landscape)' },
  '9:16': { width: 1024, height: 1792, label: '9:16 (Portrait)' },
  '4:3': { width: 1024, height: 768, label: '4:3 (Standard)' },
  '3:4': { width: 768, height: 1024, label: '3:4 (Tall)' },
} as const

/** Type for supported aspect ratios */
export type AspectRatio = keyof typeof IMAGE_SIZES

/** Default aspect ratio */
export const DEFAULT_ASPECT_RATIO: AspectRatio = '1:1'

/** API endpoint paths */
export const API_ENDPOINTS = {
  /** Image generation */
  GENERATE: '/api/generate',

  /** Image listing (public gallery) */
  IMAGES: '/api/images',

  /** User API usage summary */
  USAGE_SUMMARY: '/api/usage-summary',

  /** Clerk webhook */
  CLERK_WEBHOOK: '/api/webhooks/clerk',

  /** User API keys management */
  API_KEYS: '/api/api-keys',

  /** Generation management */
  GENERATIONS: '/api/generations',

  /** Prompt enhancement */
  ENHANCE_PROMPT: '/api/prompt/enhance',

  /** Prompt feedback (AI coaching) */
  PROMPT_FEEDBACK: '/api/prompt/feedback',
  /** Prompt assistant (chat-based prompt generation) */
  PROMPT_ASSISTANT: '/api/prompt/assistant',
  /** Generation feedback (iterative refinement) */
  GENERATION_FEEDBACK: '/api/generation/feedback',

  /** Image reverse engineering */
  ANALYZE_IMAGE: '/api/image/analyze',
  /** Image editing (upscale, remove background) */
  IMAGE_EDIT: '/api/image/edit',

  /** Image layer decomposition (See-Through) */
  IMAGE_DECOMPOSE: '/api/image/decompose',

  /** Image transform (style / pose / background — Phase 1: style only) */
  IMAGE_TRANSFORM: '/api/image-transform',

  /** Arena */
  ARENA_MATCHES: '/api/arena/matches',
  ARENA_LEADERBOARD: '/api/arena/leaderboard',
  ARENA_HISTORY: '/api/arena/history',
  ARENA_PERSONAL_STATS: '/api/arena/personal-stats',

  /** Stories */
  STORIES: '/api/stories',

  /** Video generation */
  GENERATE_VIDEO: '/api/generate-video',

  /** Video generation status polling */
  GENERATE_VIDEO_STATUS: '/api/generate-video/status',

  /** Long video pipeline */
  GENERATE_LONG_VIDEO: '/api/generate-long-video',
  GENERATE_LONG_VIDEO_STATUS: '/api/generate-long-video/status',
  GENERATE_LONG_VIDEO_RETRY: '/api/generate-long-video/retry',
  GENERATE_LONG_VIDEO_CANCEL: '/api/generate-long-video/cancel',

  /** Projects */
  PROJECTS: '/api/projects',

  /** Character Cards */
  CHARACTER_CARDS: '/api/character-cards',

  /** Video Script (VS1-VS11) */
  VIDEO_SCRIPT: '/api/video-script',

  /** Public model list (merged DB + hardcoded) */
  MODELS: '/api/models',

  /** Model health check */
  MODEL_HEALTH: '/api/models/health',

  /** System health (public pong + token-based provider refresh) */
  HEALTH: '/api/health',
  HEALTH_PROVIDERS: '/api/health/providers',

  /** Admin model management */
  ADMIN_MODELS: '/api/admin/models',

  /** Creator Profile */
  USERS: '/api/users',
  USER_PROFILE: '/api/users/me/profile',
  AVATAR_SYNC: '/api/users/me/avatar-sync',
  UPLOAD_AVATAR: '/api/users/me/avatar',
  UPLOAD_BANNER: '/api/users/me/banner',

  /** Likes */
  LIKES: '/api/likes',

  /** Follows */
  FOLLOWS: '/api/follows',

  /** Collections */
  COLLECTIONS: '/api/collections',

  /** Composable Card System */
  BACKGROUND_CARDS: '/api/background-cards',
  STYLE_CARDS: '/api/style-cards',
  CARD_RECIPES: '/api/card-recipes',

  /** Audio generation */
  GENERATE_AUDIO: '/api/generate-audio',

  /** Audio generation status polling */
  GENERATE_AUDIO_STATUS: '/api/generate-audio/status',

  /** Studio V2 */
  STUDIO_GENERATE: '/api/studio/generate',
  STUDIO_SELECT_WINNER: '/api/studio/select-winner',
  GENERATION_PLAN: '/api/generation/plan',
  GENERATION_EVALUATE: '/api/generation/evaluate',
  CIVITAI_TOKEN: '/api/civitai-token',

  /** LoRA Training */
  LORA_TRAINING: '/api/lora-training',
} as const

/** LoRA Training configuration */
export const LORA_TRAINING = {
  MIN_IMAGES: 5,
  MAX_IMAGES: 50,
  MAX_PER_USER: 10,
  POLL_INTERVAL_MS: 5000,
  TIMEOUT_MS: 600_000,
} as const

/** Project configuration */
export const PROJECT = {
  NAME_MAX_LENGTH: 60,
  DESCRIPTION_MAX_LENGTH: 500,
  /** Default project name for new users */
  DEFAULT_PROJECT_NAME: 'Default',
  /** Max projects per user */
  MAX_PROJECTS_PER_USER: 50,
  /** History panel page size */
  HISTORY_PAGE_SIZE: 20,
} as const

/** Creator profile configuration */
export const PROFILE = {
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 30,
  USERNAME_PATTERN: /^[a-zA-Z][a-zA-Z0-9-]*$/ as RegExp,
  BIO_MAX_LENGTH: 200,
  DISPLAY_NAME_MAX_LENGTH: 50,
  /** Images per page on public profile Polaroid grid */
  POLAROID_PAGE_SIZE: 15,
  /** Max rotation degrees for Polaroid scatter */
  POLAROID_MAX_ROTATION: 15,
  /** Max random offset in px for Polaroid scatter */
  POLAROID_MAX_OFFSET: 8,
  /** Reduced rotation range for 1-3 images */
  POLAROID_FEW_ROTATION: 8,
  /** Polaroid card border color (design system) */
  POLAROID_BORDER_COLOR: '#e8e6dc',
  /** Avatar/banner upload limits */
  AVATAR_MAX_SIZE_BYTES: 5 * 1024 * 1024, // 5 MB
  BANNER_MAX_SIZE_BYTES: 10 * 1024 * 1024, // 10 MB
  SUPPORTED_IMAGE_TYPES: [
    'image/jpeg',
    'image/png',
    'image/webp',
  ] as readonly string[],
  /** Reserved usernames that cannot be claimed */
  RESERVED_USERNAMES: [
    'admin',
    'api',
    'settings',
    'profile',
    'u',
    'gallery',
    'studio',
    'arena',
    'feed',
    'explore',
    'search',
    'help',
    'about',
    'terms',
    'privacy',
    'login',
    'signup',
    'register',
  ] as readonly string[],
} as const

/** Arena configuration */
export const ARENA = {
  INITIAL_ELO: 1500,
  K_FACTOR: 32,
  MIN_MODELS_FOR_MATCH: 2,
  POLL_INTERVAL_MS: 2000,
  PROVIDER_TIMEOUT_MS: 45000,
  HISTORY_PAGE_SIZE: 20,
} as const

/** Prompt enhancement configuration */
export const PROMPT_ENHANCE = {
  MAX_INPUT_LENGTH: 2000,
  STYLES: ['detailed', 'artistic', 'photorealistic', 'anime', 'lora'] as const,
} as const

export type PromptEnhanceStyle = (typeof PROMPT_ENHANCE.STYLES)[number]

/** External AI provider endpoints */
export const AI_PROVIDER_ENDPOINTS = {
  HUGGINGFACE: 'https://router.huggingface.co/hf-inference/models',
  GEMINI: 'https://generativelanguage.googleapis.com/v1beta/models',
  OPENAI: 'https://api.openai.com/v1/images',
  OPENAI_CHAT: 'https://api.openai.com/v1',
  FAL: 'https://fal.run',
  FAL_QUEUE: 'https://queue.fal.run',
  REPLICATE: 'https://api.replicate.com/v1',
  NOVELAI: 'https://image.novelai.net',
  VOLCENGINE: 'https://ark.cn-beijing.volces.com/api/v3',
  FISH_AUDIO: 'https://api.fish.audio',
} as const

/** Video generation configuration */
export const VIDEO_GENERATION = {
  MAX_DURATION: 10,
  DEFAULT_DURATION: 5,
  DURATION_OPTIONS: [3, 5, 10] as const,
  POLL_INTERVAL_MS: 3000,
  MAX_POLL_ATTEMPTS: 200,
  DEFAULT_ASPECT_RATIO: '16:9' as const,
  /** Long video pipeline */
  LONG_VIDEO_DURATION_OPTIONS: [10, 30, 60, 120] as const,
  MAX_LONG_VIDEO_DURATION: 120,
  PIPELINE_POLL_INTERVAL_MS: 5000,
  MAX_PIPELINE_POLL_ATTEMPTS: 600,
  /** Number of early 404 responses to tolerate before treating as error */
  EARLY_POLL_TOLERANCE: 5,
} as const

/** Audio generation configuration */
export const AUDIO_GENERATION = {
  DEFAULT_FORMAT: 'mp3' as const,
  DEFAULT_SAMPLE_RATE: 44100,
  DEFAULT_SPEED: 1.0,
  MAX_TEXT_LENGTH: 5000,
  POLL_INTERVAL_MS: 2000,
  MAX_POLL_ATTEMPTS: 100,
} as const

/** Health check configuration */
export const HEALTH_CHECK = {
  CACHE_TTL_MS: 300_000,
  TIMEOUT_MS: 10_000,
} as const

/** Free tier configuration */
export const FREE_TIER = {
  /** Maximum free generations per user per day */
  DAILY_LIMIT: 20,
  /** Whether the free tier is enabled */
  ENABLED: true,
} as const

/** Collection configuration */
export const COLLECTION = {
  NAME_MAX_LENGTH: 60,
  DESCRIPTION_MAX_LENGTH: 500,
  /** Max collections per user */
  MAX_COLLECTIONS_PER_USER: 50,
  /** Max items per collection */
  MAX_ITEMS_PER_COLLECTION: 200,
  /** Items per page when listing collection contents */
  PAGE_SIZE: 20,
} as const

/** Pagination defaults */
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
} as const

// ─── Studio Refactoring Constants ────────────────────────────────

/** Studio generation modes */
export const STUDIO_MODES = ['image', 'video', 'audio'] as const
export type StudioMode = (typeof STUDIO_MODES)[number]

/** Centralized rate limit configs (previously scattered across route files) */
export const RATE_LIMIT_CONFIGS = {
  generate: { limit: 10, windowSeconds: 60 },
  studioGenerate: { limit: 10, windowSeconds: 60 },
  generateVideo: { limit: 5, windowSeconds: 60 },
  generateAudio: { limit: 5, windowSeconds: 60 },
  generateLongVideo: { limit: 3, windowSeconds: 60 },
  longVideoCancel: { limit: 10, windowSeconds: 60 },
  longVideoRetry: { limit: 5, windowSeconds: 60 },
  longVideoStatus: { limit: 30, windowSeconds: 60 },
  imageEdit: { limit: 10, windowSeconds: 60 },
  imageDecompose: { limit: 5, windowSeconds: 120 },
  imageAnalyze: { limit: 10, windowSeconds: 60 },
  promptEnhance: { limit: 20, windowSeconds: 60 },
  promptAssistant: { limit: 30, windowSeconds: 60 },
  imageTransform: { limit: 10, windowSeconds: 60 },
} as const

/** Centralized maxDuration configs for serverless functions */
export const MAX_DURATION_CONFIGS = {
  /** Image generation — 4 min (some models are slow) */
  generate: 240,
  /** Studio generation — same as generate */
  studioGenerate: 240,
  /** Video submission — 4 min (queue submission + initial processing) */
  generateVideo: 240,
  /** Long video pipeline — 4 min */
  generateLongVideo: 240,
  /** Image analysis/reverse engineering — 30s (single LLM call) */
  imageAnalyze: 30,
  /** Image edit (upscale/remove-bg) — 2 min */
  imageEdit: 120,
  /** Image layer decomposition (See-Through) — 5 min (GPU inference) */
  imageDecompose: 300,
  /** Image analysis variations — 55s (multi-model parallel) */
  imageAnalyzeVariations: 55,
  /** Audio generation — 2 min */
  generateAudio: 120,
} as const
