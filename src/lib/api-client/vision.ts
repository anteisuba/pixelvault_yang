import type { VideoAnalysisMode } from '@/constants/video-analysis'
import {
  VISION_ANALYZE_ENDPOINT,
  VISION_ANALYZE_VIDEO_ENDPOINT,
} from '@/constants/vision'
import { getErrorPayload } from '@/lib/api-client/shared'
import type { VideoAnalyzeRequest } from '@/lib/video-frame-request'
import type { VisionAnalysisResult, VisionAnalyzeRequest } from '@/types/vision'

type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; errorCode?: string; i18nKey?: string }

/** 视频分析的额外两个字段（服务端如实回它走了哪条腿）。 */
export interface VideoAnalysisResult extends VisionAnalysisResult {
  mode: VideoAnalysisMode
  /** native 档超阈值自动降级了 —— UI 要如实说「只看了前 60 秒 / 降了帧率」。 */
  downgraded: boolean
}

async function postVisionJson<TRequest, TResult>(
  endpoint: string,
  request: TRequest,
  failureMessage: string,
): Promise<ApiResult<TResult>> {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      const payload = await getErrorPayload(
        response,
        `${failureMessage} (${response.status})`,
      )
      return {
        success: false,
        error: payload.error,
        errorCode: payload.errorCode,
        i18nKey: payload.i18nKey,
      }
    }

    const body = (await response.json()) as {
      success?: boolean
      data?: TResult
      error?: string
    }
    if (!body.success || !body.data) {
      return { success: false, error: body.error ?? failureMessage }
    }
    return { success: true, data: body.data }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : failureMessage,
    }
  }
}

/**
 * 视频的结构化分析（切片 2 §4.3）。
 *
 * 带 `frames` = 客户端已经按确定性计划抽好帧（`captureVideoFrames`），走 frames 档；
 * 不带 = 让服务端用能看视频的路直接看（YouTube 这类浏览器解不了的链接）。
 *
 * ⚠ 同样要把 `errorCode` 往上传：`ASSISTANT_VIDEO_UNSUPPORTED` 是 Hard Rule 8
 * 的入口 —— 一条能看视频的路都没有时，UI 该引用户去配一把 Gemini key。
 */
export async function analyzeVideoAPI(
  request: VideoAnalyzeRequest,
): Promise<ApiResult<VideoAnalysisResult>> {
  return postVisionJson<VideoAnalyzeRequest, VideoAnalysisResult>(
    VISION_ANALYZE_VIDEO_ENDPOINT,
    request,
    'Video analysis failed',
  )
}

/**
 * 结构化视觉分析（AI 导演内核 · 切片 2）。
 *
 * ⚠ **`errorCode` 一定要往上传**：`VISION_NO_CAPABLE_ROUTE` 是 Hard Rule 8 的入口
 * —— 用户一把能看图的 key 都没有时，UI 该弹 `QuickSetupDialog` 让他当场配一把，
 * 而不是弹一句「分析失败」的红条。把 errorCode 吞掉，这条路就断了。
 *
 * ⚠ 本模块**没有**挂进 `@/lib/api-client` 的桶文件（那个文件本轮有别的会话在改，
 * 两边同时动必撞）。消费方直接 `import { analyzeVisualAPI } from '@/lib/api-client/vision'`
 * —— 仓里已有先例（`prompt-tags` / `seedance-prompt-plan` / `generation-replay`）。
 */
export async function analyzeVisualAPI(
  request: VisionAnalyzeRequest,
): Promise<ApiResult<VisionAnalysisResult>> {
  return postVisionJson<VisionAnalyzeRequest, VisionAnalysisResult>(
    VISION_ANALYZE_ENDPOINT,
    request,
    'Vision analysis failed',
  )
}
