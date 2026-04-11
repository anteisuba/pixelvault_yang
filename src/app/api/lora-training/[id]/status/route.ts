import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { checkLoraTrainingStatus } from '@/services/lora-training.service'

interface RouteContext {
  params: Promise<{ id: string }>
}

// ─── GET /api/lora-training/[id]/status — Poll training status ────

export async function GET(_request: Request, { params }: RouteContext) {
  const { userId: clerkId } = await auth()
  if (!clerkId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const { id } = await params

  try {
    const result = await checkLoraTrainingStatus(clerkId, id)
    return NextResponse.json({ success: true, data: result })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to check training status'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
