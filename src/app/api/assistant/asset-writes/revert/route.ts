import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiRoute } from '@/lib/api-route-factory'
import { revertAssistantAssetWriteForClerkId } from '@/services/asset-library-write.service'
import { AssistantAssetWriteRevertSchema } from '@/types/assistant-operator'

/**
 * **撤销一条素材库写操作**（`docs/references/pages/assistant-shell-v2.md` §10）。
 *
 * ⚠ 为什么撤销要一条路由：这四条工具的后果**在库里**，客户端手上没有任何东西
 * 可以往回改（其余改动型工具改的是工作台上一格 state，撤销就是往回 dispatch
 * 一次）。形状与 `DELETE /api/assistant/rules/[id]` 同源。
 * ⚠ 为什么四条共用一个入口：它们撤销时做的是同一件事 —— 把 step 上那份 `inverse`
 * 原样交回服务端；四条路由只会把同一件事抄四遍。判别键在 body 的 `tool` 上。
 * ⚠ 所有权在服务里按 userId 收敛，⛔ 不信 body 里的 id 就是这个用户的。
 */
export const POST = createApiRoute({
  schema: AssistantAssetWriteRevertSchema,
  routeName: 'POST /api/assistant/asset-writes/revert',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, data) =>
    revertAssistantAssetWriteForClerkId(clerkId, data),
})
