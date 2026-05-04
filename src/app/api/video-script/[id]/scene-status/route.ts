import 'server-only'

import { createApiGetByIdRoute } from '@/lib/api-route-factory'
import { ensureUser } from '@/services/user.service'
import { getSceneStatus } from '@/services/video-scene-orchestrator.service'
import { VideoScriptNotFoundError } from '@/services/video-script.service'

export const GET = createApiGetByIdRoute({
  routeName: 'GET /api/video-script/[id]/scene-status',
  notFoundMessage: 'Video script not found',
  handler: async (clerkId, id) => {
    const dbUser = await ensureUser(clerkId)
    try {
      return await getSceneStatus(id, dbUser.id)
    } catch (err) {
      if (err instanceof VideoScriptNotFoundError) return null
      throw err
    }
  },
})
