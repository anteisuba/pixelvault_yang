import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import {
  AssistantTurnReplayQuerySchema,
  AssistantTurnStopRequestSchema,
} from '@/types/assistant-operator'
import { assistantTurnReplayResponse } from '@/features/assistant/server'
import { rateLimit } from '@/lib/rate-limit'

/** 与助手主路由同一个上限：一轮还在跑时这条流要陪它跑完（见 `ASSISTANT_TURN_LOG.replayBudgetMs`）。 */
export const maxDuration = 800

/**
 * 接回一轮（回合托管第 3 片）：按序号补放这一轮的事件日志，还在跑就接着推。
 * 出的是结构化事件流，不走工厂（工厂出 JSON 信封）。日志按 Clerk 用户 id 分键：别人的轮号读不到。
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ turnId: string }> },
): Promise<Response> {
  const routeName = 'GET /api/studio/assistant-operator/turns/[turnId]'
  const { userId: clerkId } = await auth()
  if (!clerkId)
    return NextResponse.json(
      { success: false, error: 'Unauthorized', errorCode: 'UNAUTHORIZED' },
      { status: 401 },
    )

  const limited = await rateLimit(
    `${routeName}:${clerkId}`,
    RATE_LIMIT_CONFIGS.authedRead,
  )
  if (!limited.success)
    return NextResponse.json(
      {
        success: false,
        error: 'Rate limit exceeded',
        errorCode: 'RATE_LIMIT_EXCEEDED',
      },
      { status: 429 },
    )

  const turn = AssistantTurnStopRequestSchema.safeParse({
    turnId: (await context.params).turnId,
  })
  const query = AssistantTurnReplayQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  )
  if (!turn.success || !query.success)
    return NextResponse.json(
      {
        success: false,
        error: 'Invalid request',
        errorCode: 'VALIDATION_ERROR',
      },
      { status: 400 },
    )

  return assistantTurnReplayResponse({
    clerkId,
    turnId: turn.data.turnId,
    after: query.data.after,
    signal: request.signal,
    routeName,
  })
}
