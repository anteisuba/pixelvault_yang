import { API_ENDPOINTS } from '@/constants/config'
import { VOICE_ROOM_CHAT_EVENT } from '@/constants/voiceroom'
import { getErrorMessage, getErrorPayload } from '@/lib/api-client/shared'
import { parseSseStream } from '@/lib/sse'
import type { AssistantOperatorMissingKey } from '@/types/assistant-operator'
import type {
  CreateVoiceLineRequest,
  CreateVoiceRoomRequest,
  RetakeVoiceLineRequest,
  UpdateVoiceRoomRequest,
  VoiceLineRecord,
  VoiceRoomChatRequest,
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

export interface VoiceRoomChatHandlers {
  /** 你那句落库了。 */
  onUserLine?: (line: VoiceLineRecord) => void
  /** 她的回复又到了一段。 */
  onDelta?: (text: string) => void
}

export interface VoiceRoomChatResult {
  /** 她那句（声音多半还在路上）。没写完就失败了 = undefined。 */
  reply?: VoiceLineRecord
  error?: string
  /**
   * 开流之前就失败了才有（`errorCode` / `missingKey`）：那时失败的只可能是房间、说话人或
   * **助手那一家的 key**——界面据此就地开 `QuickSetupDialog`（Hard Rule 8）。开流之后的失败
   * （比如出声那家缺 key）⛔ 不带它们，免得配错了家。
   */
  errorCode?: string
  missingKey?: AssistantOperatorMissingKey
}

function readErrorFrame(data: string): string {
  try {
    const payload = JSON.parse(data) as { error?: unknown }
    return typeof payload.error === 'string' ? payload.error : 'Chat failed'
  } catch {
    return 'Chat failed'
  }
}

/**
 * 聊天模式：你说一句，她回一句（SSE，事件见 `VOICE_ROOM_CHAT_EVENT`）。
 * 失败**返回**而不是抛出，与这一层其余方法一致；回复落库了但没出声时，`reply` 和 `error` 都有。
 */
export async function chatVoiceRoomAPI(
  body: VoiceRoomChatRequest,
  handlers: VoiceRoomChatHandlers = {},
  signal?: AbortSignal,
): Promise<VoiceRoomChatResult> {
  try {
    const response = await fetch(API_ENDPOINTS.VOICEROOM_CHAT, {
      ...jsonBody(body),
      signal,
    })
    if (!response.ok) {
      const payload = await getErrorPayload(
        response,
        `Failed with status ${response.status}`,
      )
      return {
        error: payload.error,
        ...(payload.errorCode ? { errorCode: payload.errorCode } : {}),
        ...(payload.missingKey ? { missingKey: payload.missingKey } : {}),
      }
    }
    if (!response.body) return { error: 'Empty chat stream' }

    let reply: VoiceLineRecord | undefined
    let failure: string | undefined
    for await (const frame of parseSseStream(response.body)) {
      if (frame.event === VOICE_ROOM_CHAT_EVENT.USER) {
        handlers.onUserLine?.(
          (JSON.parse(frame.data) as { line: VoiceLineRecord }).line,
        )
      } else if (frame.event === VOICE_ROOM_CHAT_EVENT.DELTA) {
        handlers.onDelta?.((JSON.parse(frame.data) as { text: string }).text)
      } else if (frame.event === VOICE_ROOM_CHAT_EVENT.REPLY) {
        reply = (JSON.parse(frame.data) as { line: VoiceLineRecord }).line
      } else if (frame.event === VOICE_ROOM_CHAT_EVENT.ERROR) {
        failure = readErrorFrame(frame.data)
      }
    }
    if (!reply && !failure) return { error: 'The chat ended before the reply' }
    return { reply, ...(failure ? { error: failure } : {}) }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Network error',
    }
  }
}
