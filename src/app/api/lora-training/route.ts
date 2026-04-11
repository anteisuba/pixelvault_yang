import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { SubmitLoraTrainingSchema } from '@/types'
import {
  submitLoraTraining,
  listLoraTrainingJobs,
} from '@/services/lora-training.service'

// ─── POST /api/lora-training — Submit training job ────────────────

export async function POST(request: NextRequest) {
  const { userId: clerkId } = await auth()
  if (!clerkId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const body = await request.json()
  const parsed = SubmitLoraTrainingSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? 'Invalid input',
      },
      { status: 400 },
    )
  }

  try {
    const result = await submitLoraTraining(clerkId, parsed.data)
    return NextResponse.json({ success: true, data: result })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to submit training'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}

// ─── GET /api/lora-training — List user's training jobs ───────────

export async function GET() {
  const { userId: clerkId } = await auth()
  if (!clerkId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  try {
    const jobs = await listLoraTrainingJobs(clerkId)
    return NextResponse.json({ success: true, data: jobs })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to list training jobs'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
