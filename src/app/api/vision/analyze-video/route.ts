import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiRoute } from '@/lib/api-route-factory'
import { VideoAnalyzeRequestSchema } from '@/lib/video-frame-request'
import { analyzeVideo } from '@/services/vision/video-analysis.service'
import { ensureUser } from '@/services/user.service'

/**
 * 视频的结构化分析（AI 导演内核 · 切片 2 · §4.3）。
 *
 * 三件事：auth（工厂做）→ zod（工厂做）→ 调 service。业务逻辑一行都不在这。
 *
 * ⚠ **限流复用 `imageAnalyze` 档（10/60s）**，与 `/api/vision/analyze` 同档：
 * 这条路花的是同一种钱（视觉 token），另开一档更松的等于给它开后门。
 * 10/分钟同时也把 R2 写入封在 10×8=80 帧/分钟。
 *
 * ⚠ `maxDuration = 300` 而不是 60：native 档要等 provider 啃完整段视频
 * （🔬 18 分钟的片子光 VIDEO token 就 10 万），单次上限
 * `VISION_LIMITS.videoTimeoutMs = 120s`，打回重试一次 + 退避要装得下。
 */
export const maxDuration = 300

export const POST = createApiRoute({
  schema: VideoAnalyzeRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.imageAnalyze,
  routeName: 'POST /api/vision/analyze-video',
  handler: async (clerkId, data) => {
    const user = await ensureUser(clerkId)
    return analyzeVideo({
      userId: user.id,
      surface: data.surface,
      conversationId: data.conversationId ?? null,
      projectId: data.projectId ?? null,
      task: data.task,
      videoUrl: data.videoUrl,
      durationSeconds: data.durationSeconds,
      frames: data.frames,
      // 线上叫 `apiKeyId`，服务层叫 `routeHint`（同 `/api/vision/analyze`）。
      routeHint: data.apiKeyId,
      instruction: data.instruction,
    })
  },
})
