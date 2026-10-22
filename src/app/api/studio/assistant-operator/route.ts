import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { randomBytes } from 'node:crypto'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { AssistantOperatorRequestSchema } from '@/types/assistant-operator'
import {
  ASSISTANT_KERNEL_IDS,
  ASSISTANT_V3_FACES,
} from '@/constants/assistant-v3'
import { runAssistantOperator } from '@/services/kernel/assistant-operator.service'
import { runAssistantV3 } from '@/services/kernel/assistant-v3.service'
import { ASSISTANT_NEXT_DOMAINS } from '@/features/assistant/constants'
import { runAssistantNext } from '@/features/assistant/kernel'
import { isAdmin } from '@/lib/admin'
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
    const traceId = randomBytes(4).toString('hex')
    logger.warn(`${routeName} validation failed`, {
      userId: clerkId,
      traceId,
      issues,
    })
    return NextResponse.json(
      {
        success: false,
        error: 'Invalid request body',
        errorCode: 'VALIDATION_ERROR',
        traceId,
        ...(process.env.NODE_ENV !== 'production' && issues[0]
          ? { detail: `${issues[0].path}: ${issues[0].message}` }
          : {}),
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

    /**
     * 五张脸（画布、LoRA 台、图片台、角色页、视频台）都走 v3（S6）。本地开关选了 `v2`
     * 只有 **owner** 认（`isAdmin`，与管理后台同一道判据）：旧内核只为对比留着，⛔ 不让
     * 别人从浏览器里把自己切回去（owner 2026-10-15）。别人发了 `v2` 照走 v3。
     * v3 接不了的厂商在 v3 里自己退回旧内核。
     */
    const wantsLegacyKernel = parsed.data.kernel === ASSISTANT_KERNEL_IDS.v2
    const legacyKernelAllowed = wantsLegacyKernel && isAdmin(clerkId)
    if (wantsLegacyKernel && !legacyKernelAllowed) {
      logger.info(`${routeName} legacy kernel ignored (owner only)`, {
        userId: clerkId,
      })
    }
    const useV3 =
      ASSISTANT_V3_FACES.includes(parsed.data.domain) && !legacyKernelAllowed
    /**
     * 重设计的新内核（第 2 步骨架）：同样只有 owner 认，先只接图片台与 LoRA 台。
     * 别的台、别人发了 `next` 照走 v3。
     */
    const useNext =
      parsed.data.kernel === ASSISTANT_KERNEL_IDS.next &&
      ASSISTANT_NEXT_DOMAINS.includes(parsed.data.domain) &&
      isAdmin(clerkId)

    // ⚠ 工具环是惰性的（async generator）：它到成帧器 `for await` 才开始跑，所以
    //    `open` 帧一定排在第一次 LLM 往返之前。别在这里先 await 一下"预热"。
    return toAssistantOperatorSseResponse({
      routeName,
      signal: request.signal,
      events: (signal) =>
        useNext
          ? runAssistantNext(clerkId, parsed.data, { signal })
          : useV3
            ? runAssistantV3(clerkId, parsed.data, { signal })
            : runAssistantOperator(clerkId, parsed.data, { signal }),
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
