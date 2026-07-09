# 模板 · API route（工厂式）

> 抽样来源：`src/app/api/background-cards/route.ts`（2026-07-10，仓库内最规范的工厂用法）。八个工厂的选型见 `references/backend.md`。**记得全链五件套**：本文件 → schema 进 `@/types` → endpoint 常量进 `constants/config.ts` → 包装进 `lib/api-client.ts` → 同目录五段测试（用 `templates/test.md`）。

```ts
import 'server-only'

import { z } from 'zod'

import { CreateThingSchema } from '@/types'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { listThings, createThing } from '@/services/<domain>/thing.service'
import { createApiGetRoute, createApiRoute } from '@/lib/api-route-factory'

export const GET = createApiGetRoute({
  schema: z.object({ projectId: z.string().optional() }),
  routeName: 'GET /api/things',
  requireAuth: true, // 公开可缓存路由才用 skipAuth + cacheHeader（权限决定，先问 owner）
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  handler: async ({ clerkId, data }) =>
    listThings(clerkId!, data.projectId ?? null),
})

export const POST = createApiRoute({
  schema: CreateThingSchema, // Zod schema 一律放 @/types，route 里不定义业务 schema
  routeName: 'POST /api/things',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, data) => createThing(clerkId, data),
})
```

要点：route 文件里**只有接线**——零业务逻辑、零 Prisma、零 provider 调用；错误响应/i18nKey/Sentry 由工厂统一处理，不要在 handler 里 try-catch 包一层。内部回调用 `createApiInternalRoute` + `signature-verifiers/`。
