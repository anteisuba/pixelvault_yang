import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { ensureUser } from '@/services/user.service'
import { findActiveKeyForAdapter } from '@/services/apiKey.service'
import { listVoices, createVoice } from '@/services/fish-audio-voice.service'
import { logger } from '@/lib/logger'

export const maxDuration = 60

// ─── GET /api/voices — list voices (public + my voices) ──────────

const ListQuerySchema = z.object({
  self: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().optional(),
  language: z.string().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const dbUser = await ensureUser(clerkId)
    const apiKey = await findActiveKeyForAdapter(
      dbUser.id,
      AI_ADAPTER_TYPES.FISH_AUDIO,
    )

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error:
            'No active Fish Audio API key. Please add one in API Keys settings.',
        },
        { status: 400 },
      )
    }

    const { searchParams } = new URL(request.url)
    const parsed = ListQuerySchema.safeParse({
      self: searchParams.get('self') ?? undefined,
      page: searchParams.get('page') ?? undefined,
      pageSize: searchParams.get('pageSize') ?? undefined,
      search: searchParams.get('search') ?? undefined,
      language: searchParams.get('language') ?? undefined,
    })

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid query parameters' },
        { status: 400 },
      )
    }

    const { self, page, pageSize, search, language } = parsed.data
    const result = await listVoices(apiKey.keyValue, {
      self,
      pageSize,
      pageNumber: page,
      title: search,
      language,
    })

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    logger.error('GET /api/voices error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { success: false, error: 'Failed to list voices' },
      { status: 500 },
    )
  }
}

// ─── POST /api/voices — create voice (clone) ─────────────────────

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const dbUser = await ensureUser(clerkId)
    const apiKey = await findActiveKeyForAdapter(
      dbUser.id,
      AI_ADAPTER_TYPES.FISH_AUDIO,
    )

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error:
            'No active Fish Audio API key. Please add one in API Keys settings.',
        },
        { status: 400 },
      )
    }

    const formData = await request.formData()
    const title = formData.get('title')
    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json(
        { success: false, error: 'Title is required' },
        { status: 400 },
      )
    }

    // Collect voice files
    const voiceFiles = formData.getAll('voices') as File[]
    if (voiceFiles.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one voice audio file is required' },
        { status: 400 },
      )
    }

    const voices: Buffer[] = []
    const voiceFileNames: string[] = []
    for (const file of voiceFiles) {
      const arrayBuffer = await file.arrayBuffer()
      voices.push(Buffer.from(arrayBuffer))
      voiceFileNames.push(file.name)
    }

    // Optional texts
    const textsRaw = formData.getAll('texts') as string[]
    const texts = textsRaw.length > 0 ? textsRaw : undefined

    const description = formData.get('description') as string | null
    const enhance = formData.get('enhance_audio_quality') === 'true'

    const voice = await createVoice(apiKey.keyValue, {
      title: title.trim(),
      voices,
      voiceFileNames,
      texts,
      visibility: 'private',
      description: description ?? undefined,
      enhanceAudioQuality: enhance,
    })

    return NextResponse.json({ success: true, data: voice }, { status: 201 })
  } catch (error) {
    logger.error('POST /api/voices error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { success: false, error: 'Failed to create voice' },
      { status: 500 },
    )
  }
}
