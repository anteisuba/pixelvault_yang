import 'server-only'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { findActiveKeyForAdapter } from '@/services/apiKey.service'
import { resolveAssistantModelId } from '@/constants/node-studio'
import type { ResolvedLlmTextRoute } from '@/services/llm-text.service'

/**
 * 查证用哪一家的 key —— 只剩一条：**创作者亲手按下「用 Grok 搜这一次」**。
 *
 * ⛔ 「所选模型没有自带联网就借一家」那条（`findNativeSearchRoute`）与旧助手的
 * `resolveResearchRoute` / `findGroundingRoute` 已删（owner 2026-10-15「全跟助手」·
 * 「会自动扣其他模型的token，用户还不知道」）：助手的五家都有自带联网
 * （`supportsNativeWebSearch`），那条借路本来就走不到；走得到的那天就是悄悄花了
 * 别家的钱。查证一律走 `resolveAssistantRoute` 那一家。
 */
type NativeSearchRoute = { route: ResolvedLlmTextRoute; modelId?: string }

/**
 * 创作者自己的 Grok key —— X 上的帖子只有它搜得到（owner 2026-10-14）。
 * ⚠ 只在两处用：判「要不要给『用 Grok 搜这一次』按钮」，以及创作者按了那颗按钮的那一轮。
 * ⛔ 不在创作者不知情时拿它去搜。
 */
export async function findXSearchRoute(
  userId: string,
): Promise<NativeSearchRoute | null> {
  const key = await findActiveKeyForAdapter(userId, AI_ADAPTER_TYPES.XAI)
  if (!key) return null
  const modelId = resolveAssistantModelId(key.adapterType)
  return {
    route: {
      adapterType: key.adapterType,
      providerConfig: key.providerConfig,
      apiKey: key.keyValue,
    },
    ...(modelId ? { modelId } : {}),
  }
}
