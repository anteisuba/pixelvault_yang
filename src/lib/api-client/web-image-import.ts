/**
 * 联网搜图候选的**确认转存**（P3-B 腿 B，Hard Rule 3：组件不 fetch）。
 *
 * ⚠ 单独一个文件而不是塞进 `api-client/generation.ts`：那份此刻是别的会话的在飞
 * 文件（音频直传那一片），而这条调用与它没有任何共享代码 —— 请求体是几个字符串，
 * 没有 File、没有 XHR 进度、没有直传三段式。
 *
 * ⛔ **请求体里永远只有 URL，没有字节**。客户端手里本来就只有一串第三方地址，
 * 字节由服务端去取（台账 BG：base64 进请求体 = Vercel 4.5MB 硬顶，一张 3.4MB 的
 * 图单独就能顶爆）。
 */

import { API_ENDPOINTS } from '@/constants/config'
import { getErrorPayload } from '@/lib/api-client/shared'
import type { GenerationRecord } from '@/types'
import type { WebImageImportRequest } from '@/types/web-image-import'

export type WebImageImportApiResponse =
  | { success: true; data: { generation: GenerationRecord } }
  | { success: false; error: string; errorCode?: string; i18nKey?: string }

/**
 * 把一张联网候选转存进用户自己的素材库。
 *
 * ⚠ 返回的 `i18nKey` 要一路传给 `getApiErrorMessage` —— 服务端对「取不到图」
 * （🔬 通用网图约三成 403）与「不是图片」给的是不同的键，吞掉它用户就只能看到
 * 一句笼统的「导入失败」，而这两种的下一步动作完全不同。
 */
export async function importWebImageAPI(
  request: WebImageImportRequest,
): Promise<WebImageImportApiResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.STUDIO_WEB_IMAGE_IMPORT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      const payload = await getErrorPayload(
        response,
        `Import failed with status ${response.status}`,
      )
      return {
        success: false,
        error: payload.error,
        ...(payload.errorCode ? { errorCode: payload.errorCode } : {}),
        ...(payload.i18nKey ? { i18nKey: payload.i18nKey } : {}),
      }
    }

    const payload = (await response.json()) as {
      success?: boolean
      data?: { generation: GenerationRecord }
      error?: string
    }
    if (!payload.success || !payload.data?.generation) {
      return {
        success: false,
        error: payload.error ?? 'Import returned no asset',
      }
    }
    return { success: true, data: { generation: payload.data.generation } }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}
