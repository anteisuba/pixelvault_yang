import 'server-only'

import {
  ASSISTANT_FALLBACK_ADAPTER_ORDER,
  assistantAdapterSupportsImage,
} from '@/constants/assistant'
import { resolveAssistantModelId } from '@/constants/node-studio'
import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import { findActiveKeyForAdapter } from '@/services/apiKey.service'
import type { ResolvedLlmTextRoute } from '@/services/llm-text.service'

export interface AssistantFallbackRoute {
  route: ResolvedLlmTextRoute
  modelId: string | undefined
}

/**
 * 这一步的模型临时出不来时，**借用户自己配过的另一把 key**把这一步跑完
 * （owner 2026-10-08：除了安全策略和额度，别让用户看见报错）。
 *
 * 形态照 `findVisionCapableRoute`：只认用户的 key，没有平台兜底；跳过出事的那家；
 * 这一步带图就只借看得见图的。借到了由调用方告诉模型「这一步换了家」，⛔ 不静默。
 */
export async function findFallbackAssistantRoute(
  userId: string,
  exclude: AI_ADAPTER_TYPES,
  options: { needsImages?: boolean } = {},
): Promise<AssistantFallbackRoute | null> {
  for (const adapterType of ASSISTANT_FALLBACK_ADAPTER_ORDER) {
    if (adapterType === exclude) continue
    if (options.needsImages && !assistantAdapterSupportsImage(adapterType))
      continue
    const key = await findActiveKeyForAdapter(userId, adapterType)
    if (!key) continue
    return {
      route: {
        adapterType: key.adapterType,
        providerConfig: key.providerConfig,
        apiKey: key.keyValue,
      },
      modelId: resolveAssistantModelId(adapterType),
    }
  }
  return null
}
