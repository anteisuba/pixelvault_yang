import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiRoute } from '@/lib/api-route-factory'
import { VisionAnalyzeRequestSchema } from '@/types/vision'
import { analyzeVisual } from '@/services/vision/vision-analyzer.service'
import { ensureUser } from '@/services/user.service'

/**
 * 结构化视觉分析（AI 导演内核 · 切片 2 · §4.1）。
 *
 * 三件事：auth（工厂做）→ zod（工厂做）→ 调 service。业务逻辑一行都不在这。
 *
 * ⚠ **限流复用 `imageAnalyze` 档（10/60s）**，不新造一档：这条路和
 * `/api/image/analyze` 花的是同一种钱（视觉 token），给它一个更松的档等于开了个后门。
 *
 * ⚠ `maxDuration` 给到 60：结构化输出允许打回重试一次，两次调用 + 退避要装得下
 * （单次上限 `VISION_LIMITS.timeoutMs = 25s`）。
 */
export const maxDuration = 60

export const POST = createApiRoute({
  schema: VisionAnalyzeRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.imageAnalyze,
  routeName: 'POST /api/vision/analyze',
  handler: async (clerkId, data) => {
    const user = await ensureUser(clerkId)
    return analyzeVisual({
      userId: user.id,
      surface: data.surface,
      conversationId: data.conversationId ?? null,
      projectId: data.projectId ?? null,
      task: data.task,
      mediaUrls: data.mediaUrls,
      // 线上叫 `apiKeyId`（全仓请求体都这么叫），服务层叫 `routeHint`
      // （它对视觉线只是「用户当前选的那条路」的提示，看不了图就会被借掉）。
      routeHint: data.apiKeyId,
      instruction: data.instruction,
    })
  },
})
