import { AI_MODELS } from '@/constants/models/enum'

export const MODEL_3D_VIEW_KEYS = [
  'back',
  'left',
  'right',
  'top',
  'bottom',
  'leftFront',
  'rightFront',
] as const

export type Model3DViewKey = (typeof MODEL_3D_VIEW_KEYS)[number]

export const MODEL_3D_GENERATE_TYPE = {
  NORMAL: 'Normal',
  GEOMETRY: 'Geometry',
  LOW_POLY: 'LowPoly',
} as const

export const MODEL_3D_GENERATE_TYPES = [
  MODEL_3D_GENERATE_TYPE.NORMAL,
  MODEL_3D_GENERATE_TYPE.GEOMETRY,
  MODEL_3D_GENERATE_TYPE.LOW_POLY,
] as const

export type Model3DGenerateType = (typeof MODEL_3D_GENERATE_TYPES)[number]

export const MODEL_3D_PREVIEW_MODE = {
  NONE: 'none',
  MESH_FIRST: 'mesh_first',
} as const

export const MODEL_3D_PREVIEW_MODES = [
  MODEL_3D_PREVIEW_MODE.NONE,
  MODEL_3D_PREVIEW_MODE.MESH_FIRST,
] as const

export type Model3DPreviewMode = (typeof MODEL_3D_PREVIEW_MODES)[number]

export const MODEL_3D_MESH_FIRST_PREVIEW_MODEL_IDS = [
  AI_MODELS.HUNYUAN3D_V3,
  AI_MODELS.HUNYUAN3D_V31_PRO,
] as const

export const MODEL_3D_MULTIVIEW_MODEL_IDS = [
  AI_MODELS.FLUX_KONTEXT_PRO,
  AI_MODELS.OPENAI_GPT_IMAGE_2,
  AI_MODELS.GEMINI_FLASH_IMAGE,
] as const

export type Model3DMultiViewModelId =
  (typeof MODEL_3D_MULTIVIEW_MODEL_IDS)[number]

export const MODEL_3D_JOB_STAGE = {
  SINGLE_RUNNING: 'SINGLE_RUNNING',
  MESH_RUNNING: 'MESH_RUNNING',
  /**
   * PR3-α: geometry-only stage finished, waiting for user to decide
   * (continue to texture / retry mesh / cancel). Job is in DB status RUNNING
   * but consumes no provider resources — the next state transition is driven
   * by the user clicking continue/retry/cancel from the UI.
   */
  MESH_READY: 'MESH_READY',
  TEXTURE_RUNNING: 'TEXTURE_RUNNING',
} as const

export const MODEL_3D_JOB_STAGES = [
  MODEL_3D_JOB_STAGE.SINGLE_RUNNING,
  MODEL_3D_JOB_STAGE.MESH_RUNNING,
  MODEL_3D_JOB_STAGE.MESH_READY,
  MODEL_3D_JOB_STAGE.TEXTURE_RUNNING,
] as const

export type Model3DJobStage = (typeof MODEL_3D_JOB_STAGES)[number]

export const MODEL_3D_PROGRESS_STAGES = [
  'queued',
  'mesh',
  'mesh_ready',
  'texture',
  'uploading',
] as const

export type Model3DProgressStage = (typeof MODEL_3D_PROGRESS_STAGES)[number]

export const MODEL_3D_POLYGON_TYPES = ['triangle', 'quadrilateral'] as const

export type Model3DPolygonType = (typeof MODEL_3D_POLYGON_TYPES)[number]

export const HUNYUAN3D_FACE_COUNT = {
  MIN: 40_000,
  DEFAULT: 500_000,
  HIGH: 1_000_000,
  MAX: 1_500_000,
} as const

export const TRELLIS_2_RESOLUTIONS = [512, 1024, 1536] as const

export type Trellis2Resolution = (typeof TRELLIS_2_RESOLUTIONS)[number]

export const TRELLIS_2_TEXTURE_SIZES = [1024, 2048, 4096] as const

export type Trellis2TextureSize = (typeof TRELLIS_2_TEXTURE_SIZES)[number]

export const TRELLIS_2_DECIMATION_TARGET = {
  MIN: 5_000,
  WEB: 50_000,
  DEFAULT: 500_000,
  HIGH: 1_000_000,
  MAX: 2_000_000,
} as const

export const TRELLIS_2_SAMPLING_STEPS = {
  MIN: 1,
  DEFAULT: 12,
  HIGH: 24,
  MAX: 50,
} as const

