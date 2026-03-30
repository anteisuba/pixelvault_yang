import type {
  CreatorProfilePageResponse,
  ToggleFollowResponse,
  ToggleLikeResponse,
  UpdateProfileRequest,
  UpdateProfileResponse,
  UploadProfileImageResponse,
} from '@/types'
import { API_ENDPOINTS } from '@/constants/config'

import { getErrorMessage, getErrorPayload } from '@/lib/api-client/shared'

export async function getCreatorProfileAPI(
  username: string,
  page: number = 1,
  limit?: number,
): Promise<CreatorProfilePageResponse> {
  try {
    const params = new URLSearchParams({ page: String(page) })
    if (limit) params.set('limit', String(limit))
    const response = await fetch(
      `${API_ENDPOINTS.USERS}/${encodeURIComponent(username)}?${params.toString()}`,
    )
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, 'Failed to fetch profile'),
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

export async function getMyProfileAPI(): Promise<UpdateProfileResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.USER_PROFILE)
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, 'Failed to fetch profile'),
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

export async function updateProfileAPI(
  data: UpdateProfileRequest,
): Promise<UpdateProfileResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.USER_PROFILE, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      const payload = await getErrorPayload(response, 'Failed to update profile')
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
      error:
        error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}

export async function syncAvatarAPI(): Promise<{
  success: boolean
  data?: { avatarUrl: string | null }
  error?: string
}> {
  try {
    const response = await fetch(API_ENDPOINTS.AVATAR_SYNC, { method: 'POST' })
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, 'Failed to sync avatar'),
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

export async function uploadAvatarAPI(
  imageData: string,
): Promise<UploadProfileImageResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.UPLOAD_AVATAR, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageData }),
    })
    if (!response.ok) {
      const payload = await getErrorPayload(response, 'Failed to upload avatar')
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
      error:
        error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}

export async function uploadBannerAPI(
  imageData: string,
): Promise<UploadProfileImageResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.UPLOAD_BANNER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageData }),
    })
    if (!response.ok) {
      const payload = await getErrorPayload(response, 'Failed to upload banner')
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
      error:
        error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}

export async function toggleLikeAPI(
  generationId: string,
): Promise<ToggleLikeResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.LIKES, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generationId }),
    })
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, 'Failed to toggle like'),
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

export async function toggleFollowAPI(
  targetUserId: string,
): Promise<ToggleFollowResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.FOLLOWS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId }),
    })
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, 'Failed to toggle follow'),
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
