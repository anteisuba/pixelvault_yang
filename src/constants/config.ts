/**
 * Application-wide configuration constants
 */

/** Limits for image generation */
export const GENERATION_LIMITS = {
  PROMPT_MAX_LENGTH: 4000,
} as const

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

  /** Image reverse engineering */
  ANALYZE_IMAGE: '/api/image/analyze',

  /** Arena */
  ARENA_MATCHES: '/api/arena/matches',
  ARENA_LEADERBOARD: '/api/arena/leaderboard',

  /** Stories */
  STORIES: '/api/stories',

  /** Video generation */
  GENERATE_VIDEO: '/api/generate-video',

  /** Video generation status polling */
  GENERATE_VIDEO_STATUS: '/api/generate-video/status',
} as const

/** Arena configuration */
export const ARENA = {
  INITIAL_ELO: 1500,
  K_FACTOR: 32,
  MIN_MODELS_FOR_MATCH: 2,
  POLL_INTERVAL_MS: 2000,
  PROVIDER_TIMEOUT_MS: 45000,
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
  FAL: 'https://fal.run',
  FAL_QUEUE: 'https://queue.fal.run',
  REPLICATE: 'https://api.replicate.com/v1',
} as const

/** Video generation configuration */
export const VIDEO_GENERATION = {
  MAX_DURATION: 10,
  DEFAULT_DURATION: 5,
  DURATION_OPTIONS: [3, 5, 10] as const,
  POLL_INTERVAL_MS: 3000,
  MAX_POLL_ATTEMPTS: 120,
  DEFAULT_ASPECT_RATIO: '16:9' as const,
} as const

/** Pagination defaults */
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
} as const
