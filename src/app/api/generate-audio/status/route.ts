import 'server-only'

import { createApiGetRoute } from '@/lib/api-route-factory'
import { checkAudioGenerationStatus } from '@/services/generate-audio.service'
import { AudioStatusRequestSchema, type AudioStatusResponseData } from '@/types'

export const maxDuration = 120

export const GET = createApiGetRoute<
  typeof AudioStatusRequestSchema,
  AudioStatusResponseData
>({
  schema: AudioStatusRequestSchema,
  routeName: 'GET /api/generate-audio/status',
  requireAuth: true,
  handler: async ({ clerkId, data }) => {
    return checkAudioGenerationStatus(clerkId!, data.jobId)
  },
})
