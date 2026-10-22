import { StudioGenerateSchema } from '@/types'
import { compileAndGenerate } from '@/services/studio-generate.service'
import { createApiRoute } from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

// Next.js segment config exports must stay statically analyzable.
// 300 = Hobby 上限：Runner 出图要在请求里把没缓存过的 LoRA 下进 R2（见 submit-image.service）。
export const maxDuration = 300

export const POST = createApiRoute({
  schema: StudioGenerateSchema,
  rateLimit: RATE_LIMIT_CONFIGS.studioGenerate,
  routeName: 'POST /api/studio/generate',
  handler: async (clerkId, data) => {
    return compileAndGenerate(clerkId, data)
  },
})
