import { API_ENDPOINTS } from '@/constants/config'
import { getErrorMessage } from '@/lib/api-client/shared'
import type {
  AssistantMentionLibraryItem,
  AssistantMentionLibraryResult,
} from '@/types/assistant-mention'

type Result<T> = { success: true; data: T } | { success: false; error: string }

/** `@` 菜单的素材库检索（多字段 + 文件夹下钻）。 */
export async function searchAssistantMentionLibraryAPI(
  input: { q: string; folderId?: string; limit?: number },
  signal?: AbortSignal,
): Promise<Result<AssistantMentionLibraryResult>> {
  try {
    const params = new URLSearchParams()
    if (input.q) params.set('q', input.q)
    if (input.folderId) params.set('folderId', input.folderId)
    if (input.limit) params.set('limit', String(input.limit))
    const response = await fetch(
      `${API_ENDPOINTS.ASSISTANT_MENTIONS}?${params.toString()}`,
      { signal },
    )
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Failed with status ${response.status}`,
        ),
      }
    }
    return await response.json()
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}

/** 按地址查参考位在库里叫什么；或按图的编号（`seqs`）查那几张。 */
export async function lookupAssistantMentionAssetsAPI(
  urls: readonly string[],
  seqs: readonly number[] = [],
): Promise<Result<AssistantMentionLibraryItem[]>> {
  try {
    const response = await fetch(API_ENDPOINTS.ASSISTANT_MENTIONS_LOOKUP, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(urls.length ? { urls } : {}),
        ...(seqs.length ? { seqs } : {}),
      }),
    })
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Failed with status ${response.status}`,
        ),
      }
    }
    return await response.json()
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}
