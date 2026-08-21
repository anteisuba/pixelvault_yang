import 'server-only'

import { getDefaultProviderConfig } from '@/constants/providers'
import { assistantAdapterSupportsImage } from '@/constants/assistant'
import {
  VISION_CAPABLE_ADAPTERS,
  VISION_NO_CAPABLE_ROUTE_ERROR,
  VISION_PLATFORM_FALLBACK_ADAPTER,
} from '@/constants/vision'
import { ApiRequestError } from '@/lib/errors'
import { getSystemApiKey } from '@/lib/platform-keys'
import { logger } from '@/lib/logger'
import { findActiveKeyForAdapter } from '@/services/apiKey.service'
import {
  resolveLlmTextRoute,
  type ResolvedLlmTextRoute,
} from '@/services/llm-text.service'

/**
 * 视觉任务的路由解析 —— 「借路」，形态照 `resolveResearchRoute`（切片 1）。
 *
 * **为什么放在 vision 目录而不是 `services/kernel/`**：kernel 的定位是「两个以上
 * 消费面共享的策略」（`resolveResearchRoute` 在那里，因为画布助手和 studio 助手
 * 都要）。视觉路由眼下只有 Vision Analyzer 一个消费者，先按模块边界放在它自己家；
 * 等审片循环真的另起一条调用路径再往上提。**另一个现实理由**：kernel 目录本轮有
 * 另一批在改 `prompt-assistant.service.ts`，往那儿放新文件是白白制造合批冲突。
 *
 * 与检索借路的区别只有一处，但很关键：检索借不到时可以**降级**（模型用自身知识
 * 回答，只是 `grounded:false`）；**视觉借不到时不能降级** —— 让一个看不见图的模型
 * 描述图片，产出的是一份格式完整、内容全编的观察，比报错坏得多。所以这里的终点是
 * 结构化错误，Hard Rule 8 让前端把用户引到 `QuickSetupDialog`。
 */

export interface ResolvedVisionRoute {
  route: ResolvedLlmTextRoute
  /**
   * 用户选的那条路看不了图，这一轮换了别的模型。
   * UI 要能如实说出来 —— 「你选的是 DeepSeek，但看图用的是 Gemini」。
   */
  borrowed: boolean
}

/** 找任意一条能吃图的路：先用户自己的 key（省平台额度），再平台兜底 key。 */
export async function findVisionCapableRoute(
  userId: string,
): Promise<ResolvedLlmTextRoute | null> {
  for (const adapterType of VISION_CAPABLE_ADAPTERS) {
    const userKey = await findActiveKeyForAdapter(userId, adapterType)
    if (userKey) {
      return {
        adapterType: userKey.adapterType,
        providerConfig: userKey.providerConfig,
        apiKey: userKey.keyValue,
      }
    }
  }

  const platformKey = getSystemApiKey(VISION_PLATFORM_FALLBACK_ADAPTER)
  if (platformKey) {
    return {
      adapterType: VISION_PLATFORM_FALLBACK_ADAPTER,
      providerConfig: getDefaultProviderConfig(
        VISION_PLATFORM_FALLBACK_ADAPTER,
      ),
      apiKey: platformKey,
    }
  }

  return null
}

/**
 * 解析一轮视觉任务的路由。降级链恰好三段：
 *
 *  1. 用户选的 key 能看图 → 直接用它（`borrowed:false`）。
 *  2. 用户选的 key 看不了图（DeepSeek / 通义 / 火山…）或压根没选 → **借**一条能看图的。
 *  3. 一条都借不到 → 抛 `VISION_NO_CAPABLE_ROUTE`。⛔ 不静默降级成瞎猜。
 *
 * ⚠ 第 1 步里 `resolveLlmTextRoute(userId, apiKeyId)` 自己会因为 key 失效/不支持
 * 文本补全而抛。**那种错不该被吞成「借路」** —— 用户选了一把坏 key，他要看到的是
 * 「这把 key 用不了」，不是安静换一把跑完然后奇怪为什么用的不是自己选的模型。
 */
export async function resolveVisionRoute(
  userId: string,
  apiKeyId?: string,
): Promise<ResolvedVisionRoute> {
  if (apiKeyId) {
    const selected = await resolveLlmTextRoute(userId, apiKeyId)
    if (assistantAdapterSupportsImage(selected.adapterType)) {
      return { route: selected, borrowed: false }
    }

    const borrowed = await findVisionCapableRoute(userId)
    if (borrowed) {
      logger.info('Vision route borrowed', {
        selected: selected.adapterType,
        borrowed: borrowed.adapterType,
      })
      return { route: borrowed, borrowed: true }
    }

    throw new ApiRequestError(
      VISION_NO_CAPABLE_ROUTE_ERROR.errorCode,
      VISION_NO_CAPABLE_ROUTE_ERROR.httpStatus,
      VISION_NO_CAPABLE_ROUTE_ERROR.i18nKey,
      VISION_NO_CAPABLE_ROUTE_ERROR.message,
    )
  }

  const capable = await findVisionCapableRoute(userId)
  if (capable) return { route: capable, borrowed: false }

  throw new ApiRequestError(
    VISION_NO_CAPABLE_ROUTE_ERROR.errorCode,
    VISION_NO_CAPABLE_ROUTE_ERROR.httpStatus,
    VISION_NO_CAPABLE_ROUTE_ERROR.i18nKey,
    VISION_NO_CAPABLE_ROUTE_ERROR.message,
  )
}
