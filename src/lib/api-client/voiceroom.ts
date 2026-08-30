import { API_ENDPOINTS } from '@/constants/config'
import { getErrorMessage } from '@/lib/api-client/shared'
import type {
  CreateVoiceLineRequest,
  CreateVoiceRoomRequest,
  RetakeVoiceLineRequest,
  UpdateVoiceRoomRequest,
  VoiceLineRecord,
  VoiceRoomDetail,
  VoiceRoomRecord,
} from '@/types/voiceroom'

/** 配音间的 API 客户端。组件一律走这里，不自己 fetch。 */

interface ApiResult<T> {
  success: boolean
  data?: T
  error?: string
  errorCode?: string
}

/**
 * 这一层的每个方法都是同一套 try / 非 2xx / catch，写七遍只会让第八遍写错。
 * 失败**返回**而不是抛出，与其余 api-client 一致。
 */
async function request<T>(
  url: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, init)
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Failed with status ${response.status}`,
        ),
      }
    }
    return (await response.json()) as ApiResult<T>
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    }
  }
}

function jsonBody(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

export async function listVoiceRoomsAPI(): Promise<
  ApiResult<VoiceRoomRecord[]>
> {
  return request<VoiceRoomRecord[]>(API_ENDPOINTS.VOICEROOM_ROOMS)
}

export async function createVoiceRoomAPI(
  body: CreateVoiceRoomRequest,
): Promise<ApiResult<VoiceRoomRecord>> {
  return request<VoiceRoomRecord>(API_ENDPOINTS.VOICEROOM_ROOMS, jsonBody(body))
}

export async function getVoiceRoomAPI(
  roomId: string,
): Promise<ApiResult<VoiceRoomDetail>> {
  return request<VoiceRoomDetail>(`${API_ENDPOINTS.VOICEROOM_ROOMS}/${roomId}`)
}

export async function updateVoiceRoomAPI({
  roomId,
  ...body
}: UpdateVoiceRoomRequest): Promise<ApiResult<VoiceRoomRecord>> {
  return request<VoiceRoomRecord>(
    `${API_ENDPOINTS.VOICEROOM_ROOMS}/${roomId}`,
    {
      ...jsonBody(body),
      method: 'PATCH',
    },
  )
}

export async function deleteVoiceRoomAPI(
  roomId: string,
): Promise<ApiResult<never>> {
  return request<never>(`${API_ENDPOINTS.VOICEROOM_ROOMS}/${roomId}`, {
    method: 'DELETE',
  })
}

/** 说一句话。返回的台词此刻多半还在 QUEUED / RUNNING——声音要轮询才有。 */
export async function createVoiceLineAPI(
  body: CreateVoiceLineRequest,
): Promise<ApiResult<VoiceLineRecord>> {
  return request<VoiceLineRecord>(API_ENDPOINTS.VOICEROOM_LINES, jsonBody(body))
}

/** 重录：换情感，或改词。 */
export async function retakeVoiceLineAPI({
  lineId,
  ...body
}: RetakeVoiceLineRequest): Promise<ApiResult<VoiceLineRecord>> {
  return request<VoiceLineRecord>(
    `${API_ENDPOINTS.VOICEROOM_LINES}/${lineId}`,
    {
      ...jsonBody(body),
      method: 'PATCH',
    },
  )
}
