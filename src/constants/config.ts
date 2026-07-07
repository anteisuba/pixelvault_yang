/**
 * Application-wide configuration constants
 */

export const DEFAULT_APP_ORIGIN = 'http://localhost:3000'

export const LOCAL_APP_ORIGINS = [DEFAULT_APP_ORIGIN] as const

function toHttpOrigin(value: string | undefined) {
  if (!value) {
    return null
  }

  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null
    }

    return url.origin
  } catch {
    return null
  }
}

function uniqueOrigins(origins: Array<string | null>) {
  return Array.from(
    new Set(origins.filter((origin): origin is string => Boolean(origin))),
  )
}

export function getAppOrigin() {
  const configuredOrigin = toHttpOrigin(process.env.NEXT_PUBLIC_APP_URL?.trim())

  if (process.env.NEXT_PUBLIC_APP_URL && !configuredOrigin) {
    throw new Error('NEXT_PUBLIC_APP_URL must be an absolute http(s) URL')
  }

  return configuredOrigin ?? DEFAULT_APP_ORIGIN
}

export function getClerkAllowedOrigins(extraOrigins: readonly string[] = []) {
  const localOrigins =
    process.env.NODE_ENV === 'development' ? LOCAL_APP_ORIGINS : []

  return uniqueOrigins([
    getAppOrigin(),
    ...localOrigins.map((origin) => toHttpOrigin(origin)),
    ...extraOrigins.map((origin) => toHttpOrigin(origin)),
  ])
}

/** API usage tracking defaults */
export const API_USAGE = {
  DEFAULT_REQUESTS_PER_GENERATION: 1,
  SUMMARY_LOOKBACK_DAYS: 30,
} as const

/** Database pool defaults for Prisma v7 driver adapters */
export const DATABASE_POOL = {
  MAX_CONNECTIONS: 3,
  CONNECTION_TIMEOUT_MS: 15_000,
  IDLE_TIMEOUT_MS: 300_000,
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

  /** Auth-gated asset download proxy */
  DOWNLOAD: '/api/download',

  /** Image listing (public gallery) */
  IMAGES: '/api/images',

  /** Sidebar counts for the /assets browser */
  ASSET_SECTION_COUNTS: '/api/assets/section-counts',

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
  /** Node Studio script breakdown */
  SCRIPT_BREAKDOWN: '/api/script-breakdown',
  /** Node Studio Seedance prompt planning */
  SEEDANCE_PROMPT_PLAN: '/api/studio/seedance-prompt-plan',
  /** Node Studio assistant conversation */
  NODE_ASSISTANT: '/api/studio/node-assistant',
  /** Node Studio structured ScriptDoc draft (assistant → outline) */
  NODE_SCRIPT_DOC: '/api/studio/node-script-doc',
  /** Generation feedback (iterative refinement) */
  GENERATION_FEEDBACK: '/api/generation/feedback',

  /** Image reverse engineering */
  ANALYZE_IMAGE: '/api/image/analyze',
  /** Image editing (upscale, remove background) */
  IMAGE_EDIT: '/api/image/edit',
  /** Image inpainting */
  IMAGE_INPAINT: '/api/image/inpaint',
  /** Image outpainting */
  IMAGE_OUTPAINT: '/api/image/outpaint',

  /** Image layer decomposition (See-Through) */
  IMAGE_DECOMPOSE: '/api/image/decompose',

  /** Element extraction (text-guided cutout via lang-SAM) */
  IMAGE_EXTRACT: '/api/image/extract',

  /** Extracted-element asset library (saved cutouts users can reuse) */
  EXTRACTED_ELEMENTS: '/api/extracted-elements',

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

  /** 3D generation (image-to-3D) */
  GENERATE_3D: '/api/generate-3d',
  GENERATE_3D_STATUS: '/api/generate-3d/status',
  GENERATE_3D_CONTINUE: '/api/generate-3d/continue',
  GENERATE_3D_RETRY_MESH: '/api/generate-3d/retry-mesh',
  GENERATE_3D_CANCEL: '/api/generate-3d/cancel',

  /** Multi-view generation (reference-edit chain for 3D inputs) */
  GENERATE_MULTIVIEW: '/api/generate-multiview',
  GENERATE_MULTIVIEW_STATUS: '/api/generate-multiview/status',

  /** Import a remote/base64 image as a Generation row (JSON body) */
  UPLOAD_IMAGE: '/api/upload-image',

  /** Upload a local image file as a Generation row (multipart/form-data) */
  UPLOAD_IMAGE_FILE: '/api/upload-image/file',

  /** Upload a poster PNG for a MODEL_3D generation (client-rendered thumbnail) */
  GENERATION_POSTER: '/api/generations',

  /** Long video pipeline */
  GENERATE_LONG_VIDEO: '/api/generate-long-video',
  GENERATE_LONG_VIDEO_STATUS: '/api/generate-long-video/status',
  GENERATE_LONG_VIDEO_RETRY: '/api/generate-long-video/retry',
  GENERATE_LONG_VIDEO_CANCEL: '/api/generate-long-video/cancel',

  /** Projects */
  PROJECTS: '/api/projects',

  /** Recipes */
  RECIPES: '/api/recipes',

  /** Public inspiration prompts (curated library) */
  INSPIRATION: '/api/inspiration',
  /** Public prompt-tag search over model-keyword LoRA trigger words */
  PROMPT_TAGS_MODEL_KEYWORD: '/api/prompt-tags/model-keyword',

  /** Voice Cards */
  VOICE_CARDS: '/api/voice-cards',

  /** Node Studio workflow projects */
  NODE_WORKFLOW_PROJECTS: '/api/node-workflow/projects',

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
  STUDIO_GENERATE_STATUS: '/api/studio/generate/status',
  STUDIO_SELECT_WINNER: '/api/studio/select-winner',
  GENERATION_PLAN: '/api/generation/plan',
  GENERATION_COMPILE: '/api/generation/compile',
  GENERATION_EVALUATE: '/api/generation/evaluate',
  CIVITAI_TOKEN: '/api/civitai-token',

  /** LoRA Training */
  LORA_TRAINING: '/api/lora-training',
  /** Per-image upload for LoRA training (stage-3 base64 → R2 URL path) */
  LORA_TRAINING_UPLOADS: '/api/lora-training/uploads',

  /** LoRA Asset library (curated + user-trained) */
  LORA_ASSETS: '/api/lora-assets',
  /** Public Civitai LoRA browser */
  LORA_ASSETS_CIVITAI: '/api/lora-assets/civitai',
  /** Redirect a Civitai model version download id to its concrete model page */
  LORA_ASSETS_CIVITAI_SOURCE: '/api/lora-assets/civitai/source',
  /** Mine real activation prompts from /api/v1/images for a Civitai LoRA */
  LORA_ASSETS_CIVITAI_MINED_PROMPTS: '/api/lora-assets/civitai/mined-prompts',
  /** Resolve a recipe's extra-LoRA reference (hash / versionId) to a mountable item */
  LORA_ASSETS_CIVITAI_RESOLVE: '/api/lora-assets/civitai/resolve',
  /** Resolve a style-code share-link → LoraAsset */
  LORA_ASSET_BY_CODE: '/api/lora-assets/by-code',
  /** Import an external (Civitai) LoRA into the viewer's favorites */
  LORA_ASSETS_FAVORITE: '/api/lora-assets/favorite',

  /** "Use this image" payload — style codes (and later prompt/seed/model) */
  GENERATIONS_BASE: '/api/generations',
} as const

