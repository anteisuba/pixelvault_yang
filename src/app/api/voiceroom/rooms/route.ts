import 'server-only'

import { z } from 'zod'

import { createApiGetRoute, createApiRoute } from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createVoiceRoom, listVoiceRooms } from '@/services/voiceroom.service'
import {
  CreateVoiceRoomRequestSchema,
  type VoiceRoomRecord,
} from '@/types/voiceroom'

/** 左列房间列表。没有查询参数——它是个短列表，不分页、不筛选。 */
export const GET = createApiGetRoute<z.ZodType, VoiceRoomRecord[]>({
  schema: z.object({}),
  routeName: 'GET /api/voiceroom/rooms',
  requireAuth: true,
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  handler: async ({ clerkId }) => listVoiceRooms(clerkId!),
})

export const POST = createApiRoute({
  schema: CreateVoiceRoomRequestSchema,
  routeName: 'POST /api/voiceroom/rooms',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, data) => createVoiceRoom(clerkId, data),
})
