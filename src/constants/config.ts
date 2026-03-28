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
  /** Generation feedback (iterative refinement) */
  GENERATION_FEEDBACK: '/api/generation/feedback',

  /** Image reverse engineering */
  ANALYZE_IMAGE: '/api/image/analyze',
  /** Image editing (upscale, remove background) */
  IMAGE_EDIT: '/api/image/edit',

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

  /** Projects */
  PROJECTS: '/api/projects',

  /** Character Cards */
  CHARACTER_CARDS: '/api/character-cards',

  /** Public model list (merged DB + hardcoded) */
  MODELS: '/api/models',

  /** Model health check */
  MODEL_HEALTH: '/api/models/health',

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
  STYLES: ['detailed', 'artistic', 'photorealistic', 'anime'] as const,
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
} as const

/** Video generation configuration */
export const VIDEO_GENERATION = {
  MAX_DURATION: 10,
  DEFAULT_DURATION: 5,
  DURATION_OPTIONS: [3, 5, 10] as const,
  POLL_INTERVAL_MS: 3000,
  MAX_POLL_ATTEMPTS: 200,
  DEFAULT_ASPECT_RATIO: '16:9' as const,
} as const

/** Health check configuration */
export const HEALTH_CHECK = {
  CACHE_TTL_MS: 300_000,
  TIMEOUT_MS: 10_000,
} as const

/** Free tier configuration */
export const FREE_TIER = {
  /** Maximum free generations per user per day */
  DAILY_LIMIT: 5,
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
