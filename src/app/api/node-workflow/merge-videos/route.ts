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
  composeVideoClips,
  mergeVideoClips,
  MERGE_VIDEO_LIMITS,
  MergeVideoServiceError,
} from '@/services/video-merge.service'
import { GenerateImageServiceError } from '@/services/image/generate-image.service'

/**
 * Inputs split by intent:
 *   - `videoUrls`: legacy contract, every clip plays in full, routes
 *     through fal-ai/ffmpeg-api/merge-videos (cheaper, no per-clip trim)
 *   - `clips`:    new contract with optional startSec / endSec per clip;
 *     routes through fal-ai/ffmpeg-api/compose
 *
 * The route accepts either and picks the right service. Both can't be
 * sent in the same payload — `.refine` on top enforces that.
 */
const ComposeClipSchema = z.object({
  url: z.string().trim().url(),
  startSec: z.number().min(0).max(600).optional(),
  endSec: z.number().min(0).max(600).optional(),
  naturalDurationSec: z.number().min(0).max(600).optional(),
})

const MergeVideosRequestSchema = z
  .object({
    videoUrls: z
      .array(z.string().trim().url())
      .min(MERGE_VIDEO_LIMITS.MIN_CLIPS)
      .max(MERGE_VIDEO_LIMITS.MAX_CLIPS)
      .optional(),
    clips: z
      .array(ComposeClipSchema)
      .min(MERGE_VIDEO_LIMITS.MIN_CLIPS)
      .max(MERGE_VIDEO_LIMITS.MAX_CLIPS)
      .optional(),
    apiKeyId: z.string().trim().min(1).max(160).optional(),
    /** Optional output frame-rate. When omitted fal uses the lowest input fps. */
    targetFps: z.number().int().min(1).max(120).optional(),
    /**
     * Optional output resolution token (fal accepts presets like
     * 'landscape_16_9' or omit for "match lowest input").
     */
    resolution: z.string().trim().min(1).max(64).optional(),
  })
  .refine(
    (value) => Boolean(value.videoUrls) !== Boolean(value.clips),
    'Provide either videoUrls (legacy) or clips (with optional trim), not both.',
  )

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
      const result = data.clips
        ? await composeVideoClips({
            userId: dbUser.id,
            apiKey,
            clips: data.clips,
          })
        : await mergeVideoClips({
            userId: dbUser.id,
            apiKey,
            // Refine above guarantees one of the two arrays is set; the
            // non-null assertion documents that for the type system.
            videoUrls: data.videoUrls ?? [],
            targetFps: data.targetFps,
            resolution: data.resolution,
          })

      return {
        url: result.url,
        sizeBytes: result.sizeBytes,
        mimeType: result.mimeType,
        width: result.width,
        height: result.height,
        durationSeconds: result.durationSeconds,
        fps: result.fps,
        requestId: result.requestId,
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
