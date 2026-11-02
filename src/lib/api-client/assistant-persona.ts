import { API_ENDPOINTS } from '@/constants/config'
import { parseApiResult, toApiFailure } from '@/lib/api-client/shared'
import type {
  AssistantPersona,
  CreateProjectRuleInput,
  ProjectRule,
  UpdateAssistantPersonaRequest,
} from '@/types/assistant-persona'
import type {
  AssistantSpeakRequest,
  AssistantSpeakResponseData,
} from '@/types/assistant-speak'
import type {
  VoiceBenchData,
  VoiceBenchRewriteData,
  VoiceBenchRewriteRequest,
} from '@/types/voice-bench'
import { apiFetch } from '@/lib/api-client/api-fetch'

/**
 * 助手设置（persona）与项目规则的客户端封装
 * （`docs/references/pages/assistant-shell.md` §8 / §10）。
 *
 * Hard Rule 3：组件不 `fetch`，所有请求走这一层。
 */

type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; errorCode?: string; i18nKey?: string }

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const

export async function getAssistantPersonaAPI(): Promise<
  ApiResult<AssistantPersona>
> {
  try {
    const response = await apiFetch(API_ENDPOINTS.ASSISTANT_PERSONA, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    return await parseApiResult(response)
  } catch (error) {
    return toApiFailure(error)
  }
}

export async function updateAssistantPersonaAPI(
  persona: UpdateAssistantPersonaRequest,
): Promise<ApiResult<AssistantPersona>> {
  try {
    const response = await apiFetch(API_ENDPOINTS.ASSISTANT_PERSONA, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify(persona),
    })
    return await parseApiResult(response)
  } catch (error) {
    return toApiFailure(error)
  }
}

/** 对话里 🔊 念她的回复（②c-2）：派任务，回 jobId（等它好走 `checkAudioStatusAPI`）。 */
export async function speakAssistantReplyAPI(
  request: AssistantSpeakRequest,
): Promise<ApiResult<AssistantSpeakResponseData>> {
  try {
    const response = await apiFetch(API_ENDPOINTS.ASSISTANT_SPEAK, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(request),
    })
    return await parseApiResult(response)
  } catch (error) {
    return toApiFailure(error)
  }
}

/** 配音台（③）：现在这一位的嗓子念过的台词。 */
export async function getVoiceBenchAPI(): Promise<ApiResult<VoiceBenchData>> {
  try {
    const response = await apiFetch(API_ENDPOINTS.VOICE_BENCH, {
      cache: 'no-store',
    })
    return await parseApiResult(response)
  } catch (error) {
    return toApiFailure(error)
  }
}

/** 配音台「按她说」（③-2a）：把输入框里那几行改成她的口吻。 */
export async function rewriteVoiceBenchTextAPI(
  request: VoiceBenchRewriteRequest,
): Promise<ApiResult<VoiceBenchRewriteData>> {
  try {
    const response = await apiFetch(API_ENDPOINTS.VOICE_BENCH_REWRITE, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(request),
    })
    return await parseApiResult(response)
  } catch (error) {
    return toApiFailure(error)
  }
}

/** ⚠ `imageData` 是 data URL 或 http 地址 —— 与账户头像那条路逐字同形。 */
export async function uploadAssistantAvatarAPI(
  imageData: string,
): Promise<ApiResult<{ url: string }>> {
  try {
    const response = await apiFetch(API_ENDPOINTS.ASSISTANT_PERSONA_AVATAR, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ imageData }),
    })
    return await parseApiResult(response)
  } catch (error) {
    return toApiFailure(error)
  }
}

export async function listProjectRulesAPI(
  scope?: string,
): Promise<ApiResult<ProjectRule[]>> {
  try {
    const query = scope ? `?scope=${encodeURIComponent(scope)}` : ''
    const response = await apiFetch(
      `${API_ENDPOINTS.ASSISTANT_RULES}${query}`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      },
    )
    return await parseApiResult(response)
  } catch (error) {
    return toApiFailure(error)
  }
}

export async function createProjectRuleAPI(
  input: CreateProjectRuleInput,
): Promise<ApiResult<ProjectRule>> {
  try {
    const response = await apiFetch(API_ENDPOINTS.ASSISTANT_RULES, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
    })
    return await parseApiResult(response)
  } catch (error) {
    return toApiFailure(error)
  }
}

export async function deleteProjectRuleAPI(
  ruleId: string,
): Promise<ApiResult<unknown>> {
  try {
    const response = await apiFetch(
      `${API_ENDPOINTS.ASSISTANT_RULES}/${encodeURIComponent(ruleId)}`,
      { method: 'DELETE' },
    )
    return await parseApiResult(response)
  } catch (error) {
    return toApiFailure(error)
  }
}
