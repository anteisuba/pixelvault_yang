import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import {
  ASSISTANT_PROJECT_RULE_LIMITS,
  PROJECT_RULE_SOURCE_IDS,
} from '@/constants/assistant-operator'
import { createApiGetRoute, createApiRoute } from '@/lib/api-route-factory'
import { ApiRequestError } from '@/lib/errors'
import {
  ProjectRuleLimitError,
  addProjectRuleForClerkId,
  listProjectSourceRulesForClerkId,
} from '@/services/project-rule.service'
import {
  CreateProjectRuleSchema,
  ListProjectRulesQuerySchema,
} from '@/types/assistant-persona'

/**
 * 搜图来源名单（`docs/references/pages/assistant-shell.md` §9.3）—— 项目规则表
 * 现在只装这两种；普通规则已并进记忆（`/api/assistant-memories`，助手设置 B）。
 *
 * ⚠ 这条路上记下来的**默认来源是 `creator`**（用户自己写的）。助手记的那些
 * 走工具环（`add_project_rule`），服务端在那边写死 `assistant` —— 两条路的来源
 * 不该由同一个可选字段决定。
 */

export const GET = createApiGetRoute({
  schema: ListProjectRulesQuerySchema,
  routeName: 'GET /api/assistant/rules',
  requireAuth: true,
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  handler: async ({ clerkId, data }) =>
    listProjectSourceRulesForClerkId(clerkId!, {
      scope: data.scope ?? null,
      ...(data.workspaceKey ? { workspaceKey: data.workspaceKey } : {}),
    }),
})

export const POST = createApiRoute({
  schema: CreateProjectRuleSchema,
  routeName: 'POST /api/assistant/rules',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, data) => {
    try {
      return await addProjectRuleForClerkId(clerkId, {
        ...data,
        source: PROJECT_RULE_SOURCE_IDS.creator,
      })
    } catch (error) {
      if (error instanceof ProjectRuleLimitError) {
        throw new ApiRequestError(
          'PROJECT_RULE_LIMIT_REACHED',
          409,
          'errors.projectRule.limitReached',
          `Rule limit reached (${ASSISTANT_PROJECT_RULE_LIMITS.maxPerUser})`,
        )
      }
      throw error
    }
  },
})
