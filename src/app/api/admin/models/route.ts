import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { isAdmin } from '@/lib/admin'
import {
  getAllModelConfigs,
  createModelConfig,
} from '@/services/model-config.service'
import { CreateModelConfigSchema } from '@/types'
import type { ModelConfigListResponse, ModelConfigResponse } from '@/types'

export async function GET() {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId || !isAdmin(clerkId)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 },
      )
    }

    const configs = await getAllModelConfigs()
    return NextResponse.json<ModelConfigListResponse>({
      success: true,
      data: configs,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch model configs'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId || !isAdmin(clerkId)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 },
      )
    }

    const body = await request.json()
    const parseResult = CreateModelConfigSchema.safeParse(body)
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

    const config = await createModelConfig(parseResult.data)
    return NextResponse.json<ModelConfigResponse>(
      { success: true, data: config },
      { status: 201 },
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to create model config'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