/**
 * Temporary provider asset CDN hosts that the auth-gated download proxy may
 * fetch before an edited result is persisted into R2. Keep this list narrow:
 * arbitrary public URLs must not become downloadable through our proxy.
 */
export const DOWNLOAD_PROXY_ALLOWED_PROVIDER_HOST_SUFFIXES = [
  'fal.media',
  'replicate.delivery',
] as const

/** Client-side API request guardrails */
export const CLIENT_API = {
  ACTION_TIMEOUT_MS: 15_000,
} as const

/** LoRA Training configuration */
export const LORA_TRAINING = {
  MIN_IMAGES: 5,
  MAX_IMAGES: 50,
  MAX_PER_USER: 10,
  POLL_INTERVAL_MS: 5000,
  TIMEOUT_MS: 600_000,
  RECOMMENDED_MIN: 15,
  RECOMMENDED_MAX: 30,
  ESTIMATED_COST_USD: '$1.20',
  ESTIMATED_TIME_MIN: 18,
  MOBILE_SNAP_POINTS: [0.4, 0.95] as readonly number[],
  NAME_MAX_LENGTH: 100,
  TRIGGER_MAX_LENGTH: 50,
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
  DEEPSEEK: 'https://api.deepseek.com',
  FAL: 'https://fal.run',
  FAL_QUEUE: 'https://queue.fal.run',
  RUNWAY: 'https://api.dev.runwayml.com/v1',
  REPLICATE: 'https://api.replicate.com/v1',
  NOVELAI: 'https://image.novelai.net',
  VOLCENGINE: 'https://ark.cn-beijing.volces.com/api/v3',
  FISH_AUDIO: 'https://api.fish.audio',
  FISH_AUDIO_ASSETS: 'https://public-platform.r2.fish.audio',
  HYPER3D: 'https://api.hyper3d.com',
  // DashScope (Qwen) — Singapore / International region. OpenAI-compatible
  // chat-completions drop-in. Region-locked: intl keys do NOT work against
  // the CN host (dashscope.aliyuncs.com) and vice versa.
  DASHSCOPE: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  ELEVENLABS: 'https://api.elevenlabs.io',
} as const

