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
  /** Read-only assistant conversation shares */
  ASSISTANT_SHARE: '/api/assistant/share',
  /** Node Studio Seedance prompt planning */
  SEEDANCE_PROMPT_PLAN: '/api/studio/seedance-prompt-plan',
  /** Node Studio assistant conversation */
  NODE_ASSISTANT: '/api/studio/node-assistant',
  /** Persisted assistant chat transcripts (Node canvas + Studio) */
  ASSISTANT_CONVERSATION: '/api/assistant/conversation',
  /** Node Studio structured ScriptDoc draft (assistant → outline) */
  NODE_SCRIPT_DOC: '/api/studio/node-script-doc',
  /** Generation feedback (iterative refinement) */
  GENERATION_FEEDBACK: '/api/generation/feedback',

  /** Image reverse engineering */
  ANALYZE_IMAGE: '/api/image/analyze',
  /** Image editing (upscale, remove background) */
  IMAGE_EDIT: '/api/image/edit',
  /** 多框注释一次全改 */
  IMAGE_OBJECT_REPLACE: '/api/image/object-replace',
  /** Image inpainting */
  IMAGE_INPAINT: '/api/image/inpaint',

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

  /** Prepare a browser-direct R2 image upload */
  UPLOAD_IMAGE_DIRECT: '/api/upload-image/direct',

  /** Complete a browser-direct R2 image upload and create its Generation row */
  UPLOAD_IMAGE_DIRECT_COMPLETE: '/api/upload-image/direct/complete',

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
  /** Public Hugging Face LoRA browser/import source */
  LORA_ASSETS_HUGGINGFACE: '/api/lora-assets/huggingface',
  /** README showcase images for one HF repo — library cover progressive
   *  enhancement (2026-07-18 方案 B), lazily fetched client-side */
  LORA_ASSETS_HUGGINGFACE_SHOWCASE: '/api/lora-assets/huggingface/showcase',
  /** Redirect a Civitai model version download id to its concrete model page */
  LORA_ASSETS_CIVITAI_SOURCE: '/api/lora-assets/civitai/source',
  /** Mine real activation prompts from /api/v1/images for a Civitai LoRA */
  LORA_ASSETS_CIVITAI_MINED_PROMPTS: '/api/lora-assets/civitai/mined-prompts',
  LORA_ASSETS_CIVITAI_DESCRIPTION: '/api/lora-assets/civitai/description',
  RUNNER_USAGE: '/api/runner/usage',
  /** Resolve a recipe's extra-LoRA reference (hash / versionId) to a mountable item */
  LORA_ASSETS_CIVITAI_RESOLVE: '/api/lora-assets/civitai/resolve',
  /** Resolve a style-code share-link → LoraAsset */
  LORA_ASSET_BY_CODE: '/api/lora-assets/by-code',
  /** Import an external (Civitai/Hugging Face) LoRA into the viewer's favorites */
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
  /**
   * Interactions API — the surface Gemini Omni video models run on. It sits
   * beside `/models`, not under it, so it cannot be derived from GEMINI above.
   */
  GEMINI_INTERACTIONS:
    'https://generativelanguage.googleapis.com/v1beta/interactions',
  /** Files API — where `delivery: 'uri'` video output lands. */
  GEMINI_FILES: 'https://generativelanguage.googleapis.com/v1beta/files',
  /** Resumable upload entry used by Gemini video understanding. */
  GEMINI_FILES_UPLOAD:
    'https://generativelanguage.googleapis.com/upload/v1beta/files',
  OPENAI: 'https://api.openai.com/v1/images',
  OPENAI_CHAT: 'https://api.openai.com/v1',
  DEEPSEEK: 'https://api.deepseek.com',
  FAL: 'https://fal.run',
  FAL_QUEUE: 'https://queue.fal.run',
  RUNWAY: 'https://api.dev.runwayml.com/v1',
  REPLICATE: 'https://api.replicate.com/v1',
  NOVELAI: 'https://image.novelai.net',
  VOLCENGINE: 'https://ark.cn-beijing.volces.com/api/v3',
  BYTEPLUS: 'https://ark.ap-southeast.bytepluses.com/api/v3',
  FISH_AUDIO: 'https://api.fish.audio',
  FISH_AUDIO_ASSETS: 'https://public-platform.r2.fish.audio',
  HYPER3D: 'https://api.hyper3d.com',
  // DashScope (Qwen) — Singapore / International region. OpenAI-compatible
  // chat-completions drop-in. Region-locked: intl keys do NOT work against
  // the CN host (dashscope.aliyuncs.com) and vice versa.
  DASHSCOPE: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  ELEVENLABS: 'https://api.elevenlabs.io',
  // MiniMax (Hailuo) video — 国际站. Async video面: POST `/video_generation`
  // → task_id, GET `/query/video_generation/{id}` → task.content.url.
  // ⚠ 国内站与国际站是**完全分开的两套**：不同域名（minimaxi.com 多一个 i）、
  // 分别注册的账号、**key 不通用**（跨用被拒），服务区域按下单平台决定。
  // 因此两条线各占一个 adapterType，各存各的 key。
  MINIMAX: 'https://api.minimax.io/v2',
  MINIMAX_CN: 'https://api.minimaxi.com/v2',
  // Anthropic Messages API. `llmTextCompletion`'s anthropic branch appends
  // `/messages` — headers are `x-api-key` + `anthropic-version`, not Bearer.
  ANTHROPIC: 'https://api.anthropic.com/v1',
  // RunPod Serverless REST API — the execution worker POSTs
  // `${RUNPOD}/{endpoint}/run` and polls `${RUNPOD}/{endpoint}/status/{id}`.
  // See docs/plans/comfy-runner-HANDOFF-2026-07.md §2.3/§7.
  RUNPOD: 'https://api.runpod.ai/v2',
} as const

