import { API_ENDPOINTS } from '@/constants/config'
import type { PromptTagDefinition } from '@/types/prompt-tags'

import { getErrorMessage } from '@/lib/api-client/shared'

interface PromptTagSearchResponse {
  success: boolean
  data?: PromptTagDefinition[]
  error?: string
}

export async function searchModelKeywordPromptTagsAPI(params: {
  query: string
  limit?: number
}): Promise<PromptTagSearchResponse> {
  try {
    const query = new URLSearchParams()
    query.set('query', params.query)
    if (params.limit !== undefined) {
      query.set('limit', String(params.limit))
    }

    const response = await fetch(
      `${API_ENDPOINTS.PROMPT_TAGS_MODEL_KEYWORD}?${query.toString()}`,
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
    return (await response.json()) as PromptTagSearchResponse
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    }
  }
}
