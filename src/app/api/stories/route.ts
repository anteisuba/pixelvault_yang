import 'server-only'

import { z } from 'zod'

import { CreateStoryRequestSchema } from '@/types'
import { listStories, createStory } from '@/services/story.service'
import { createApiGetRoute, createApiRoute } from '@/lib/api-route-factory'

export const GET = createApiGetRoute({
  schema: z.object({}),
  routeName: 'GET /api/stories',
  requireAuth: true,
  handler: async ({ clerkId }) => listStories(clerkId!),
})

export const POST = createApiRoute({
  schema: CreateStoryRequestSchema,
  routeName: 'POST /api/stories',
  handler: async (clerkId, data) =>
    createStory(clerkId, data.title, data.generationIds),
})
