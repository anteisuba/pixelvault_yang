import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiRoute } from '@/lib/api-route-factory'
import { readShots } from '@/services/vision/shot-reading.service'
import { ensureUser } from '@/services/user.service'
import { ShotReadRequestSchema } from '@/types/shot-reading'

/**
 * 拉片 · 读镜（p-canvas-nodes H4b）：一批 ≤ 8 镜 → 一镜一行。
 *
 * 三件事：auth（工厂做）→ zod（工厂做）→ 调 service。
 *
 * ⚠ 限流与 `/api/vision/analyze-video` 同档（`imageAnalyze`）：花的是同一种钱（用户
 *   自己 key 的视觉 token）。客户端一批读完才发下一批，正常用碰不到这条线。
 * ⚠ `maxDuration = 300` 同视频分析：单次视频补全上限 120s，打回重试一次 + 退避要装得下。
 * ⚠ 不扣点、不写库（画布规则 #7：只有 `generate` 扣 credit）。
 */
export const maxDuration = 300

export const POST = createApiRoute({
  maxDuration,
  schema: ShotReadRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.imageAnalyze,
  routeName: 'POST /api/vision/read-shots',
  handler: async (clerkId, data) => {
    const user = await ensureUser(clerkId)
    return readShots({ userId: user.id, ...data })
  },
})
