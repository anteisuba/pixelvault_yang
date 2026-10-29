import 'server-only'

import { PrepareTavernCardUploadSchema } from '@/types/tavern-card'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { prepareTavernCardUpload } from '@/services/cards/tavern-card-import.service'
import { createApiRoute } from '@/lib/api-route-factory'

/** 导入酒馆卡第一步：签一个直传 R2 的 PUT 地址（文件 ⛔ 经过这里）。 */
export const POST = createApiRoute({
  schema: PrepareTavernCardUploadSchema,
  routeName: 'POST /api/character-cards/import/uploads',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, data) => prepareTavernCardUpload(clerkId, data),
})
