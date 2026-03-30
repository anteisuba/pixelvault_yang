import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { CivitaiTokenSchema, type CivitaiTokenStatusResponse } from '@/types'
import {
  setCivitaiToken,
  hasCivitaiToken,
  deleteCivitaiToken,
} from '@/services/civitai-token.service'

// ─── GET /api/civitai-token ────────────────────────────────────

export async function GET() {
  const { userId: clerkId } = await auth()
  if (!clerkId) {
    return NextResponse.json<CivitaiTokenStatusResponse>(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const hasToken = await hasCivitaiToken(clerkId)
  return NextResponse.json<CivitaiTokenStatusResponse>({
    success: true,
    data: { hasToken },
  })
}

// ─── PUT /api/civitai-token ────────────────────────────────────

export async function PUT(request: NextRequest) {
  const { userId: clerkId } = await auth()
  if (!clerkId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const body = await request.json().catch(() => null)
  const parsed = CivitaiTokenSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? 'Invalid input',
      },
      { status: 400 },
    )
  }

  await setCivitaiToken(clerkId, parsed.data.token)
  return NextResponse.json({ success: true })
}

// ─── DELETE /api/civitai-token ─────────────────────────────────

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
