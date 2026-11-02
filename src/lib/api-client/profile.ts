import type {
  CreatorProfilePageResponse,
  ToggleFollowResponse,
  ToggleLikeResponse,
  UpdateProfileRequest,
  UpdateProfileResponse,
  UploadProfileImageResponse,
} from '@/types'
import { API_ENDPOINTS, CLIENT_API } from '@/constants/config'

import { getErrorPayload } from '@/lib/api-client/shared'
import { getThrownErrorFields } from '@/lib/api-client/error-fields'
import { apiFetch } from '@/lib/api-client/api-fetch'

export async function getCreatorProfileAPI(
  username: string,
  page: number = 1,
  limit?: number,
  cursor?: string | null,
): Promise<CreatorProfilePageResponse> {
  try {
    const params = new URLSearchParams({ page: String(page) })
    if (limit) params.set('limit', String(limit))
    if (cursor) params.set('cursor', cursor)
    const response = await apiFetch(
      `${API_ENDPOINTS.USERS}/${encodeURIComponent(username)}?${params.toString()}`,
    )
    if (!response.ok) {
      return {
        success: false,
        ...(await getErrorPayload(response)),
      }
    }
    return await response.json()
  } catch (error) {
    return {
      success: false,
      ...getThrownErrorFields(error),
    }
  }
}

export async function getMyProfileAPI(): Promise<UpdateProfileResponse> {
  try {
    const response = await apiFetch(API_ENDPOINTS.USER_PROFILE)
    if (!response.ok) {
      return {
        success: false,
        ...(await getErrorPayload(response)),
      }
    }
    return await response.json()
  } catch (error) {
    return {
      success: false,
      ...getThrownErrorFields(error),
    }
  }
}

export async function updateProfileAPI(
  data: UpdateProfileRequest,
): Promise<UpdateProfileResponse> {
  try {
    const response = await apiFetch(API_ENDPOINTS.USER_PROFILE, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      const payload = await getErrorPayload(response)
      return {
        success: false,
        error: payload.error,
        errorCode: payload.errorCode,
        i18nKey: payload.i18nKey,
      }
    }
    return await response.json()
  } catch (error) {
    return {
      success: false,
      ...getThrownErrorFields(error),
    }
  }
}

export async function syncAvatarAPI(): Promise<{
  success: boolean
  data?: { avatarUrl: string | null }
  error?: string
}> {
  try {
    const response = await apiFetch(API_ENDPOINTS.AVATAR_SYNC, {
      method: 'POST',
    })
    if (!response.ok) {
      return {
        success: false,
        ...(await getErrorPayload(response)),
      }
    }
    return await response.json()
  } catch (error) {
    return {
      success: false,
      ...getThrownErrorFields(error),
    }
  }
}

export async function uploadAvatarAPI(
  imageData: string,
): Promise<UploadProfileImageResponse> {
  try {
    const response = await apiFetch(API_ENDPOINTS.UPLOAD_AVATAR, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageData }),
    })
    if (!response.ok) {
      const payload = await getErrorPayload(response)
      return {
        success: false,
        error: payload.error,
        errorCode: payload.errorCode,
        i18nKey: payload.i18nKey,
      }
    }
    return await response.json()
  } catch (error) {
    return {
      success: false,
      ...getThrownErrorFields(error),
    }
  }
}

export async function uploadBannerAPI(
  imageData: string,
): Promise<UploadProfileImageResponse> {
  try {
    const response = await apiFetch(API_ENDPOINTS.UPLOAD_BANNER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageData }),
    })
    if (!response.ok) {
      const payload = await getErrorPayload(response)
      return {
        success: false,
        error: payload.error,
        errorCode: payload.errorCode,
        i18nKey: payload.i18nKey,
      }
    }
    return await response.json()
  } catch (error) {
    return {
      success: false,
      ...getThrownErrorFields(error),
    }
  }
}

export async function toggleLikeAPI(
  generationId: string,
): Promise<ToggleLikeResponse> {
  try {
    const response = await apiFetch(API_ENDPOINTS.LIKES, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generationId }),
      signal: AbortSignal.timeout(CLIENT_API.ACTION_TIMEOUT_MS),
    })
    if (!response.ok) {
      return {
        success: false,
        ...(await getErrorPayload(response)),
      }
    }
    return await response.json()
  } catch (error) {
    return {
      success: false,
      ...getThrownErrorFields(error),
    }
  }
}

export async function batchGetLikesAPI(generationIds: string[]): Promise<{
  success: boolean
  data?: { likedIds: string[] }
  error?: string
}> {
  try {
    const ids = generationIds.join(',')
    const response = await apiFetch(
      `${API_ENDPOINTS.LIKES}?ids=${encodeURIComponent(ids)}`,
    )
    if (!response.ok) {
      return { success: false, error: 'Failed to fetch likes' }
    }
    return await response.json()
  } catch (error) {
    return {
      success: false,
      ...getThrownErrorFields(error),
    }
  }
}

export async function toggleFollowAPI(
  targetUserId: string,
): Promise<ToggleFollowResponse> {
  try {
    const response = await apiFetch(API_ENDPOINTS.FOLLOWS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId }),
    })
    if (!response.ok) {
      return {
        success: false,
        ...(await getErrorPayload(response)),
      }
    }
    return await response.json()
  } catch (error) {
    return {
      success: false,
      ...getThrownErrorFields(error),
    }
  }
}
