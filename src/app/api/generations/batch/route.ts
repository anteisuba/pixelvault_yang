import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'

import {
  batchDeleteGenerations,
  batchUpdateVisibility,
} from '@/services/generation.service'
import { deleteFromR2 } from '@/services/storage/r2'
import { ensureUser } from '@/services/user.service'

const BatchDeleteSchema = z.object({
  action: z.literal('delete'),
  ids: z.array(z.string().uuid()).min(1).max(100),
})

const BatchVisibilitySchema = z.object({
  action: z.literal('visibility'),
  ids: z.array(z.string().uuid()).min(1).max(100),
  field: z.enum(['isPublic', 'isPromptPublic']),
  value: z.boolean(),
})

const BatchRequestSchema = z.discriminatedUnion('action', [
  BatchDeleteSchema,
  BatchVisibilitySchema,
])

// ─── POST /api/generations/batch ─────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const parseResult = BatchRequestSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: parseResult.error.issues.map((e) => e.message).join(', '),
        },
        { status: 400 },
      )
    }

    const user = await ensureUser(clerkId)

    if (parseResult.data.action === 'delete') {
      const { deletedCount, storageKeys } = await batchDeleteGenerations(
        parseResult.data.ids,
        user.id,
      )

      // Cleanup R2 in background
      for (const key of storageKeys) {
        deleteFromR2(key).catch(() => {})
      }

      return NextResponse.json({
        success: true,
        data: { deletedCount },
      })
    }

    // visibility
    const updatedCount = await batchUpdateVisibility(
      parseResult.data.ids,
      user.id,
      parseResult.data.field,
      parseResult.data.value,
    )

    return NextResponse.json({
      success: true,
      data: { updatedCount },
    })
  } catch (error) {
    console.error('[API /api/generations/batch] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Batch operation failed' },
      { status: 500 },
    )
  }
}
