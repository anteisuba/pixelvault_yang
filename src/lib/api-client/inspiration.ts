import { API_ENDPOINTS } from '@/constants/config'
import type {
  CloneInspirationRequest,
  InspirationRecord,
  InspirationSortBy,
  ListInspirationsResponse,
  RecipeRecord,
} from '@/types'

import { getErrorMessage } from '@/lib/api-client/shared'

export interface InspirationApiResponse<TData> {
  success: boolean
  data?: TData
  error?: string
}

export interface ListInspirationsArgs {
  category?: string
  query?: string
  sortBy?: InspirationSortBy
  limit?: number
  offset?: number
}

function getUnexpectedErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred'
}

export async function listInspirationsAPI(
  args: ListInspirationsArgs = {},
): Promise<InspirationApiResponse<ListInspirationsResponse>> {
  try {
    const params = new URLSearchParams()
    if (args.category) params.set('category', args.category)
    if (args.query?.trim()) params.set('query', args.query.trim())
    if (args.sortBy) params.set('sortBy', args.sortBy)
    if (args.limit != null) params.set('limit', String(args.limit))
    if (args.offset != null) params.set('offset', String(args.offset))

    const search = params.toString()
    const url = search
      ? `${API_ENDPOINTS.INSPIRATION}?${search}`
      : API_ENDPOINTS.INSPIRATION

    const response = await fetch(url)

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
    return { success: false, error: getUnexpectedErrorMessage(error) }
  }
}

export async function cloneInspirationAPI(
  id: string,
  overrides: CloneInspirationRequest = {},
): Promise<InspirationApiResponse<RecipeRecord>> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.INSPIRATION}/${encodeURIComponent(id)}/clone`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(overrides),
      },
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
    return { success: false, error: getUnexpectedErrorMessage(error) }
  }
}

export type { InspirationRecord }
