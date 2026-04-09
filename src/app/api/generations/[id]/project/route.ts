import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { assignGenerationToProject } from '@/services/project.service'

const AssignProjectSchema = z.object({
  projectId: z.string().nullable(),
})

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(
  request: Request,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { userId: clerkId } = await auth()

  if (!clerkId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const { id } = await params
  const body = await request.json().catch(() => null)

  const parseResult = AssignProjectSchema.safeParse(body)
  if (!parseResult.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid request body' },
      { status: 400 },
    )
  }

  try {
    await assignGenerationToProject(clerkId, id, parseResult.data.projectId)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { success: false, error: 'Failed to assign project' },
      { status: 500 },
    )
  }
}
