import 'server-only'

import { resolveAssistantModelId } from '@/constants/node-studio'
import {
  assertAssistantRouteSeesImages,
  resolveAssistantRoute,
} from '@/services/kernel/assistant-route.service'
import {
  resolveLlmTextRoute,
  type ResolvedLlmTextRoute,
} from '@/services/llm-text.service'

/**
 * 视觉任务用哪一家 —— **只用所选那一家**（owner 2026-10-15「全跟助手」·「会自动扣其他
 * 模型的token，用户还不知道」）。
 *
 *  1. 调用方递了一把 key（助手这一轮的那把，或面板上点名的那把）→ 就用它；
 *  2. 没递 → `resolveAssistantRoute`：选定的模型，或「自动」挑的第一家配了 key 的；
 *  3. 那一家、那个型号看不了图 → `AssistantModelCannotSeeError`（翻译过的一句「助手
 *     现在用的模型看不了图」）。⛔ **不借别家**：旧的 `findVisionCapableRoute` 已删。
 *
 * ⚠ 看不了图时**不能降级**：让一个看不见图的模型描述图片，产出的是一份格式完整、
 * 内容全编的观察，比报错坏得多。所以终点是结构化错误，⛔ 不静默瞎猜。
 *
 * ⚠ 第 1 步里 `resolveLlmTextRoute(userId, apiKeyId)` 自己会因为 key 失效 / 不支持
 * 文本补全而抛 —— 照实抛，⛔ 不吞成换一把。
 */
export interface ResolvedVisionRoute {
  route: ResolvedLlmTextRoute
  /** 这一次看图用的型号。⛔ 调用方别再自己挑。 */
  modelId?: string
}

export async function resolveVisionRoute(
  userId: string,
  apiKeyId?: string,
  modelId?: string,
): Promise<ResolvedVisionRoute> {
  if (!apiKeyId) {
    const assistant = await resolveAssistantRoute(userId)
    assertAssistantRouteSeesImages(assistant)
    return { route: assistant.route, modelId: assistant.modelId }
  }
  const route = await resolveLlmTextRoute(userId, apiKeyId)
  const resolved = {
    route,
    modelId: resolveAssistantModelId(route.adapterType, modelId),
  }
  assertAssistantRouteSeesImages(resolved)
  return resolved
}
