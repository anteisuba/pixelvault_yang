import type {
  FishAudioTranscription,
  FishAudioVoice,
  FishAudioVoiceListResult,
} from '@/services/fish-audio-voice.service'
import type { VoiceLibrarySortBy } from '@/constants/voice-cards'
import type { VoiceCardRecord } from '@/types'

interface VoiceListResponse {
  success: boolean
  data?: FishAudioVoiceListResult
  error?: string
  errorCode?: string
}

interface VoiceResponse {
  success: boolean
  data?: FishAudioVoice
  voiceCard?: VoiceCardRecord
  error?: string
  errorCode?: string
}

interface VoiceTranscriptionResponse {
  success: boolean
  data?: FishAudioTranscription
  error?: string
  errorCode?: string
}

export interface ReferenceAudioUpload {
  url: string
  sizeBytes: number
  mimeType: string
  fileName: string
}

interface ReferenceAudioUploadResponse {
  success: boolean
  data?: ReferenceAudioUpload
  error?: string
  errorCode?: string
}

/**
 * 取单个公开音色的详情——**要的是它自带的示例音频**。
 *
 * 系统音色的试听在声音库里本来就有（抽查 300 个只有 ~2% 没有），拿来直接用即可，
 * 不必再跑一次 TTS 合成：合成要花用户的 key、要等，而且产出的还是同一个音色念一段
 * 固定文本。这条路由用的是平台 key、无需登录、服务端缓存 5 分钟。
 */
export async function getVoiceAPI(voiceId: string): Promise<VoiceResponse> {
  try {
    const response = await fetch(`/api/voices/${encodeURIComponent(voiceId)}`)
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      return {
        success: false,
        errorCode: (payload as { errorCode?: string }).errorCode,
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

export async function listVoicesAPI(params: {
  self?: boolean
  page?: number
  pageSize?: number
  search?: string
  language?: string
  sortBy?: VoiceLibrarySortBy
}): Promise<VoiceListResponse> {
  try {
    const query = new URLSearchParams()
    if (params.self) query.set('self', 'true')
    if (params.page) query.set('page', String(params.page))
    if (params.pageSize) query.set('pageSize', String(params.pageSize))
    if (params.search) query.set('search', params.search)
    if (params.language) query.set('language', params.language)
    if (params.sortBy) query.set('sortBy', params.sortBy)

    const response = await fetch(`/api/voices?${query.toString()}`)
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      return {
        success: false,
        errorCode: (payload as { errorCode?: string }).errorCode,
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
        errorCode: (payload as { errorCode?: string }).errorCode,
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

export async function transcribeVoiceAPI(
  formData: FormData,
): Promise<VoiceTranscriptionResponse> {
  try {
    const response = await fetch('/api/voices/transcribe', {
      method: 'POST',
      body: formData,
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      return {
        success: false,
        errorCode: (payload as { errorCode?: string }).errorCode,
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

export async function uploadReferenceAudioAPI(
  file: File,
): Promise<ReferenceAudioUploadResponse> {
  try {
    const formData = new FormData()
    formData.append('audio', file)

    const response = await fetch('/api/voices/upload-reference', {
      method: 'POST',
      body: formData,
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      return {
        success: false,
        errorCode: (payload as { errorCode?: string }).errorCode,
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
