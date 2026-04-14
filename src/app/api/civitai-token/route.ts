import 'server-only'

import { z } from 'zod'

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { CivitaiTokenSchema } from '@/types'
import {
  setCivitaiToken,
  hasCivitaiToken,
  deleteCivitaiToken,
} from '@/services/civitai-token.service'
import { createApiGetRoute, createApiRoute } from '@/lib/api-route-factory'

export const GET = createApiGetRoute({
  schema: z.object({}),
  routeName: 'GET /api/civitai-token',
  requireAuth: true,
  handler: async ({ clerkId }) => {
    const hasToken = await hasCivitaiToken(clerkId!)
    return { hasToken }
  },
})

export const PUT = createApiRoute({
  schema: CivitaiTokenSchema,
  routeName: 'PUT /api/civitai-token',
  handler: async (clerkId, data) => {
    await setCivitaiToken(clerkId, data.token)
    return {}
  },
})

// DELETE is intentionally manual: no path param and no body — factory gap
export async function DELETE() {
  const { userId: clerkId } = await auth()
  if (!clerkId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }
  await deleteCivitaiToken(clerkId)
  return NextResponse.json({ success: true })
}
