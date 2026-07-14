import 'server-only'

import { createApiGetRoute } from '@/lib/api-route-factory'
import {
  HuggingFaceLoraSearchQuerySchema,
  type HuggingFaceLoraSearchResult,
} from '@/types'
import { searchHuggingFaceLoras } from '@/services/huggingface-lora.service'

const PUBLIC_CACHE = 'public, s-maxage=300, stale-while-revalidate=1800'

/**
 * GET /api/lora-assets/huggingface
 *
 * Public discovery endpoint. It returns repositories plus concrete
 * SafeTensors files; the authenticated favorite route persists the selected
 * file into the user's LoRA library.
 */
export const GET = createApiGetRoute({
  schema: HuggingFaceLoraSearchQuerySchema,
  routeName: 'GET /api/lora-assets/huggingface',
  skipAuth: true,
  cacheHeader: PUBLIC_CACHE,
  handler: async ({ data }): Promise<HuggingFaceLoraSearchResult> =>
    searchHuggingFaceLoras(data),
})
