import 'server-only'

import { NextRequest, NextResponse } from 'next/server'

import { createApiGetRoute, createApiRoute } from '@/lib/api-route-factory'
import { createVoiceCard, listVoiceCards } from '@/services/voice-card.service'
import {
  CreateVoiceCardRequestSchema,
  ListVoiceCardsQuerySchema,
} from '@/types'

const createVoiceCardRoute = createApiRoute({
  schema: CreateVoiceCardRequestSchema,
  routeName: 'POST /api/voice-cards',
  handler: async (clerkId, data) => createVoiceCard(clerkId, data),
})

export async function POST(request: NextRequest) {
  const response = await createVoiceCardRoute(request)
  if (response.status !== 200) return response

  const body: unknown = await response.json()
  return NextResponse.json(body, { status: 201 })
}

export const GET = createApiGetRoute({
  schema: ListVoiceCardsQuerySchema,
  routeName: 'GET /api/voice-cards',
  requireAuth: true,
  handler: async ({ clerkId, data }) =>
    listVoiceCards(clerkId!, data.page, data.pageSize),
})
