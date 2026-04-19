import 'server-only'

import {
  UpdateVideoScriptInputSchema,
  VideoScriptStatus,
} from '@/types/video-script'
import {
  createApiDeleteRoute,
  createApiGetByIdRoute,
  createApiPatchByIdRoute,
} from '@/lib/api-route-factory'
import { ensureUser } from '@/services/user.service'
import {
  confirmScript,
  deleteScript,
  getById,
  updateScenes,
  VideoScriptNotFoundError,
} from '@/services/video-script.service'

export const GET = createApiGetByIdRoute({
  routeName: 'GET /api/video-script/[id]',
  notFoundMessage: 'Video script not found',
  handler: async (clerkId, id) => {
    const dbUser = await ensureUser(clerkId)
    try {
      return await getById(id, dbUser.id)
    } catch (err) {
      if (err instanceof VideoScriptNotFoundError) return null
      throw err
    }
  },
})

export const PATCH = createApiPatchByIdRoute({
  schema: UpdateVideoScriptInputSchema,
  routeName: 'PATCH /api/video-script/[id]',
  notFoundMessage: 'Video script not found',
  handler: async (clerkId, id, data) => {
    const dbUser = await ensureUser(clerkId)
    try {
      let result
      if (data.scenes) {
        result = await updateScenes(id, data.scenes, dbUser.id)
      }
      if (data.status === VideoScriptStatus.SCRIPT_READY) {
        result = await confirmScript(id, dbUser.id)
      }
      return result ?? (await getById(id, dbUser.id))
    } catch (err) {
      if (err instanceof VideoScriptNotFoundError) return null
      throw err
    }
  },
})

export const DELETE = createApiDeleteRoute({
  routeName: 'DELETE /api/video-script/[id]',
  notFoundMessage: 'Video script not found',
  handler: async (clerkId, id) => {
    const dbUser = await ensureUser(clerkId)
    try {
      await deleteScript(id, dbUser.id)
      return true
    } catch (err) {
      if (err instanceof VideoScriptNotFoundError) return false
      throw err
    }
  },
})
