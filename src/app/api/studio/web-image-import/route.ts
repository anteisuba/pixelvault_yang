import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiRoute } from '@/lib/api-route-factory'
import { importWebImage } from '@/services/web-image-import.service'
import { WebImageImportRequestSchema } from '@/types/web-image-import'

/**
 * 联网搜图的**确认转存**（P3-B 腿 B）。
 *
 * ⭐ 它是**用户点出来的**一次导入，不是助手的动作：助手的工具环只搜出预览候选，
 * 点选之后才走到这里（owner 2026-08-30：「主要是给个预览的功能，用户确定了再落
 * R2」）。⛔ 助手那条链上没有任何一条工具能调到这条路由 —— 那是两条腿分开的
 * 全部理由，钱闸那份 import 白名单也靠它成立。
 *
 * ⛔ 这条路由**不创建任何生成、不扣任何积分**：导入只花存储。
 *
 * 限流用 `outboundProbe`（6/分钟）—— 它每次都会向一个**站外域名**发一次下载，
 * 与 download / 校验代理那一族同性质；`authedWrite` 的 30/分钟对出站请求太松。
 */
export const maxDuration = 60

export const POST = createApiRoute({
  schema: WebImageImportRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.outboundProbe,
  routeName: 'POST /api/studio/web-image-import',
  handler: async (clerkId, data) => {
    const generation = await importWebImage(clerkId, data)
    return { generation }
  },
})
