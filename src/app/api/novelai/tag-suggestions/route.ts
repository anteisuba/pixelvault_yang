import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { NovelAiTagQuerySchema } from '@/types/novelai-tags'
import {
  NovelAiTagsError,
  suggestNovelAiTags,
} from '@/services/novelai-tags.service'

export async function GET(request: NextRequest) {
  const { userId } = await auth()
  if (!userId)
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  const parsed = NovelAiTagQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  )
  if (!parsed.success)
    return NextResponse.json(
      { success: false, error: 'Invalid tag query' },
      { status: 400 },
    )
  try {
    const data = await suggestNovelAiTags(userId, parsed.data)
    return NextResponse.json(
      { success: true, data },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: 'NovelAI tag suggestions unavailable',
        errorCode:
          error instanceof NovelAiTagsError ? error.code : 'UPSTREAM_ERROR',
      },
      { status: error instanceof NovelAiTagsError ? error.status : 502 },
    )
  }
}
