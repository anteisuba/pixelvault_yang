import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { CHARACTER_STICKERS } from '@/constants/character-browse'
import { createApiGetByIdRoute } from '@/lib/api-route-factory'
import { logger } from '@/lib/logger'
import {
  addCharacterStickerFromFile,
  CharacterStickerUploadError,
  listCharacterStickers,
} from '@/services/cards/character-sticker.service'
import { CharacterStickerWhenSchema } from '@/types/character-sticker'

export const maxDuration = 60

/** 她的表情包（4d）：她逛来的和你喂给她的。 */
export const GET = createApiGetByIdRoute({
  routeName: 'GET /api/character-cards/[id]/stickers',
  notFoundMessage: 'Character card not found',
  handler: (clerkId, id) => listCharacterStickers(clerkId, id),
})

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { arrayBuffer?: unknown }).arrayBuffer === 'function'
  )
}

/**
 * 你喂给她一张：multipart（`image` 文件，可选 `whenToUse` 一句话）。存 R2 独立路径，
 * ⛔ 进素材库；每张卡最多 30 张，超了先删最旧、没发过的。
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { userId: clerkId } = await auth()
  if (!clerkId)
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  const { id } = await context.params
  try {
    const contentLength = Number(request.headers.get('content-length') ?? 0)
    if (contentLength > CHARACTER_STICKERS.maxBytes * 1.05)
      throw new CharacterStickerUploadError('TOO_LARGE')
    const formData = await request.formData()
    const image = formData.get('image')
    if (!isUploadedFile(image))
      return NextResponse.json(
        { success: false, error: 'Image file is required' },
        { status: 400 },
      )
    const when = CharacterStickerWhenSchema.safeParse(
      formData.get('whenToUse') ?? '',
    )
    if (!when.success)
      return NextResponse.json(
        { success: false, error: 'whenToUse is too long' },
        { status: 400 },
      )
    const sticker = await addCharacterStickerFromFile(clerkId, id, {
      fileBuffer: Buffer.from(await image.arrayBuffer()),
      whenToUse: when.data,
    })
    if (!sticker)
      return NextResponse.json(
        { success: false, error: 'Character card not found' },
        { status: 404 },
      )
    return NextResponse.json({ success: true, data: sticker })
  } catch (error) {
    if (error instanceof CharacterStickerUploadError)
      return NextResponse.json(
        {
          success: false,
          error:
            error.code === 'TOO_LARGE'
              ? 'Sticker exceeds the 5 MB limit'
              : 'Not a supported image',
          errorCode:
            error.code === 'TOO_LARGE' ? 'IMAGE_TOO_LARGE' : 'INVALID_IMAGE',
        },
        { status: error.code === 'TOO_LARGE' ? 413 : 400 },
      )
    logger.error('POST /api/character-cards/[id]/stickers failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { success: false, error: 'Failed to add sticker' },
      { status: 500 },
    )
  }
}
