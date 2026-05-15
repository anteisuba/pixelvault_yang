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

export const MODEL_3D_JOB_STAGE = {
  SINGLE_RUNNING: 'SINGLE_RUNNING',
  MESH_RUNNING: 'MESH_RUNNING',
  TEXTURE_RUNNING: 'TEXTURE_RUNNING',
} as const

export const MODEL_3D_JOB_STAGES = [
  MODEL_3D_JOB_STAGE.SINGLE_RUNNING,
  MODEL_3D_JOB_STAGE.MESH_RUNNING,
  MODEL_3D_JOB_STAGE.TEXTURE_RUNNING,
] as const

export type Model3DJobStage = (typeof MODEL_3D_JOB_STAGES)[number]

export const MODEL_3D_PROGRESS_STAGES = ['queued', 'mesh', 'texture'] as const

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
  STORAGE_KEY_PREFIX: 'pixelvault:studio3d:multiview:v1',
  DEFAULT_MODEL_KEY: 'default',
  TTL_MS: 1000 * 60 * 60 * 12,
} as const
