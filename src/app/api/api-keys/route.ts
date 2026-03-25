import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { CreateApiKeySchema } from '@/types'
import type { ApiKeysResponse, ApiKeyResponse } from '@/types'
import { ensureUser } from '@/services/user.service'
import { listUserApiKeys, createApiKey } from '@/services/apiKey.service'

// ─── GET /api/api-keys ────────────────────────────────────────────

export async function GET(): Promise<NextResponse<ApiKeysResponse>> {
  const { userId: clerkId } = await auth()
  if (!clerkId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const dbUser = await ensureUser(clerkId)
  const keys = await listUserApiKeys(dbUser.id)
  return NextResponse.json({ success: true, data: keys })
}

// ─── POST /api/api-keys ───────────────────────────────────────────

export async function POST(
  request: NextRequest,
): Promise<NextResponse<ApiKeyResponse>> {
  const { userId: clerkId } = await auth()
  if (!clerkId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const body = await request.json()
  const parseResult = CreateApiKeySchema.safeParse(body)
  if (!parseResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: parseResult.error.issues.map((e) => e.message).join(', '),
      },
      { status: 400 },
    )
  }

  const dbUser = await ensureUser(clerkId)
  const { adapterType, providerConfig, modelId, label, keyValue } =
    parseResult.data
  const record = await createApiKey(
    dbUser.id,
    modelId,
    adapterType,
    providerConfig,
    label,
    keyValue,
  )
  return NextResponse.json({ success: true, data: record }, { status: 201 })
}
