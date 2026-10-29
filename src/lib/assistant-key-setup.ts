import {
  ASSISTANT_FREE_TIER_ROUTE_MODEL,
  getAssistantRouteModelEntry,
} from '@/constants/assistant-persona'
import {
  ASSISTANT_OPERATOR_MODEL_KEY_MISSING_CODE,
  ASSISTANT_PROVIDER_ERROR_CODES,
} from '@/constants/assistant-operator'
import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { AssistantOperatorMissingKey } from '@/types/assistant-operator'

/**
 * 助手那一家缺 key 时就地配**哪一家**（Hard Rule 8：`QuickSetupDialog`，⛔ 跳 `/settings/keys`）。
 * 助手面板的错误条与「满意」评估共用这一跳。
 */
export interface AssistantKeySetupTarget {
  /** `freeTier` = 一把 key 都没有；`pinnedModel` = 选定的那个模型缺 key。 */
  kind: 'freeTier' | 'pinnedModel'
  adapterType: AI_ADAPTER_TYPES
  modelId: string
  modelLabel: string
}

/**
 * 错误 → 该配的那一家：
 * - `MISSING_API_KEY`（五家一把都没有）→ 免费档那一家（Gemini）；
 * - 选定的模型缺 key（带 `missingKey`）→ **它那一家**，⛔ 不换别家（owner 2026-10-15）；
 * - 那一家的 key 被厂商拒了（`PROVIDER_AUTH_FAILED`，帧上的 `provider` 落在同一格）→ 同上，重配它；
 * - 别的（含「看不了图」）→ `null`：配 key 解决不了，照实说一句就好。
 */
export function assistantKeySetupForError(error: {
  errorCode?: string | null
  missingKey?: AssistantOperatorMissingKey | null
}): AssistantKeySetupTarget | null {
  if (
    error.errorCode === 'MISSING_API_KEY' &&
    ASSISTANT_FREE_TIER_ROUTE_MODEL
  ) {
    return {
      kind: 'freeTier',
      adapterType: ASSISTANT_FREE_TIER_ROUTE_MODEL.adapterType,
      modelId: ASSISTANT_FREE_TIER_ROUTE_MODEL.modelId,
      modelLabel: ASSISTANT_FREE_TIER_ROUTE_MODEL.label,
    }
  }
  if (
    (error.errorCode === ASSISTANT_OPERATOR_MODEL_KEY_MISSING_CODE ||
      error.errorCode === ASSISTANT_PROVIDER_ERROR_CODES.authFailed) &&
    error.missingKey
  ) {
    return {
      kind: 'pinnedModel',
      adapterType: error.missingKey.adapterType,
      modelId: error.missingKey.modelId,
      modelLabel:
        getAssistantRouteModelEntry(error.missingKey.modelId)?.label ??
        error.missingKey.modelId,
    }
  }
  return null
}

/** 就地配好之后那条路由选项的 id（助手的 key，不是工作台出图模型那一条）。 */
export function assistantKeySetupOptionId(modelId: string): string {
  return `llm-route:assistant:setup:${modelId}`
}
