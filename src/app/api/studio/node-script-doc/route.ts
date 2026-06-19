import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiRoute } from '@/lib/api-route-factory'
import { createNodeScriptDoc } from '@/services/node/node-script-doc.service'
import {
  NodeScriptDocRequestSchema,
  type NodeScriptDocResponseData,
} from '@/types/script-doc'

export const maxDuration = 60

export const POST = createApiRoute<
  typeof NodeScriptDocRequestSchema,
  NodeScriptDocResponseData
>({
  schema: NodeScriptDocRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.nodeScriptDoc,
  routeName: 'POST /api/studio/node-script-doc',
  handler: async (clerkId, data) => {
    return createNodeScriptDoc(clerkId, data)
  },
})
