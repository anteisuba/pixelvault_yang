import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { AssistantOperatorRequestSchema } from '@/types/assistant-operator'
import { runAssistantOperator } from '@/services/kernel/assistant-operator.service'
import { toAssistantOperatorSseResponse } from '@/lib/assistant-operator-stream'
import { isGenerationError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'

/** 与 `POST /api/prompt/assistant/stream` 同一个数：Hobby 的真实上限就是 300。 */
export const maxDuration = 300

/**
 * 工作台助手的**工具环**（P1）。出的是结构化事件流，不是文本流。
 *
 * 与 `POST /api/prompt/assistant/stream` 一样不走 `api-route-factory` —— 工厂产的
 * 是 JSON 信封，而这里的载荷是流本身。鉴权 / 限流 / 错误分支的形态与那条逐条对齐。
 *
 * ⛔ 这条路由**不创建任何 generation**，也没有任何一条工具能。钱闸是结构性的
 * （见 `services/kernel/assistant-operator.service.ts` 头注与 money-gate 测试）。
 */
export async function POST(request: NextRequest): Promise<Response> {
  const startedAt = Date.now()
  const routeName = 'POST /api/studio/assistant-operator'
  const authResult = await auth()
  const clerkId = authResult?.userId ?? null

  if (!clerkId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized', errorCode: 'UNAUTHORIZED' },
      { status: 401 },
    )
  }

  const rateLimitResult = await rateLimit(
    `${routeName}:${clerkId}`,
    RATE_LIMIT_CONFIGS.promptAssistant,
  )
  if (!rateLimitResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Rate limit exceeded',
        errorCode: 'RATE_LIMIT_EXCEEDED',
      },
      { status: 429 },
    )
  }

  const parsed = AssistantOperatorRequestSchema.safeParse(
    await request.json().catch(() => null),
  )
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 8).map((issue) => ({
      path: issue.path.join('.') || '(root)',
      code: issue.code,
      message: issue.message,
    }))
    logger.warn(`${routeName} validation failed`, { userId: clerkId, issues })
    return NextResponse.json(
      {
        success: false,
        error: 'Invalid request body',
        errorCode: 'VALIDATION_ERROR',
        details: issues[0]
          ? `${issues[0].path}: ${issues[0].message}`
          : undefined,
      },
      { status: 400 },
    )
  }

  try {
    logger.info(routeName, {
      userId: clerkId,
      domain: parsed.data.domain,
      priorSteps: parsed.data.priorSteps?.length ?? 0,
      hasConfirmations: Boolean(parsed.data.confirmations?.length),
      durationMs: Date.now() - startedAt,
    })

    // ⚠ 工具环是惰性的（async generator）：它到成帧器 `for await` 才开始跑，所以
    //    `open` 帧一定排在第一次 LLM 往返之前。别在这里先 await 一下"预热"。
    return toAssistantOperatorSseResponse({
      routeName,
      signal: request.signal,
      events: (signal) =>
        runAssistantOperator(clerkId, parsed.data, { signal }),
    })
  } catch (error) {
    // 只有「还没开始出流」的失败会落到这里。流开始之后再挂，是成帧器补的
    // `error` 事件 —— 客户端照样拿得到 errorCode / i18nKey。
    if (isGenerationError(error)) {
      logger.warn(`${routeName} provider error`, {
        errorCode: error.errorCode,
        httpStatus: error.httpStatus,
        durationMs: Date.now() - startedAt,
      })
      return NextResponse.json(error.toJSON(), { status: error.httpStatus })
    }

    logger.error(`${routeName} unhandled error`, {
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    })

    return NextResponse.json(
      {
        success: false,
        error: 'Assistant operator failed',
        errorCode: 'ASSISTANT_OPERATOR_FAILED',
      },
      { status: 500 },
    )
  }
}
