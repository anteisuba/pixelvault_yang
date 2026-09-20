import 'server-only'

import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'
import { PIXAI_TASK_PATH } from '@/constants/pixai'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

import type {
  HealthCheckInput,
  ProviderAdapter,
} from '@/services/providers/types'

/**
 * PixAI —— A 类原生 adapter，BYOK，只有文生图。
 *
 * ⚠ 生成本身跑在 execution worker 里（`generatePixAiImage`），与 NovelAI 同
 * 形状：这个文件只剩健康检查。⛔ 别把 create/poll 搬回 Vercel —— 队列型任务
 * 会吃掉 serverless 的执行时长。
 *
 * 健康检查打的是一个**必定不存在**的 task id：PixAI 没有公开的 `/me` 或
 * 余额端点，而 `GET /v1/task/{id}` 对无效 key 回 401、对好 key + 不存在的 id
 * 回 4xx（不是 401）。所以判据是「**不是 401**」而不是「2xx」——⛔ 别改成
 * `response.ok`，那样每把好 key 都会被判成不可用。
 * https://platform.pixai.art/en/docs/quick-start/first-api-call
 */
const HEALTH_CHECK_TASK_ID = 'healthcheck'

export const pixAiAdapter: ProviderAdapter = {
  adapterType: AI_ADAPTER_TYPES.PIXAI,

  async healthCheck({ apiKey, timeoutMs }: HealthCheckInput) {
    const start = Date.now()
    try {
      const endpoint = `${AI_PROVIDER_ENDPOINTS.PIXAI}${PIXAI_TASK_PATH}/${HEALTH_CHECK_TASK_ID}`
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(timeoutMs),
      })
      const latencyMs = Date.now() - start
      if (response.status === 401 || response.status === 403) {
        return {
          status: 'unavailable' as const,
          latencyMs,
          error: `HTTP ${response.status}`,
        }
      }
      if (response.status >= 500) {
        return {
          status: 'unavailable' as const,
          latencyMs,
          error: `HTTP ${response.status}`,
        }
      }
      return { status: 'available' as const, latencyMs }
    } catch (err) {
      return {
        status: 'unavailable' as const,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : 'Unknown error',
      }
    }
  },
}
