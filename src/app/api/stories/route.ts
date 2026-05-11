import 'server-only'

import { z } from 'zod'

import { CreateStoryRequestSchema } from '@/types'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { listStories, createStory } from '@/services/story.service'
import { createApiGetRoute, createApiRoute } from '@/lib/api-route-factory'

export const GET = createApiGetRoute({
  schema: z.object({}),
  routeName: 'GET /api/stories',
  requireAuth: true,
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  handler: async ({ clerkId }) => listStories(clerkId!),
})

export const POST = createApiRoute({
  schema: CreateStoryRequestSchema,
  routeName: 'POST /api/stories',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, data) =>
    createStory(clerkId, data.title, data.generationIds),
})
