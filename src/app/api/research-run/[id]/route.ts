import 'server-only'

import { createApiGetByIdRoute } from '@/lib/api-route-factory'
import { getResearchRunForUser } from '@/services/research/research-run.service'
import { ensureUser } from '@/services/user.service'
import type { ResearchRunDetail } from '@/types/research'

/**
 * 一次检索的回看（AI 导演内核 · 切片 1 · UI 批）。
 *
 * **为什么需要它**：会话消息里只存 `researchRunId`，证据本体不进 messages
 * （§3.6 验收）。所以历史消息的回执卡和正文里的 `[n]` 引用都没有数据可渲染 ——
 * 全靠这条按 id 懒加载。当轮的回执走响应头（`X-Research-Receipt`），
 * **不经过这条路**；这条只服务「回看」。
 *
 * ownership 服务端校验：service 的 `where` 里带 `userId`，不是取回来再比。
 * 拿不到就是 404（不区分「不存在」和「不是你的」—— 区分等于泄漏别人有没有这个 id）。
 */
export const GET = createApiGetByIdRoute<ResearchRunDetail>({
  routeName: 'GET /api/research-run/[id]',
  notFoundMessage: 'Research run not found or access denied',
  handler: async (clerkId, id) => {
    const user = await ensureUser(clerkId)
    return getResearchRunForUser(id, user.id)
  },
})
