import { StudioGenerateSchema } from '@/types'
import { compileAndGenerate } from '@/services/studio-generate.service'
import { createApiRoute } from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

// Next.js segment config exports must stay statically analyzable.
export const maxDuration = 240

export const POST = createApiRoute({
  schema: StudioGenerateSchema,
  rateLimit: RATE_LIMIT_CONFIGS.studioGenerate,
  routeName: 'POST /api/studio/generate',
  handler: async (clerkId, data) => {
    const generation = await compileAndGenerate(clerkId, data)
    return { generation }
  },
})
