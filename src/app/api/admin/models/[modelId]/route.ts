import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { isAdmin } from '@/lib/admin'
import {
  getModelConfigById,
  updateModelConfig,
  deleteModelConfig,
} from '@/services/model-config.service'
import { UpdateModelConfigSchema } from '@/types'
import type { ModelConfigResponse } from '@/types'

interface RouteParams {
  params: Promise<{ modelId: string }>
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId || !isAdmin(clerkId)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 },
      )
    }

    const { modelId } = await params
    const config = await getModelConfigById(modelId)
    if (!config) {
      return NextResponse.json(
        { success: false, error: 'Model config not found' },
        { status: 404 },
      )
    }

    return NextResponse.json<ModelConfigResponse>({
      success: true,
      data: config,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch model config'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId || !isAdmin(clerkId)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 },
      )
    }

    const { modelId } = await params
    const body = await request.json()
    const parseResult = UpdateModelConfigSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: parseResult.error.issues
            .map((e: { message: string }) => e.message)
            .join(', '),
        },
        { status: 400 },
      )
    }

    const config = await updateModelConfig(modelId, parseResult.data)
    return NextResponse.json<ModelConfigResponse>({
      success: true,
      data: config,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to update model config'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId || !isAdmin(clerkId)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 },
      )
    }

    const { modelId } = await params
    await deleteModelConfig(modelId)
    return NextResponse.json({ success: true })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to delete model config'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
