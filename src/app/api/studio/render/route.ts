import 'server-only'

import { createApiRoute } from '@/lib/api-route-factory'
import {
  RenderSubmitSchema,
  submitRenderJob,
  type RenderJobView,
} from '@/services/video/render-video.service'

export const runtime = 'nodejs'

// ─── POST /api/studio/render ─────────────────────────────────────
//
// auth → Zod(RenderPlan) → service。⛔ 路由里不算时间线、不碰 worker：
// 那两件事分别住在 `src/lib/edit-project.ts` 与 render-video.service。

export const POST = createApiRoute<typeof RenderSubmitSchema, RenderJobView>({
  schema: RenderSubmitSchema,
  routeName: 'POST /api/studio/render',
  rateLimit: { limit: 20, windowSeconds: 300 },
  handler: submitRenderJob,
})
