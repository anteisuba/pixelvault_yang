import 'server-only'

import { z } from 'zod'

import { createApiPostByIdRoute } from '@/lib/api-route-factory'
import { ensureUser } from '@/services/user.service'
import { startSceneOrchestration } from '@/services/video-scene-orchestrator.service'
import { VideoScriptNotFoundError } from '@/services/video-script.service'

export const POST = createApiPostByIdRoute({
  schema: z.object({}),
  routeName: 'POST /api/video-script/[id]/orchestrate',
  notFoundMessage: 'Video script not found',
  handler: async (clerkId, id) => {
    const dbUser = await ensureUser(clerkId)
    try {
      return await startSceneOrchestration(id, dbUser.id)
    } catch (err) {
      if (err instanceof VideoScriptNotFoundError) return null
      throw err
    }
  },
})
