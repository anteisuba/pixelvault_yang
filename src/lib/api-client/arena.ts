import type {
  ArenaEntryRecord,
  ArenaHistoryResponse,
  ArenaLeaderboardResponse,
  ArenaMatchResponse,
  ArenaPersonalStatsResponse,
  ArenaVoteRequest,
  ArenaVoteResponse,
  CreateArenaMatchRequest,
  CreateArenaMatchResponse,
} from '@/types'
import { API_ENDPOINTS } from '@/constants/config'

import { getErrorMessage } from '@/lib/api-client/shared'

export async function createArenaMatchAPI(
  params: CreateArenaMatchRequest,
): Promise<CreateArenaMatchResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.ARENA_MATCHES, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, 'Match creation failed'),
      }
    }
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function generateArenaEntryAPI(
  matchId: string,
  params: {
    modelId: string
    apiKeyId?: string
    slotIndex: number
    advancedParams?: Record<string, unknown>
  },
): Promise<{ success: boolean; data?: ArenaEntryRecord; error?: string }> {
  const maxRetries = 4
  const baseDelay = 3000

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(
        `${API_ENDPOINTS.ARENA_MATCHES}/${matchId}/entries`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        },
      )
      if (response.status === 429 && attempt < maxRetries) {
        await new Promise((resolve) =>
          setTimeout(resolve, baseDelay * (attempt + 1)),
        )
        continue
      }
      if (!response.ok) {
        return {
          success: false,
          error: await getErrorMessage(response, 'Entry generation failed'),
        }
      }
      return await response.json()
    } catch (error) {
      if (attempt < maxRetries) {
        await new Promise((resolve) =>
          setTimeout(resolve, baseDelay * (attempt + 1)),
        )
        continue
      }
      const message =
        error instanceof Error ? error.message : 'An unexpected error occurred'
      return { success: false, error: message }
    }
  }

  return { success: false, error: 'Max retries exceeded' }
}

export async function getArenaMatchAPI(
  matchId: string,
): Promise<ArenaMatchResponse> {
  try {
    const response = await fetch(`${API_ENDPOINTS.ARENA_MATCHES}/${matchId}`)
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, 'Failed to fetch match'),
      }
    }
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function submitArenaVoteAPI(
  matchId: string,
  params: ArenaVoteRequest,
): Promise<ArenaVoteResponse> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.ARENA_MATCHES}/${matchId}/vote`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      },
    )
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, 'Vote failed'),
      }
    }
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function getArenaLeaderboardAPI(): Promise<ArenaLeaderboardResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.ARENA_LEADERBOARD)
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, 'Failed to fetch leaderboard'),
      }
    }
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function getArenaHistoryAPI(
  page: number = 1,
  limit?: number,
): Promise<ArenaHistoryResponse> {
  try {
    const params = new URLSearchParams({ page: String(page) })
    if (limit) params.set('limit', String(limit))
    const response = await fetch(
      `${API_ENDPOINTS.ARENA_HISTORY}?${params.toString()}`,
    )
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, 'Failed to fetch arena history'),
      }
    }
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function getArenaPersonalStatsAPI(): Promise<ArenaPersonalStatsResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.ARENA_PERSONAL_STATS)
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, 'Failed to fetch personal stats'),
      }
    }
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}
