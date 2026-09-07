import 'server-only'

import { z } from 'zod'

import {
  ASSISTANT_OPERATOR_LIMITS,
  GENERATION_REVIEW_STATES,
} from '@/constants/assistant-operator'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiPatchByIdRoute } from '@/lib/api-route-factory'
import { setGenerationReviewState } from '@/services/generation.service'
import { ensureUser } from '@/services/user.service'

/**
 * 一张产物的**审核态**（第三期 · 切片 X）。
 *
 * ⭐ owner 的「禁止用失败的旧图」有两个入口，这是**人**的那个：用户在结果卡上
 * 点「不行」。另一个是助手的 `set_review_state` 工具，它走工具环、不经这条路由。
 * 两边最终写的是同一个函数（`setGenerationReviewState`）—— ⛔ 别让工具环 fetch
 * 这条路由「复用一下」：工具环够不着 `api-client`，那是钱闸锁着的东西之一。
 *
 * ⚠ 这条路由**不进工具环**：它是普通的用户动作，鉴权照旧走工厂的 `auth()`，
 * 归属校验在服务端（不是你的行 → 服务返回 null → 工厂出 404）。
 */
const ReviewStateSchema = z.object({
  state: z.enum(GENERATION_REVIEW_STATES),
  /** 一句话，落进 snapshot 跟着素材走。⚠ 不给 = 清掉上一次的理由（见服务头注）。 */
  reason: z
    .string()
    .trim()
    .max(ASSISTANT_OPERATOR_LIMITS.maxReviewReasonChars)
    .optional(),
})

export const PATCH = createApiPatchByIdRoute({
  schema: ReviewStateSchema,
  routeName: 'PATCH /api/generations/[id]/review',
  notFoundMessage: 'Generation not found or access denied',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id, data) => {
    const user = await ensureUser(clerkId)
    return setGenerationReviewState(
      user.id,
      id,
      data.state,
      data.reason ?? undefined,
    )
  },
})
