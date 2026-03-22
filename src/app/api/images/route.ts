import { NextRequest, NextResponse } from 'next/server'

import {
  getPublicGenerations,
  countPublicGenerations,
} from '@/services/generation.service'
import { GallerySearchSchema, type GalleryResponse } from '@/types'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const parsed = GallerySearchSchema.safeParse(
      Object.fromEntries(searchParams),
    )

    if (!parsed.success) {
      return NextResponse.json<GalleryResponse>(
        { success: false, error: 'Invalid query parameters' },
        { status: 400 },
      )
    }

    const { page, limit, search, model, sort } = parsed.data
    const filterOpts = { search, model }

    const [generations, total] = await Promise.all([
      getPublicGenerations({ page, limit, search, model, sort }),
      countPublicGenerations(filterOpts),
    ])

    return NextResponse.json<GalleryResponse>({
      success: true,
      data: {
        generations,
        page,
        limit,
        total,
        hasMore: page * limit < total,
      },
    })
  } catch (error) {
    console.error('[API /api/images] ERROR:', error)
    return NextResponse.json<GalleryResponse>(
      { success: false, error: 'Failed to fetch gallery' },
      { status: 500 },
    )
  }
}
