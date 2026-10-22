import { GenerateRequestSchema } from '@/types'
import { submitImageGeneration } from '@/services/image/submit-image.service'
import { createApiRoute } from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

// Next.js segment config exports must stay statically analyzable.
// 300 = Hobby 上限：Runner 出图要在请求里把没缓存过的 LoRA 下进 R2（见 submit-image.service）。
export const maxDuration = 300

export const POST = createApiRoute({
  schema: GenerateRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.generate,
  routeName: 'POST /api/generate',
  handler: async (clerkId, data) => {
    return submitImageGeneration(clerkId, data)
  },
})
