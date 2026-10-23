import 'server-only'

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { isGenerationError } from '@/lib/errors'
import { rateLimit } from '@/lib/rate-limit'
import { streamVoiceRoomChat } from '@/services/voiceroom-chat.service'
import { VoiceRoomChatRequestSchema } from '@/types/voiceroom'

/** 一轮 = 一段回复 + 派一次 TTS，跟 `/api/voiceroom/lines` 对齐。 */
export const maxDuration = 120

/**
 * 配音间聊天（SSE）。工厂只出 JSON，流式路由照 `/api/image/edit-stream` 手写那三件事：
 * auth → 限流 → Zod → service。
 *
 * 限流用 `generateAudio`：每一轮都会派一次 TTS，和 `/api/voiceroom/lines` 同一份配额。
 */
export async function POST(request: NextRequest): Promise<Response> {
  const { userId } = await auth()
  if (!userId)
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  const limit = await rateLimit(
    `POST /api/voiceroom/chat:${userId}`,
    RATE_LIMIT_CONFIGS.generateAudio,
  )
  if (!limit.success)
    return NextResponse.json(
      { success: false, error: 'Rate limit exceeded' },
      { status: 429 },
    )
  const parsed = VoiceRoomChatRequestSchema.safeParse(
    await request.json().catch(() => null),
  )
  if (!parsed.success)
    return NextResponse.json(
      { success: false, error: 'Invalid chat request' },
      { status: 400 },
    )
  try {
    return await streamVoiceRoomChat(userId, parsed.data, request.signal)
  } catch (error) {
    return NextResponse.json(
      isGenerationError(error)
        ? error.toJSON()
        : { success: false, error: 'The chat could not start.' },
      { status: isGenerationError(error) ? error.httpStatus : 500 },
    )
  }
}
