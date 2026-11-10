import 'server-only'

import { createApiRoute } from '@/lib/api-route-factory'
import { requestTurnStop } from '@/features/assistant/server'
import { AssistantTurnStopRequestSchema } from '@/types/assistant-operator'

/**
 * ⏹ / 插话：给这一轮落停止标记（回合托管，`docs/references/assistant-durable-turns.md` §2）。
 * 标记按 Clerk 用户 id 分键：别人的轮号停不了这个人的轮。
 */
export const POST = createApiRoute({
  schema: AssistantTurnStopRequestSchema,
  routeName: 'POST /api/studio/assistant-operator/stop',
  handler: async (clerkId, data) => {
    await requestTurnStop(clerkId, data.turnId)
    return { stopped: true }
  },
})
