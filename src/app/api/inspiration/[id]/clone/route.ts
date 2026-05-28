import 'server-only'

import { NextRequest, NextResponse } from 'next/server'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiPostByIdRoute } from '@/lib/api-route-factory'
import { cloneInspirationToRecipe } from '@/services/prompts/inspiration.service'
import { CloneInspirationRequestSchema } from '@/types'

const cloneRoute = createApiPostByIdRoute({
  schema: CloneInspirationRequestSchema,
  routeName: 'POST /api/inspiration/[id]/clone',
  notFoundMessage: 'Inspiration not found',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id, data) =>
    cloneInspirationToRecipe(clerkId, id, data),
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const response = await cloneRoute(request, context)
  if (response.status !== 200) return response

  // Mirror /api/recipes POST behaviour — clone is a create.
  const body: unknown = await response.json()
  return NextResponse.json(body, { status: 201 })
}
