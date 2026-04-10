import { SelectVariantWinnerSchema } from '@/types'
import { selectVariantWinner } from '@/services/generation.service'
import { ensureUser } from '@/services/user.service'
import { createApiRoute } from '@/lib/api-route-factory'

export const POST = createApiRoute({
  schema: SelectVariantWinnerSchema,
  routeName: 'POST /api/studio/select-winner',
  handler: async (clerkId, data) => {
    const dbUser = await ensureUser(clerkId)
    await selectVariantWinner(dbUser.id, data.runGroupId, data.generationId)
    return { selected: true }
  },
})
