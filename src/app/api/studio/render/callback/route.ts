import 'server-only'

import { createApiInternalRoute } from '@/lib/api-route-factory'
import { verifyInternalExecutionSignature } from '@/lib/signature-verifiers/internal-execution'
import {
  handleRenderCallback,
  RenderCallbackSchema,
} from '@/services/video/render-video.service'

export const runtime = 'nodejs'

// ─── POST /api/studio/render/callback ────────────────────────────
//
// `render-video` worker 的回调口。**签名口径复用 execution 那一套**（同一个
// `INTERNAL_CALLBACK_SECRET`、同一组头、同一个规范串），⛔ 但不复用
// `/api/internal/execution/callback` 那条路由：那条的 handler 一路要走
// provider metadata / 积分 / R2 转存，而渲染产物已经在 R2、也不扣积分，
// 借道过去等于让一条不适用的长路径决定渲染的落库形状。

export const POST = createApiInternalRoute<
  typeof RenderCallbackSchema,
  { readonly jobId: string; readonly action: string }
>({
  schema: RenderCallbackSchema,
  routeName: 'POST /api/studio/render/callback',
  verifySignature: verifyInternalExecutionSignature,
  handler: async ({ data }) => handleRenderCallback(data),
})
