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
