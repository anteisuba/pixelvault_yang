import 'server-only'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { isAdmin } from '@/lib/admin'
import { createApiRoute } from '@/lib/api-route-factory'
import { ApiRequestError } from '@/lib/errors'
import { grantCredits } from '@/services/credits.service'
import { ensureUser } from '@/services/user.service'
import { GrantCreditsRequestSchema, type GrantCreditsResult } from '@/types'

/** owner 给朋友加点（平台点数第 3 片）。只有 admin 能调。 */
export const POST = createApiRoute({
  schema: GrantCreditsRequestSchema,
  routeName: 'POST /api/admin/credits',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, data): Promise<GrantCreditsResult> => {
    if (!isAdmin(clerkId)) {
      throw new ApiRequestError(
        'FORBIDDEN',
        403,
        'errors.auth.forbidden',
        'Forbidden.',
      )
    }
    const admin = await ensureUser(clerkId)
    const granted = await grantCredits({
      recipient: data.recipient,
      points: data.points,
      ...(data.note ? { note: data.note } : {}),
      grantedByUserId: admin.id,
    })
    return {
      displayName: granted.displayName,
      balancePoints: granted.balance.balancePoints,
    }
  },
})
