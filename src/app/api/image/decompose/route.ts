import { ImageDecomposeSchema } from '@/types'
import {
  decomposeImage,
  persistDecomposition,
} from '@/services/image-decompose.service'
import { ensureUser } from '@/services/user.service'
import { findActiveKeyForAdapter } from '@/services/apiKey.service'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { getSystemApiKey } from '@/lib/platform-keys'
import { createApiRoute } from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

// Next.js segment config exports must remain statically analyzable literals.
export const maxDuration = 300

export const POST = createApiRoute({
  schema: ImageDecomposeSchema,
  rateLimit: RATE_LIMIT_CONFIGS.imageDecompose,
  routeName: 'POST /api/image/decompose',
  handler: async (clerkId, data) => {
    const user = await ensureUser(clerkId)

    // Resolve HuggingFace API token: user's saved key first, then platform key
    const userKeyRecord = await findActiveKeyForAdapter(
      user.id,
      AI_ADAPTER_TYPES.HUGGINGFACE,
    )
    const hfToken =
      userKeyRecord?.keyValue ?? getSystemApiKey(AI_ADAPTER_TYPES.HUGGINGFACE)

    const result = await decomposeImage(
      data.imageUrl,
      data.resolution,
      data.seed,
      hfToken ?? undefined,
    )

    // Persist to R2 + DB if requested
    if (data.persist && data.generationId) {
      const persisted = await persistDecomposition({
        userId: user.id,
        psdUrl: result.psdUrl,
        layers: result.layers,
        sourceGenerationId: data.generationId,
      })
      return {
        ...result,
        psdUrl: persisted.persistedPsdUrl,
        layers: persisted.persistedLayers,
        generation: persisted.generation,
      }
    }

    return result
  },
})
