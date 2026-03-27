import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { CreateProjectSchema } from '@/types'
import type { ProjectsResponse, ProjectResponse } from '@/types'
import { listProjects, createProject } from '@/services/project.service'

export async function GET() {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<ProjectsResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const projects = await listProjects(clerkId)
    return NextResponse.json<ProjectsResponse>({
      success: true,
      data: projects,
    })
  } catch (error) {
    console.error('[API /api/projects GET] Error:', error)
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<ProjectsResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<ProjectResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json<ProjectResponse>(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parseResult = CreateProjectSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json<ProjectResponse>(
        {
          success: false,
          error: parseResult.error.issues
            .map((e: { message: string }) => e.message)
            .join(', '),
        },
        { status: 400 },
      )
    }

    const project = await createProject(clerkId, parseResult.data)
    return NextResponse.json<ProjectResponse>({
      success: true,
      data: project,
    })
  } catch (error) {
    console.error('[API /api/projects POST] Error:', error)
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json<ProjectResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
