import { z } from 'zod'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { createApiRoute } from '@/lib/api-route-factory'
import { getSystemApiKey } from '@/lib/platform-keys'
import {
  findActiveKeyForAdapter,
  getApiKeyValueById,
} from '@/services/apiKey.service'
import { ensureUser } from '@/services/user.service'
import {
  mergeVideoClips,
  MERGE_VIDEO_LIMITS,
  MergeVideoServiceError,
} from '@/services/video-merge.service'
import { GenerateImageServiceError } from '@/services/generate-image.service'

const MergeVideosRequestSchema = z.object({
  videoUrls: z
    .array(z.string().trim().url())
    .min(MERGE_VIDEO_LIMITS.MIN_CLIPS)
    .max(MERGE_VIDEO_LIMITS.MAX_CLIPS),
  apiKeyId: z.string().trim().min(1).max(160).optional(),
  /** Optional output frame-rate. When omitted fal uses the lowest input fps. */
  targetFps: z.number().int().min(1).max(120).optional(),
  /**
   * Optional output resolution token (fal accepts presets like
   * 'landscape_16_9' or omit for "match lowest input").
   */
  resolution: z.string().trim().min(1).max(64).optional(),
})

async function resolveFalKey(
  clerkId: string,
  userId: string,
  apiKeyId: string | undefined,
): Promise<string> {
  if (apiKeyId) {
    const resolved = await getApiKeyValueById(apiKeyId, userId)
    if (!resolved) {
      throw new GenerateImageServiceError(
        'INVALID_ROUTE_SELECTION',
        'Selected API key is unavailable',
        400,
      )
    }
    if (resolved.adapterType !== AI_ADAPTER_TYPES.FAL) {
      throw new GenerateImageServiceError(
        'INVALID_ROUTE_SELECTION',
        'Video merge requires a fal API key',
        400,
      )
    }
    return resolved.keyValue
  }

  // Prefer any active user-saved fal key before falling back to the
  // platform key — keeps usage attributed to the user when they have BYOK.
  const userKey = await findActiveKeyForAdapter(userId, AI_ADAPTER_TYPES.FAL)
  if (userKey) return userKey.keyValue

  const systemKey = getSystemApiKey(AI_ADAPTER_TYPES.FAL)
  if (systemKey) return systemKey

  throw new GenerateImageServiceError(
    'INVALID_ROUTE_SELECTION',
    'No fal API key configured. Add one in Settings or wait for platform key restoration.',
    400,
  )
}

export const POST = createApiRoute({
  schema: MergeVideosRequestSchema,
  routeName: 'POST /api/node-workflow/merge-videos',
  rateLimit: RATE_LIMIT_CONFIGS.generateVideo,
  handler: async (clerkId, data) => {
    const dbUser = await ensureUser(clerkId)

    const apiKey = await resolveFalKey(clerkId, dbUser.id, data.apiKeyId)

    try {
      const merged = await mergeVideoClips({
        userId: dbUser.id,
        apiKey,
        videoUrls: data.videoUrls,
        targetFps: data.targetFps,
        resolution: data.resolution,
      })

      return {
        url: merged.url,
        sizeBytes: merged.sizeBytes,
        mimeType: merged.mimeType,
        width: merged.width,
        height: merged.height,
        durationSeconds: merged.durationSeconds,
        fps: merged.fps,
        requestId: merged.requestId,
      }
    } catch (error) {
      if (error instanceof MergeVideoServiceError) {
        // Map merge errors to existing error codes the unified handler
        // already understands. Input-shape problems → VALIDATION_ERROR,
        // upstream fal failures → PROVIDER_ERROR.
        const isInputError =
          error.code === 'TOO_FEW_CLIPS' ||
          error.code === 'TOO_MANY_CLIPS' ||
          error.code === 'INVALID_URL'
        throw new GenerateImageServiceError(
          isInputError ? 'VALIDATION_ERROR' : 'PROVIDER_ERROR',
          error.message,
          isInputError ? 400 : 502,
        )
      }
      throw error
    }
  },
})