export const TRELLIS_2_GUIDANCE = {
  MIN: 0,
  DEFAULT: 7.5,
  MAX: 10,
} as const

export const MODEL_3D_SOURCE_QUALITY = {
  MIN_EDGE_PX: 512,
  PREP_LONG_EDGE_PX: 1024,
  MAX_ASPECT_RATIO: 2.25,
} as const

export const MODEL_3D_MULTIVIEW_CACHE = {
  STORAGE_KEY_PREFIX: 'pixelvault:studio3d:multiview:v2',
  DEFAULT_MODEL_KEY: 'default',
  TTL_MS: 1000 * 60 * 60 * 12,
} as const

// ─── Rodin Gen-2.5 ─────────────────────────────────────────────────

/** Quality tiers exposed by Rodin Gen-2.5 — maps to the `tier` API parameter */
export const RODIN_TIER = {
  EXTREME_LOW: 'Extreme-Low',
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  EXTREME_HIGH: 'Extreme-High',
} as const

export const RODIN_TIERS = [
  RODIN_TIER.EXTREME_LOW,
  RODIN_TIER.LOW,
  RODIN_TIER.MEDIUM,
  RODIN_TIER.HIGH,
  RODIN_TIER.EXTREME_HIGH,
] as const

export type RodinTier = (typeof RODIN_TIERS)[number]

/** Credit costs by tier. HighPack always adds +1.0 cr on top. */
export const RODIN_TIER_CREDITS: Record<RodinTier, number> = {
  [RODIN_TIER.EXTREME_LOW]: 0.5,
  [RODIN_TIER.LOW]: 0.5,
  [RODIN_TIER.MEDIUM]: 0.5,
  [RODIN_TIER.HIGH]: 0.5,
  [RODIN_TIER.EXTREME_HIGH]: 1.0,
} as const

export const RODIN_HIGHPACK_EXTRA_CREDITS = 1.0

/**
 * Approximate generation time by tier (seconds).
 * Used for UI progress estimation only — actual times vary by server load.
 */
export const RODIN_TIER_ESTIMATED_SECONDS: Record<RodinTier, number> = {
  [RODIN_TIER.EXTREME_LOW]: 45,
  [RODIN_TIER.LOW]: 60,
  [RODIN_TIER.MEDIUM]: 150,
  [RODIN_TIER.HIGH]: 240,
  [RODIN_TIER.EXTREME_HIGH]: 480,
} as const

/** Mesh surface style — maps to the `mesh_mode` API parameter */
export const RODIN_MESH_MODE = {
  SMOOTH: 'Rodin',
  HARD_SURFACE: 'Rodin-Hard',
} as const

export const RODIN_MESH_MODES = [
  RODIN_MESH_MODE.SMOOTH,
  RODIN_MESH_MODE.HARD_SURFACE,
] as const

export type RodinMeshMode = (typeof RODIN_MESH_MODES)[number]

/** Texture pipeline — maps to the `texture_mode` API parameter */
export const RODIN_TEXTURE_MODE = {
  PBR: 'PBR',
  BAKED: 'Baked',
} as const

export const RODIN_TEXTURE_MODES = [
  RODIN_TEXTURE_MODE.PBR,
  RODIN_TEXTURE_MODE.BAKED,
] as const

export type RodinTextureMode = (typeof RODIN_TEXTURE_MODES)[number]

/** Material workflow — maps to the `material` API parameter */
export const RODIN_MATERIAL = {
  METALLIC_ROUGHNESS: 'Metallic Roughness',
  ALBEDO: 'Albedo',
} as const

export const RODIN_MATERIALS = [
  RODIN_MATERIAL.METALLIC_ROUGHNESS,
  RODIN_MATERIAL.ALBEDO,
] as const

export type RodinMaterial = (typeof RODIN_MATERIALS)[number]

/**
 * quality_override polygon-count constraints by geometry mode.
 * Rodin always outputs GLB; geometry_file_format is set to 'glb' internally.
 */
export const RODIN_QUALITY_OVERRIDE = {
  QUAD: { min: 1_000, max: 200_000 },
  RAW_STANDARD: { min: 500, max: 1_000_000 },
  RAW_HIGH: { min: 20_000, max: 2_000_000 },
} as const

/** Maximum number of reference images Rodin accepts (primary + additional) */
export const RODIN_MAX_REFERENCE_IMAGES = 5
