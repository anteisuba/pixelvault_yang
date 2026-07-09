# 模板 · Service

> 抽样来源：`src/services/prompts/prompt-feedback.service.ts` 的结构（server-only + ensureUser + Zod 校验 LLM 输出 + 类型化返回）。规则见 `references/backend.md` service 纪律节。

```ts
import 'server-only'

import { z } from 'zod'

import { prisma } from '@/lib/db'
import { logger } from '@/lib/logger'
import { withRetry } from '@/lib/with-retry'
import { ensureUser } from '@/services/user.service'
import type { ThingResponseData } from '@/types'

// ─── 内部 Schema（如需校验外部/LLM 输出） ───────────────────────
const ExternalOutputSchema = z.object({
  // LLM / 外部 API 的输出结构——用 safeParse 校验后再用
})

// ─── Public API（named functions，不用 class） ──────────────────
export async function doThing(
  clerkId: string,
  input: string,
): Promise<ThingResponseData> {
  const dbUser = await ensureUser(clerkId) // clerkId → 内部 User，ownership 由此落

  const result = await withRetry(() => callExternalApi(input)) // 外部调用必须包 retry

  const parsed = ExternalOutputSchema.safeParse(result)
  if (!parsed.success) {
    logger.error('doThing: invalid external output', { clerkId, issues: parsed.error.issues })
    throw new Error('External output validation failed') // 失败大声暴露，不静默降级
  }

  return await prisma.thing.create({
    data: { userId: dbUser.id /* ownership 永远用内部 id */, ... },
  })
}
```

要点：首行 `server-only` · 输入输出必须有类型 · 只有这一层能碰 Prisma/外部 API · credit 计算只在这里 · 用户 prompt 送 AI 前过 `prompt-guard`，LLM 输出过 `llm-output-validator`（或本文件式 Zod schema）· 测试同目录（`templates/test.md` 的 service 段）。
