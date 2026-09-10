import {
  RENDER_API_ENDPOINTS,
  renderCancelEndpoint,
  renderJobEndpoint,
  type RenderJobStatusId,
  type RenderStepId,
} from '@/constants/render-video'

import { getErrorMessage } from '@/lib/api-client/shared'

/**
 * 剪辑台渲染层的客户端出口（S9）。
 *
 * ⚠ 组件里**不许**直接 `fetch`（Hard Rule 3）—— 剪辑台的导出、轮询、取消三条路
 * 都从这里走。
 */

export interface RenderJobResponse {
  readonly jobId: string
  readonly status: RenderJobStatusId
  readonly progress?: number
  readonly step?: RenderStepId
  readonly name: string
  readonly url?: string
  readonly thumbnailUrl?: string
  readonly durationSec?: number
  readonly generationId?: string
  readonly error?: string
}

export interface RenderApiResponse<TData> {
  success: boolean
  data?: TData
  error?: string
  errorCode?: string
  /** 有值 = 服务端真的回了一个响应；没有 = `fetch` 自己抛了（请求没到）。 */
  status?: number
}

function unexpected(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred'
}

async function readJson<TData>(
  response: Response,
): Promise<RenderApiResponse<TData>> {
  if (!response.ok) {
    return {
      success: false,
      status: response.status,
      error: await getErrorMessage(
        response,
        `Failed with status ${response.status}`,
      ),
    }
  }
  return (await response.json()) as RenderApiResponse<TData>
}

/** 入队。⚠ `plan` 由 `toRenderPlan()` 算出来，⛔ 别在组件里手拼。 */
export async function submitRenderAPI(body: {
  readonly plan: unknown
  readonly toCanvas: boolean
}): Promise<RenderApiResponse<RenderJobResponse>> {
  try {
    const response = await fetch(RENDER_API_ENDPOINTS.SUBMIT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return await readJson<RenderJobResponse>(response)
  } catch (error) {
    return { success: false, error: unexpected(error) }
  }
}

export async function getRenderJobAPI(
  jobId: string,
): Promise<RenderApiResponse<RenderJobResponse>> {
  try {
    return await readJson<RenderJobResponse>(
      await fetch(renderJobEndpoint(jobId)),
    )
  } catch (error) {
    return { success: false, error: unexpected(error) }
  }
}

export async function cancelRenderJobAPI(
  jobId: string,
): Promise<RenderApiResponse<RenderJobResponse>> {
  try {
    return await readJson<RenderJobResponse>(
      await fetch(renderCancelEndpoint(jobId), { method: 'POST' }),
    )
  } catch (error) {
    return { success: false, error: unexpected(error) }
  }
}