export const LLM_TEXT_MODEL_IDS = {
  GEMINI_3_1_FLASH_LITE: 'gemini-3.1-flash-lite',
  GEMINI_3_5_FLASH: 'gemini-3.5-flash',
  OPENAI_GPT_5_5: 'gpt-5.5',
  OPENAI_GPT_5_6_SOL: 'gpt-5.6-sol',
  OPENAI_GPT_5_SEARCH_API: 'gpt-5-search-api',
  DEEPSEEK_V4_PRO: 'deepseek-v4-pro',
  // Qwen (DashScope, intl). Text flagship + 1M-context default + cheap +
  // vision. IDs map to compatible-mode aliases; pin to dated snapshots if
  // alias drift becomes a problem.
  QWEN3_MAX: 'qwen3-max',
  QWEN_PLUS: 'qwen-plus',
  QWEN_FLASH: 'qwen-flash',
  QWEN3_VL_PLUS: 'qwen3-vl-plus',
  // Anthropic (Claude). Sonnet 5 only — owner 2026-07-26 decree, no Opus
  // tier on this route. Canvas-assistant structural reasoning.
  CLAUDE_SONNET_5: 'claude-sonnet-5',
} as const

export const LLM_TEXT_DEFAULT_MAX_TOKENS = {
  DEFAULT: 1024,
  OPENAI_REASONING: 4096,
  // Anthropic's Messages API requires `max_tokens` on every request — there
  // is no "omit for provider-managed" option like OpenAI/DeepSeek/Qwen. This
  // is the wide ceiling used when the caller asks for provider-managed
  // output (providerManagedOutput: true).
  ANTHROPIC_MANAGED: 8192,
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

/**
 * Public-beta resource guardrails for platform-funded generation.
 *
 * `MAX_ACTIVE_JOBS_PER_USER` only gates requests where the platform is
 * actually paying (its own API key / free-tier credit) — see the
 * `isPlatformFunded` field on `CreateGenerationJobInput` in
 * `usage.service.ts`. A user generating with their own bound API key costs
 * the platform nothing and is intentionally not limited by this constant
 * (still subject to whatever rate limit the provider itself enforces).
 * 2026-07-28 owner call: "平台限制到 4 把。自己的 api 不做限制" — raised the
 * platform cap 2 → 4 and scoped it off the BYOK path.
 *
 * `PLATFORM_GENERATION_ENABLED` is intentionally runtime configuration rather
 * than a build-time feature flag. Production fails closed when it is missing;
 * local/test environments remain enabled unless explicitly set to `false`.
 */
export const PLATFORM_GENERATION_GUARD = {
  DAILY_LIMIT: 500,
  MAX_ACTIVE_JOBS_PER_USER: 4,
  ACTIVE_JOB_STATUSES: ['QUEUED', 'RUNNING'] as const,
  /**
   * 并发闸只数这个时长以内创建的活跃 job。
   *
   * 派发出去的任务全靠回调/轮询才会落到终态；回调丢了（Worker 未部署、dev
   * 重启、provider 静默丢弃）那条 job 就永远停在 RUNNING，永久占掉一个并发位。
   * 2026-07-26 就是这么被顶死的：某账号挂着 15 条 3–5 月的僵尸 job，闸上限是
   * 2，所有出图请求一律 429，而且自己不会恢复。
   *
   * 加年龄上限让闸自愈：超过这个时长还没落终态的 job 不再挡新任务。这不是
   * 「把它判成失败」——行还是 RUNNING，等真回调来了照样能正常收尾；只是不再
   * 让一条僵尸永久扣住配额。24h 远高于最慢的正常任务（3D 纹理管线分钟级）。
   */
  ACTIVE_JOB_MAX_AGE_MS: 24 * 60 * 60 * 1000,
} as const

/**
 * 失控速率闸：拦「反复自动发起生成」的死循环/bug（2026-07-28 owner：「死循环还是
 * 要做一个闸门」）。和上面 PLATFORM_GENERATION_GUARD 不是一回事，两道闸形状不同，
 * 不能互相替代：
 *
 *   - PLATFORM_GENERATION_GUARD.MAX_ACTIVE_JOBS_PER_USER 管「同时有多少个在跑」
 *     （并发/成本），且只在平台掏钱时生效。
 *   - 这里管「单位时间发起了多少次」（频率/失控），对所有生成路径生效——不分平台
 *     掏钱还是 BYOK、不分 adapter。
 *
 * 死循环的特征是「持续高频」不是「同时很多」：一个「发一条→等它完→再发一条」的
 * 循环永远只有 1 个活跃 job，撞不上并发闸，但能整夜把用户自己的 key 刷爆——这正是
 * BYOK 不再受并发闸限制之后，唯一还能兜底「有东西在反复自动发起生成」的机制。
 *
 * ⚠ 这是对 `RATE_LIMIT_CONFIGS`（下方，per-route 分钟级请求闸，Upstash 滑动窗口）
 * 的补充，不是替代，两者别混淆职责：
 *   - 分钟级已经由 `RATE_LIMIT_CONFIGS.generate` / `studioGenerate` / `generateVideo`
 *     / `generateAudio` 等档位管了（10/60s 或更紧，`generate-3d` 复用
 *     `generateVideo` 的 5/60s）——本闸**不设分钟档**，加一个比它们都松的分钟档
 *     只是重复造轮子。
 *   - 但分钟级滑动窗口对「稳定低速的死循环」完全无感：10 次/分钟持续跑 = 600
 *     次/小时，通宵下来几千次——每一分钟单看都合规，没有任何小时/天级的兜底。
 *     本闸只填这一个空白：**小时档 + 日档，不设分钟档**。
 *
 * 按账户（userId）计数，不是全站汇总：死循环是某一个账号的 bug，不该让全站陪葬。
 * 全平台限速的话，一个坏掉的客户端就能把所有人锁在门外——那是把「防失控」变成了
 * 「失控本身」。写法对齐 PLATFORM_GENERATION_GUARD 的活跃任务闸（同一张
 * GenerationJob 表 + per-user advisory lock + count），不是 DAILY_LIMIT 那个全站
 * freeTierSlot 汇总。
 *
 * ## 两档的分工（owner 2026-07-28 定值）
 *
 * 先看这个数被夹在什么中间：
 *
 *   - **硬天花板 600/小时** —— 路由层 `studioGenerate` 的 10/分钟已经封死了，
 *     任何闸值高于 600 都等于不存在。
 *   - **重度人工使用估 60–150/小时** —— 出一张图 10–30 秒且人要看结果，就算一直
 *     用 ×4 批量也就这个量级。
 *
 * 所以：
 *
 *   - `HOUR_LIMIT: 500` —— **快速失控**档。贴着 600 的天花板，基本不可能误伤真人，
 *     但绊线还在。⚠ 别指望它省多少：天花板本来就是 600，从 600 压到 500 只挡掉
 *     六分之一。它的价值是「存在」，不是「省量」。
 *   - `DAY_LIMIT: 1500` —— **慢速长跑**档，**这才是真正有效的那一道**。死循环的伤害
 *     是按「一整夜」算的：无日档时 600/小时 × 8 小时 ≈ 4800 次；有日档则 ≈2.5 小时
 *     就被拦下。而 1500/天没有任何真人碰得到——手动出 1500 张图等于全天不吃不喝
 *     每 60 秒一张。
 *
 * ⚠ 最初只设了小时档（300），漏掉的正是「通宵慢速刷爆 key」这个 owner 最担心的
 * 场景——小时档管不住它，因为它每一小时单看都合规。日档是后补的，别当成冗余删掉。
 *
 * ⚠ 这两个数都是**按上述上下界推的，不是从真实流量里量出来的**。误伤了正常的高频
 * 场景（比如批量变体探索连跑一整个下午）时，**先看日志分布再调**，不要凭感觉改。
 *
 * ⚠ BYOK 时平台一分钱不出，这道闸保护的是**用户自己的钱包**——所以宽松是合理的：
 * 真正的止损目标是「几小时内停下」，不是「几分钟内停下」。
 */
export const RUNAWAY_GENERATION_GUARD = {
  HOUR_LIMIT: 500,
  HOUR_WINDOW_MS: 60 * 60 * 1000,
  DAY_LIMIT: 1500,
  DAY_WINDOW_MS: 24 * 60 * 60 * 1000,
} as const

/**
 * Comfy Runner (RunPod Serverless ComfyUI) budget guardrail.
 *
 * RunPod's panel can cap concurrency/cost per job but not "N generations per
 * month" — that has to live in application code (mirrors the FREE_TIER daily
 * cap above). 300/month is ≈ $1.8 at the measured ~$0.006/image ceiling,
 * leaving ~5x headroom under the $10/month prepaid budget for cold-start
 * variance and retries. See docs/plans/comfy-runner-HANDOFF-2026-07.md §4.3.
 */
export const RUNNER_MONTHLY_LIMIT = {
  /** Maximum RUNNER-adapter generation attempts per calendar month (UTC). */
  LIMIT: 300,
  /** Whether the runner is enabled at all — see FEATURE_FLAGS.comfyRunner. */
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
  /** Image analysis variations — 55s (multi-model parallel) */
  imageAnalyzeVariations: 55,
  /** Audio generation — 2 min */
  generateAudio: 120,
} as const
