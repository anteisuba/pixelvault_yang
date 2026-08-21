import { VISION_ANALYZE_ENDPOINT } from '@/constants/vision'
import { getErrorPayload } from '@/lib/api-client/shared'
import type { VisionAnalysisResult, VisionAnalyzeRequest } from '@/types/vision'

type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; errorCode?: string; i18nKey?: string }

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
  try {
    const response = await fetch(VISION_ANALYZE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      const payload = await getErrorPayload(
        response,
        `Vision analysis failed (${response.status})`,
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
      data?: VisionAnalysisResult
      error?: string
    }
    if (!body.success || !body.data) {
      return { success: false, error: body.error ?? 'Vision analysis failed' }
    }
    return { success: true, data: body.data }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Vision analysis failed',
    }
  }
}