export const LLM_TEXT_MODEL_IDS = {
  GEMINI_3_1_FLASH_LITE: 'gemini-3.1-flash-lite',
  GEMINI_3_5_FLASH: 'gemini-3.5-flash',
  OPENAI_GPT_5_5: 'gpt-5.5',
  DEEPSEEK_V4_PRO: 'deepseek-v4-pro',
  // Qwen (DashScope, intl). Text flagship + 1M-context default + cheap +
  // vision. IDs map to compatible-mode aliases; pin to dated snapshots if
  // alias drift becomes a problem.
  QWEN3_MAX: 'qwen3-max',
  QWEN_PLUS: 'qwen-plus',
  QWEN_FLASH: 'qwen-flash',
  QWEN3_VL_PLUS: 'qwen3-vl-plus',
} as const

export const RUNWAY_API = {
  VERSION: '2024-11-06',
  IMAGE_TO_VIDEO_PATH: '/image_to_video',
  TASKS_PATH: '/tasks',
  PROBE_TASK_ID: '00000000-0000-4000-8000-000000000000',
} as const

/** Video generation configuration */
export const VIDEO_GENERATION = {
  // Seedance 2.0 / Seedance Reference accept 4-15 seconds. Older models
  // (Veo, Kling) clamp internally via their own builder helpers, so raising
  // the wire-level cap to 15 doesn't break them.
  MAX_DURATION: 15,
  /**
   * Long-video pipeline cap for the first clip's duration. Independent of
   * MAX_DURATION because long-video runs on Veo/Kling/etc. extension models
   * whose own per-clip limits sit around 8-10s — pushing past that wastes
   * provider time on clips the extension can't use.
   */
  LONG_VIDEO_FIRST_CLIP_MAX_DURATION: 10,
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

/** Image generation (async via execution worker) configuration */
export const IMAGE_GENERATION = {
  POLL_INTERVAL_MS: 2000,
  // The worker runs up to EXECUTION_WORKER.DEFAULT_TIMEOUT_MS (600s) before it
  // sends a terminal callback. The poll window must out-wait that plus a margin
  // for the callback + R2 finalize roundtrip, or the UI declares failure while
  // the worker is still working and the image silently lands in the gallery.
  // gpt-image-2 multi-reference edits routinely take 2-3 min. 330 × 2s = 660s.
  MAX_POLL_ATTEMPTS: 330,
} as const

/**
 * Shared resilience knobs for the async generation status pollers
 * (image / video / audio). A status-endpoint blip — a thrown fetch or a
 * non-success envelope — is transient, not terminal: the poller backs off and
 * retries instead of abandoning a still-running job on the first hiccup. Only
 * after TRANSIENT_TOLERANCE *consecutive* transient failures does it give up to
 * a `pending` outcome, which the caller persists by jobId for later
 * reconciliation rather than dropping the in-flight result.
 */
export const GENERATION_POLL = {
  /** Consecutive transient status failures tolerated before bailing to pending. */
  TRANSIENT_TOLERANCE: 4,
  /** First transient-retry backoff; doubles on each consecutive failure. */
  BACKOFF_BASE_MS: 1000,
  /** Upper bound for the exponential transient-retry backoff. */
  BACKOFF_MAX_MS: 15_000,
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
  scriptBreakdown: { limit: 12, windowSeconds: 60 },
  seedancePromptPlan: { limit: 12, windowSeconds: 60 },
  nodeAssistant: { limit: 30, windowSeconds: 60 },
  nodeScriptDoc: { limit: 12, windowSeconds: 60 },
  imageTransform: { limit: 10, windowSeconds: 60 },
  // ─── Generic presets ─────────────────────────────────────────
  /** Authenticated list/read endpoints (cards, recipes, history) */
  authedRead: { limit: 120, windowSeconds: 60 },
  /** Authenticated CRUD mutations (likes, follows, project updates) */
  authedWrite: { limit: 30, windowSeconds: 60 },
  /** Sensitive credential/config writes (api-keys, civitai tokens, avatar) */
  sensitiveWrite: { limit: 10, windowSeconds: 60 },
  /** Outbound verification / proxy / download endpoints */
  outboundProbe: { limit: 6, windowSeconds: 60 },
} as const

/** Centralized maxDuration configs for serverless functions */
export const MAX_DURATION_CONFIGS = {
  /** Image generation — 5 min (Qwen/Anima LoRA cold starts can run past 4 min) */
  generate: 300,
  /** Studio generation — same as generate */
  studioGenerate: 300,
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
