import { AI_MODELS } from '@/constants/models'
import type { VideoScriptVideoModel } from '@/constants/video-script'

export const MAX_SCENE_RETRIES = 2
export const SCENE_GENERATION_TIMEOUT_MS = 180_000
export const SCENE_POLL_INTERVAL_MS = 3_000

export const VIDEO_SCENE_DEFAULT_ASPECT_RATIO = '16:9'

export const VIDEO_SCRIPT_MODEL_TO_GENERATION_MODEL_ID: Record<
  VideoScriptVideoModel,
  AI_MODELS
> = {
  'seedance-2-fast': AI_MODELS.SEEDANCE_20_FAST,
  'kling-pro': AI_MODELS.KLING_V3_PRO,
}
