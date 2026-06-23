import 'server-only'

import { z } from 'zod'

import { setAudioCoverImage } from '@/services/generation.service'
import { ensureUser } from '@/services/user.service'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiPatchByIdRoute } from '@/lib/api-route-factory'

const AudioCoverSchema = z.object({
  coverImageUrl: z.string().url(),
})

export const PATCH = createApiPatchByIdRoute({
  schema: AudioCoverSchema,
  routeName: 'PATCH /api/generations/[id]/cover',
  notFoundMessage: 'Audio asset not found or access denied',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id, data) => {
    const user = await ensureUser(clerkId)
    return setAudioCoverImage(id, user.id, data.coverImageUrl)
  },
})
