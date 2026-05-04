import { API_ENDPOINTS } from '@/constants/config'
import type {
  CreateVoiceCardRequest,
  UpdateVoiceCardRequest,
  VoiceCardRecord,
} from '@/types'

import { getErrorMessage } from '@/lib/api-client/shared'

export interface VoiceCardApiResponse<TData> {
  success: boolean
  data?: TData
  error?: string
}

export type VoiceCardsApiResponse = VoiceCardApiResponse<{
  items: VoiceCardRecord[]
  total: number
}>

function getVoiceCardUrl(id: string): string {
  return `${API_ENDPOINTS.VOICE_CARDS}/${encodeURIComponent(id)}`
}

function getUnexpectedErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred'
}

export async function createVoiceCardAPI(
  data: CreateVoiceCardRequest,
): Promise<VoiceCardApiResponse<VoiceCardRecord>> {
  try {
    const response = await fetch(API_ENDPOINTS.VOICE_CARDS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
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
    return { success: false, error: getUnexpectedErrorMessage(error) }
  }
}

export async function listVoiceCardsAPI(
  page = 1,
  pageSize = 20,
): Promise<VoiceCardsApiResponse> {
  try {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    })
    const response = await fetch(`${API_ENDPOINTS.VOICE_CARDS}?${params}`)

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

export async function getVoiceCardAPI(
  id: string,
): Promise<VoiceCardApiResponse<VoiceCardRecord>> {
  try {
    const response = await fetch(getVoiceCardUrl(id))

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

export async function updateVoiceCardAPI(
  id: string,
  data: UpdateVoiceCardRequest,
): Promise<VoiceCardApiResponse<VoiceCardRecord>> {
  try {
    const response = await fetch(getVoiceCardUrl(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
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
    return { success: false, error: getUnexpectedErrorMessage(error) }
  }
}

export async function deleteVoiceCardAPI(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(getVoiceCardUrl(id), {
      method: 'DELETE',
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

    return { success: true }
  } catch (error) {
    return { success: false, error: getUnexpectedErrorMessage(error) }
  }
}
