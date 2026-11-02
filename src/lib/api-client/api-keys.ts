import type {
  ApiKeyResponse,
  ApiKeyVerifyResponse,
  ApiKeysResponse,
  CreateApiKeyRequest,
  UpdateApiKeyRequest,
  UsageSummary,
} from '@/types'
import { UsageSummarySchema } from '@/types'
import { API_ENDPOINTS } from '@/constants/config'

import { getErrorPayload } from '@/lib/api-client/shared'
import {
  getThrownErrorFields,
  ApiClientError,
} from '@/lib/api-client/error-fields'
import { apiFetch } from '@/lib/api-client/api-fetch'

export async function listApiKeys(): Promise<ApiKeysResponse> {
  try {
    const response = await apiFetch(API_ENDPOINTS.API_KEYS)
    if (!response.ok) {
      return {
        success: false,
        ...(await getErrorPayload(response)),
      }
    }
    return await response.json()
  } catch (error) {
    return { success: false, ...getThrownErrorFields(error) }
  }
}

export async function createApiKey(
  data: CreateApiKeyRequest,
): Promise<ApiKeyResponse> {
  try {
    const response = await apiFetch(API_ENDPOINTS.API_KEYS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      return {
        success: false,
        ...(await getErrorPayload(response)),
      }
    }
    return await response.json()
  } catch (error) {
    return { success: false, ...getThrownErrorFields(error) }
  }
}

export async function updateApiKey(
  id: string,
  data: UpdateApiKeyRequest,
): Promise<ApiKeyResponse> {
  try {
    const response = await apiFetch(`${API_ENDPOINTS.API_KEYS}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      return {
        success: false,
        ...(await getErrorPayload(response)),
      }
    }
    return await response.json()
  } catch (error) {
    return { success: false, ...getThrownErrorFields(error) }
  }
}

export async function deleteApiKey(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await apiFetch(`${API_ENDPOINTS.API_KEYS}/${id}`, {
      method: 'DELETE',
    })
    if (response.status === 204) return { success: true }
    if (!response.ok) {
      return {
        success: false,
        ...(await getErrorPayload(response)),
      }
    }
    return { success: true }
  } catch (error) {
    return { success: false, ...getThrownErrorFields(error) }
  }
}

export async function verifyApiKey(id: string): Promise<ApiKeyVerifyResponse> {
  try {
    const response = await apiFetch(`${API_ENDPOINTS.API_KEYS}/${id}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    if (!response.ok) {
      return {
        success: false,
        ...(await getErrorPayload(response)),
      }
    }
    return await response.json()
  } catch (error) {
    return { success: false, ...getThrownErrorFields(error) }
  }
}

export async function fetchUsageSummary(): Promise<UsageSummary> {
  const response = await apiFetch(API_ENDPOINTS.USAGE_SUMMARY)

  if (!response.ok) {
    throw new ApiClientError(await getErrorPayload(response))
  }

  return UsageSummarySchema.parse(await response.json())
}
