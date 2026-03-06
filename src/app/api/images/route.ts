import { NextRequest, NextResponse } from 'next/server'
import {
  getPublicGenerations,
  countPublicGenerations,
} from '@/services/generation.service'
import { PAGINATION } from '@/constants/config'
import type { GalleryResponse } from '@/types'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = Math.max(
      1,
      Number(searchParams.get('page')) || PAGINATION.DEFAULT_PAGE,
    )
    const limit = Math.min(
      50,
      Number(searchParams.get('limit')) || PAGINATION.DEFAULT_LIMIT,
    )
    const [generations, total] = await Promise.all([
      getPublicGenerations({ page, limit }),
      countPublicGenerations(),
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
