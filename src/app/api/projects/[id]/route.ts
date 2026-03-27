import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { UpdateProjectSchema } from '@/types'
import type { ProjectResponse } from '@/types'
import { updateProject, deleteProject } from '@/services/project.service'

interface RouteContext {
  params: Promise<{ id: string }>
}

// ─── PUT /api/projects/[id] ──────────────────────────────────────

export async function PUT(
  request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse<ProjectResponse>> {
  const { userId: clerkId } = await auth()
  if (!clerkId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 },
    )
  }

  const parseResult = UpdateProjectSchema.safeParse(body)
  if (!parseResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: parseResult.error.issues.map((e) => e.message).join(', '),
      },
      { status: 400 },
    )
  }

  try {
    const project = await updateProject(clerkId, id, parseResult.data)
    return NextResponse.json({ success: true, data: project })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}

// ─── DELETE /api/projects/[id] ───────────────────────────────────

export async function DELETE(
  _request: NextRequest,
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

  try {
    await deleteProject(clerkId, id)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delete failed'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
