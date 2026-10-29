import { API_ENDPOINTS } from '@/constants/config'
import { getErrorPayload } from '@/lib/api-client/shared'
import type {
  AssistantSkillView,
  CreateAssistantSkillRequest,
  UpdateAssistantSkillRequest,
  UpdateBuiltinSkillRequest,
} from '@/types/assistant-skill'
import { apiFetch } from '@/lib/api-client/api-fetch'

/**
 * 「你的技能」的客户端封装（助手第 7b 步）。Hard Rule 3：组件不 `fetch`，走这一层。
 * 改动都回整套（删除除外：回 null，界面再拉一次）。
 */

type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; errorCode?: string; i18nKey?: string }

async function call<T>(
  url: string,
  init: RequestInit,
  fallback: string,
): Promise<ApiResult<T>> {
  try {
    const response = await apiFetch(url, init)
    if (!response.ok) {
      const payload = await getErrorPayload(response, fallback)
      return {
        success: false,
        error: payload.error,
        errorCode: payload.errorCode,
        i18nKey: payload.i18nKey,
      }
    }
    const body = (await response.json()) as {
      success?: boolean
      data?: T
      error?: string
    }
    if (!body.success || body.data === undefined)
      return { success: false, error: body.error ?? fallback }
    return { success: true, data: body.data }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : fallback,
    }
  }
}

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const
const skillUrl = (id: string) =>
  `${API_ENDPOINTS.ASSISTANT_SKILLS}/${encodeURIComponent(id)}`

export function listAssistantSkillsAPI() {
  return call<AssistantSkillView[]>(
    API_ENDPOINTS.ASSISTANT_SKILLS,
    { method: 'GET', headers: { Accept: 'application/json' } },
    'Failed to load skills',
  )
}

export function createAssistantSkillAPI(input: CreateAssistantSkillRequest) {
  return call<AssistantSkillView[]>(
    API_ENDPOINTS.ASSISTANT_SKILLS,
    { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) },
    'Failed to save skill',
  )
}

export function updateAssistantSkillAPI(
  id: string,
  input: UpdateAssistantSkillRequest,
) {
  return call<AssistantSkillView[]>(
    skillUrl(id),
    { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(input) },
    'Failed to save skill',
  )
}

export function deleteAssistantSkillAPI(id: string) {
  return call<null>(
    skillUrl(id),
    { method: 'DELETE' },
    'Failed to delete skill',
  )
}

export function updateBuiltinSkillAPI(input: UpdateBuiltinSkillRequest) {
  return call<AssistantSkillView[]>(
    `${API_ENDPOINTS.ASSISTANT_SKILLS}/builtin`,
    { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) },
    'Failed to save skill',
  )
}
