import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import {
  createApiDeleteRoute,
  createApiPatchByIdRoute,
} from '@/lib/api-route-factory'
import { purgeContextCardImages } from '@/services/context-cards-avatar.service'
import {
  deleteContextCardForClerkId,
  getContextCardForClerkId,
  updateContextCardForClerkId,
} from '@/services/context-cards.service'
import { UpdateContextCardSchema } from '@/types/context-cards'

/**
 * 单张上下文卡（第三期 K1）。
 *
 * ⚠ PATCH 收到 `pin` 时由服务端读改写常挂数组，⛔ 不让客户端整份覆盖 ——
 * 两个工作台同时挂同一张卡时整份覆盖会互相抹掉（见 `types/context-cards.ts`）。
 * ⚠ 服务返回 null / false（卡不属于这个用户或已经没了）→ 工厂出 404。
 */

export const PATCH = createApiPatchByIdRoute({
  schema: UpdateContextCardSchema,
  routeName: 'PATCH /api/context-cards/[id]',
  notFoundMessage: 'Context card not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id, data) =>
    updateContextCardForClerkId(clerkId, id, data),
})

/**
 * 删一张卡，**连同它的参考图对象**。
 *
 * ⚠ 顺序是「先读出图 → 删库 → 再清对象」：反过来（先清对象后删库）时删库失败会
 * 让卡上留一串指向已删对象的 URL。清对象失败只是留下几个没人引用的文件，
 * 而那不该把这次删除改写成一次失败 —— 所以它在 `deleteFromR2` 里被吞掉。
 */
export const DELETE = createApiDeleteRoute({
  routeName: 'DELETE /api/context-cards/[id]',
  notFoundMessage: 'Context card not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id) => {
    const card = await getContextCardForClerkId(clerkId, id)
    if (!card) return false

    const deleted = await deleteContextCardForClerkId(clerkId, id)
    if (!deleted) return false

    await purgeContextCardImages(card.images)
    return true
  },
})
