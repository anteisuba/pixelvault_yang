import { API_ENDPOINTS } from '@/constants/config'
import { getErrorPayload } from '@/lib/api-client/shared'
import type {
  AssistantPersona,
  CreateProjectRuleInput,
  ProjectRule,
  UpdateAssistantPersonaRequest,
} from '@/types/assistant-persona'

/**
 * 助手设置（persona）与项目规则的客户端封装
 * （`docs/references/pages/assistant-shell.md` §8 / §10）。
 *
 * Hard Rule 3：组件不 `fetch`，所有请求走这一层。
 */

type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; errorCode?: string; i18nKey?: string }

async function parseJsonResult<T>(
  response: Response,
  fallbackError: string,
): Promise<ApiResult<T>> {
  if (!response.ok) {
    const payload = await getErrorPayload(response, fallbackError)
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
  if (!body.success || body.data === undefined) {
    return { success: false, error: body.error ?? fallbackError }
  }
  return { success: true, data: body.data }
}

function toFailure(error: unknown, fallback: string): ApiResult<never> {
  return {
    success: false,
    error: error instanceof Error ? error.message : fallback,
  }
}

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const

export async function getAssistantPersonaAPI(): Promise<
  ApiResult<AssistantPersona>
> {
  try {
    const response = await fetch(API_ENDPOINTS.ASSISTANT_PERSONA, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    return await parseJsonResult(response, 'Failed to load assistant settings')
  } catch (error) {
    return toFailure(error, 'Failed to load assistant settings')
  }
}

export async function updateAssistantPersonaAPI(
  persona: UpdateAssistantPersonaRequest,
): Promise<ApiResult<AssistantPersona>> {
  try {
    const response = await fetch(API_ENDPOINTS.ASSISTANT_PERSONA, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify(persona),
    })
    return await parseJsonResult(response, 'Failed to save assistant settings')
  } catch (error) {
    return toFailure(error, 'Failed to save assistant settings')
  }
}

/** ⚠ `imageData` 是 data URL 或 http 地址 —— 与账户头像那条路逐字同形。 */
export async function uploadAssistantAvatarAPI(
  imageData: string,
): Promise<ApiResult<{ url: string }>> {
  try {
    const response = await fetch(API_ENDPOINTS.ASSISTANT_PERSONA_AVATAR, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ imageData }),
    })
    return await parseJsonResult(response, 'Failed to upload avatar')
  } catch (error) {
    return toFailure(error, 'Failed to upload avatar')
  }
}

export async function removeAssistantAvatarAPI(): Promise<
  ApiResult<{ removed: boolean }>
> {
  try {
    const response = await fetch(API_ENDPOINTS.ASSISTANT_PERSONA_AVATAR, {
      method: 'DELETE',
      headers: JSON_HEADERS,
      body: JSON.stringify({}),
    })
    return await parseJsonResult(response, 'Failed to remove avatar')
  } catch (error) {
    return toFailure(error, 'Failed to remove avatar')
  }
}

export async function listProjectRulesAPI(
  scope?: string,
): Promise<ApiResult<ProjectRule[]>> {
  try {
    const query = scope ? `?scope=${encodeURIComponent(scope)}` : ''
    const response = await fetch(`${API_ENDPOINTS.ASSISTANT_RULES}${query}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    return await parseJsonResult(response, 'Failed to load rules')
  } catch (error) {
    return toFailure(error, 'Failed to load rules')
  }
}

export async function createProjectRuleAPI(
  input: CreateProjectRuleInput,
): Promise<ApiResult<ProjectRule>> {
  try {
    const response = await fetch(API_ENDPOINTS.ASSISTANT_RULES, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
    })
    return await parseJsonResult(response, 'Failed to save rule')
  } catch (error) {
    return toFailure(error, 'Failed to save rule')
  }
}

export async function deleteProjectRuleAPI(
  ruleId: string,
): Promise<ApiResult<unknown>> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.ASSISTANT_RULES}/${encodeURIComponent(ruleId)}`,
      { method: 'DELETE' },
    )
    return await parseJsonResult(response, 'Failed to delete rule')
  } catch (error) {
    return toFailure(error, 'Failed to delete rule')
  }
}
