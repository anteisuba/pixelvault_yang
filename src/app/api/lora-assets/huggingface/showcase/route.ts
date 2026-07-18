import 'server-only'

import { createApiGetRoute } from '@/lib/api-route-factory'
import {
  HuggingFaceRepoShowcaseQuerySchema,
  type HuggingFaceRepoShowcase,
} from '@/types'
import { getHuggingFaceRepoShowcase } from '@/services/huggingface-lora.service'

// README 单抓实测 ~0.28s；给出宽裕但不夸张的上限，避免个别慢仓库拖到平台
// 默认超时。
export const maxDuration = 8

const PUBLIC_CACHE = 'public, s-maxage=300, stale-while-revalidate=1800'

/**
 * GET /api/lora-assets/huggingface/showcase
 *
 * 库侧封面渐进增强（2026-07-18 owner 拍板方案 B）：客户端对封面落到社交
 * 横幅兜底的卡按需、懒加载调用此端点取 README 内嵌图。公开只读端点，不
 * 需要鉴权——与主 `/api/lora-assets/huggingface` 发现端点同一套 skipAuth
 * 惯例。
 */
export const GET = createApiGetRoute({
  schema: HuggingFaceRepoShowcaseQuerySchema,
  routeName: 'GET /api/lora-assets/huggingface/showcase',
  skipAuth: true,
  cacheHeader: PUBLIC_CACHE,
  handler: async ({ data }): Promise<HuggingFaceRepoShowcase> =>
    getHuggingFaceRepoShowcase(data.repoId, data.revision),
})
