import { parseSseStream } from '@/lib/sse'
import {
  API_ENDPOINTS,
  IMAGE_GENERATION,
  GENERATION_POLL,
} from '@/constants/config'
import { AI_MODELS } from '@/constants/models'
import type {
  GenerationRecord,
  InpaintRequest,
  ObjectReplaceRequest,
} from '@/types'

import { getErrorPayload } from './shared'
import { getThrownErrorFields } from './error-fields'
import {
  cancelGenerationsAPI,
  checkImageGenerationStatusAPI,
} from './generation'
import { apiFetch } from '@/lib/api-client/api-fetch'

export interface ImageEditApiResult {
  imageUrl: string
  width: number
  height: number
  generation: GenerationRecord
}

export interface ImageEditApiResponse {
  success: boolean
  data?: ImageEditApiResult
  error?: string
  errorCode?: string
  i18nKey?: string
  /**
   * 我们的轮询窗口用完而任务还在 worker 里跑：不是失败，也没有错误码（⛔ 别再编
   * `callback_timeout`——那是服务端 sweeper 对「久未回调」的判定）。结果会进素材库。
   */
  pending?: true
}

export interface ImageEditStreamOptions {
  onPreview?: (url: string) => void
  signal?: AbortSignal
}

async function waitForImageEdit(
  jobId: string,
  signal?: AbortSignal,
): Promise<ImageEditApiResponse> {
  let cancelled = false
  let consecutiveTransient = 0
  const cancel = () => {
    if (!cancelled) {
      cancelled = true
      void cancelGenerationsAPI([jobId])
    }
  }
  signal?.addEventListener('abort', cancel, { once: true })
  try {
    for (
      let attempt = 0;
      attempt < IMAGE_GENERATION.MAX_POLL_ATTEMPTS;
      attempt += 1
    ) {
      if (signal?.aborted) {
        cancel()
        return { success: false, error: 'Image edit cancelled' }
      }
      const response = await checkImageGenerationStatusAPI(jobId, signal)
      if (signal?.aborted) {
        cancel()
        return { success: false, error: 'Image edit cancelled' }
      }
      if (!response.success || !response.data) {
        if (
          response.httpStatus &&
          response.httpStatus < 500 &&
          response.httpStatus !== 429
        ) {
          return {
            success: false,
            error: response.error,
            errorCode: response.errorCode,
            i18nKey: response.i18nKey,
          }
        }
        consecutiveTransient += 1
        if (consecutiveTransient >= GENERATION_POLL.TRANSIENT_TOLERANCE) break
      } else {
        consecutiveTransient = 0
      }
      if (response.success && response.data) {
        const data = response.data
        if (data.status === 'COMPLETED' && data.generation) {
          const generation = data.generation
          return {
            success: true,
            data: {
              imageUrl: generation.url,
              width: generation.width,
              height: generation.height,
              generation,
            },
          }
        }
        if (data.status === 'FAILED')
          return {
            success: false,
            error: data.error,
            errorCode: data.errorCode,
            i18nKey: data.i18nKey,
          }
        if (data.status === 'CANCELLED')
          return { success: false, error: 'Image edit cancelled' }
      }
      await new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timer)
          signal?.removeEventListener('abort', finish)
          resolve()
        }
        const timer = setTimeout(finish, IMAGE_GENERATION.POLL_INTERVAL_MS)
        signal?.addEventListener('abort', finish, { once: true })
        if (signal?.aborted) finish()
      })
    }
    return {
      success: false,
      error: 'Image edit is still running. Check the gallery for its result.',
      i18nKey: 'errors.provider.callbackTimeout',
      pending: true,
    }
  } finally {
    signal?.removeEventListener('abort', cancel)
  }
}

async function postImageEdit(
  endpoint: string,
  params: InpaintRequest | ObjectReplaceRequest,
  streamOptions?: ImageEditStreamOptions,
): Promise<ImageEditApiResponse> {
  try {
    const streaming =
      params.options?.preview === true &&
      params.modelId?.startsWith('gpt-image-')
    const response = await apiFetch(
      streaming ? API_ENDPOINTS.IMAGE_EDIT_STREAM : endpoint,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          streaming
            ? {
                ...params,
                action:
                  endpoint === API_ENDPOINTS.IMAGE_INPAINT
                    ? 'inpaint'
                    : 'object-replace',
              }
            : params,
        ),
        signal:
          params.modelId === AI_MODELS.IDEOGRAM_45
            ? undefined
            : streamOptions?.signal,
      },
    )

    if (!response.ok) {
      const payload = await getErrorPayload(response)
      return {
        success: false,
        error: payload.error,
        errorCode: payload.errorCode,
        i18nKey: payload.i18nKey,
      }
    }

    if (streaming) {
      if (!response.body)
        return { success: false, error: 'Empty image edit stream' }
      for await (const frame of parseSseStream(response.body)) {
        if (frame.event === 'preview') {
          const payload: { url?: unknown } = JSON.parse(frame.data)
          if (
            typeof payload.url === 'string' &&
            payload.url.startsWith('data:image/png;base64,')
          )
            streamOptions?.onPreview?.(payload.url)
        } else if (frame.event === 'completed') {
          return JSON.parse(frame.data) as ImageEditApiResponse
        } else if (frame.event === 'error') {
          return {
            ...(JSON.parse(frame.data) as ImageEditApiResponse),
            success: false,
          }
        }
      }
      return {
        success: false,
        error: 'Image edit stream ended before completion',
      }
    }
    const result = await response.json()
    if (result.success && typeof result.data?.jobId === 'string') {
      return waitForImageEdit(result.data.jobId, streamOptions?.signal)
    }
    return result
  } catch (error) {
    return {
      success: false,
      ...getThrownErrorFields(error),
    }
  }
}

export async function inpaintImageAPI(
  params: InpaintRequest,
  streamOptions?: ImageEditStreamOptions,
): Promise<ImageEditApiResponse> {
  return await postImageEdit(API_ENDPOINTS.IMAGE_INPAINT, params, streamOptions)
}

export async function objectReplaceAPI(
  params: ObjectReplaceRequest,
  streamOptions?: ImageEditStreamOptions,
): Promise<ImageEditApiResponse> {
  return await postImageEdit(
    API_ENDPOINTS.IMAGE_OBJECT_REPLACE,
    params,
    streamOptions,
  )
}
