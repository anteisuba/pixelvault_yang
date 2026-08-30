import 'server-only'

import {
  createApiDeleteRoute,
  createApiGetByIdRoute,
  createApiPatchByIdRoute,
} from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import {
  deleteVoiceRoom,
  getVoiceRoomDetail,
  updateVoiceRoom,
} from '@/services/voiceroom.service'
import {
  UpdateVoiceRoomBodySchema,
  type VoiceRoomDetail,
} from '@/types/voiceroom'

/** 打开一个房间：房间本身 + 全部台词，一次取回。 */
export const GET = createApiGetByIdRoute<VoiceRoomDetail>({
  routeName: 'GET /api/voiceroom/rooms/[id]',
  handler: async (clerkId, id) => getVoiceRoomDetail(clerkId, id),
})

/** 改名 / 改班底 / 改底垫。房间 id 从 URL 来，不走 body。 */
export const PATCH = createApiPatchByIdRoute({
  schema: UpdateVoiceRoomBodySchema,
  routeName: 'PATCH /api/voiceroom/rooms/[id]',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id, data) =>
    updateVoiceRoom(clerkId, { ...data, roomId: id }),
})

/**
 * 删房间。台词跟着走，**生成物一条不动**——那是素材库里的用户资产。
 */
export const DELETE = createApiDeleteRoute({
  routeName: 'DELETE /api/voiceroom/rooms/[id]',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id) => {
    await deleteVoiceRoom(clerkId, id)
  },
})
