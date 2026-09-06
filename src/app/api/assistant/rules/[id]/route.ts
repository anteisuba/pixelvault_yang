import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiDeleteRoute } from '@/lib/api-route-factory'
import { deleteProjectRule } from '@/services/project-rule.service'

/**
 * 删一条项目规则（§10）。
 *
 * ⚠ 按 id 走 `[id]` 段而不是给集合路由加一条带 body 的 DELETE：全仓 15 条删除
 * 路由都是这个形状，⛔ 不为一条规则另立一套。
 * ⚠ 服务返回 false（规则不属于这个用户 / 已经没了）→ 工厂出 404，
 * ⛔ 不把「删了别人的」和「什么都没删」混成同一个成功。
 */
export const DELETE = createApiDeleteRoute({
  routeName: 'DELETE /api/assistant/rules/[id]',
  notFoundMessage: 'Project rule not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id) => deleteProjectRule(clerkId, id),
})
