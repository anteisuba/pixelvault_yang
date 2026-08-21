import { API_ENDPOINTS } from '@/constants/config'
import { getErrorPayload } from '@/lib/api-client/shared'
import type { ResearchRunDetail } from '@/types/research'

type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; errorCode?: string; i18nKey?: string }

/**
 * 按 id 取一次检索的证据与源级回执（AI 导演内核 · 切片 1）。
 *
 * **消费方是懒加载的**：回执卡展开、正文里的 `[n]` 引用被点开时才调 —— 一屏
 * 历史消息可能挂着十几个 runId，挂载即拉会把面板首屏变成十几个并发请求，
 * 而其中绝大多数用户根本不会点开。
 *
 * ⚠ 分享快照页（只读、无登录）**不调这条**：它没有登录态，调了只会拿到 401。
 * 那一页的行为是「不渲染回执卡」，不是「渲染一个报错的回执卡」。
 */
export async function getResearchRunAPI(
  runId: string,
): Promise<ApiResult<ResearchRunDetail>> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.RESEARCH_RUN}/${encodeURIComponent(runId)}`,
      { method: 'GET', headers: { Accept: 'application/json' } },
    )

    if (!response.ok) {
      const payload = await getErrorPayload(
        response,
        `Failed to load research run (${response.status})`,
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
      data?: ResearchRunDetail
      error?: string
    }
    if (!body.success || !body.data) {
      return {
        success: false,
        error: body.error ?? 'Failed to load research run',
      }
    }
    return { success: true, data: body.data }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to load research run',
    }
  }
}
