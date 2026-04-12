import type {
  FishAudioVoice,
  FishAudioVoiceListResult,
} from '@/services/fish-audio-voice.service'

interface VoiceListResponse {
  success: boolean
  data?: FishAudioVoiceListResult
  error?: string
}

interface VoiceResponse {
  success: boolean
  data?: FishAudioVoice
  error?: string
}

export async function listVoicesAPI(params: {
  self?: boolean
  page?: number
  pageSize?: number
  search?: string
  language?: string
}): Promise<VoiceListResponse> {
  try {
    const query = new URLSearchParams()
    if (params.self) query.set('self', 'true')
    if (params.page) query.set('page', String(params.page))
    if (params.pageSize) query.set('pageSize', String(params.pageSize))
    if (params.search) query.set('search', params.search)
    if (params.language) query.set('language', params.language)

    const response = await fetch(`/api/voices?${query.toString()}`)
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      return {
        success: false,
        error:
          (payload as { error?: string }).error ??
          `Failed with status ${response.status}`,
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

export async function createVoiceAPI(
  formData: FormData,
): Promise<VoiceResponse> {
  try {
    const response = await fetch('/api/voices', {
      method: 'POST',
      body: formData,
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      return {
        success: false,
        error:
          (payload as { error?: string }).error ??
          `Failed with status ${response.status}`,
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

export async function deleteVoiceAPI(
  voiceId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`/api/voices/${voiceId}`, {
      method: 'DELETE',
    })
    if (!response.ok && response.status !== 204) {
      const payload = await response.json().catch(() => ({}))
      return {
        success: false,
        error:
          (payload as { error?: string }).error ??
          `Failed with status ${response.status}`,
      }
    }
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}
