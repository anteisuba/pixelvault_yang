import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import {
  LORA_CANDIDATE_RECEIPT_HEADER,
  LORA_CANDIDATE_RECEIPT_HEADER_MAX_BYTES,
  LORA_CANDIDATE_RECEIPT_TIERS,
} from '@/constants/lora-candidate'
import { RESEARCH_RECEIPT_HEADER } from '@/constants/research'
import { PromptAssistantStreamRequestSchema } from '@/types'
import { createPromptAssistantStream } from '@/services/kernel/prompt-assistant.service'
import { logger } from '@/lib/logger'
import { isGenerationError } from '@/lib/errors'
import { encodeLoraCandidateReceiptHeader } from '@/lib/lora-candidate-receipt'
import { rateLimit } from '@/lib/rate-limit'
import { encodeResearchReceiptHeader } from '@/lib/research-receipt'

/**
 * Hobby 的真实上限就是 300（`docs/references/cicd.md`，2026-08-21 查证）；此前
 * 那个 60 是白留的余量，2026-08-24 被 Grok 一轮撞穿。
 *
 * ⚠ 它是兜底不是解法：真正让首字延迟不再等于整轮延迟的是 provider 的 SSE
 * （`LLM_TEXT_STREAMING_ADAPTERS`）。还没写 SSE 的那家在这里只是多拿 240 秒。
 */
export const maxDuration = 300

/**
 * 工作台三域助手的对话轮 —— 出逐字文本流。
 *
 * 这条不走 `api-route-factory`：工厂产出的是 JSON 信封，而这里的载荷是流本身。
 * 画布的 `POST /api/studio/node-assistant` 是同样的理由、同样的手写形态，两边
 * 的鉴权/限流/错误分支保持一致。
 *
 * 结构化的 LoRA 转换轮仍在 `POST /api/prompt/assistant`（JSON）。两条各有各的
 * 载荷形态，不合并 —— 一个端点按请求体决定返回 JSON 还是流，客户端没法预判。
 */
export async function POST(request: NextRequest): Promise<Response> {
  const startedAt = Date.now()
  const routeName = 'POST /api/prompt/assistant/stream'
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

  const parsed = PromptAssistantStreamRequestSchema.safeParse(
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
    const { stream, receipt, loraCandidates } =
      await createPromptAssistantStream(clerkId, parsed.data)

    const encodedReceipt = receipt ? encodeResearchReceiptHeader(receipt) : null
    // 候选下发同样走响应头（切片 3）。⚠ 载荷比回执大一个量级，所以编码器是带
    // 降级阶梯的 —— 掉档要在这里留痕，否则「有时候有推荐卡有时候没有」查不出来。
    const encodedCandidates = loraCandidates?.candidates.length
      ? encodeLoraCandidateReceiptHeader(loraCandidates)
      : null

    if (
      encodedCandidates &&
      encodedCandidates.tier !== LORA_CANDIDATE_RECEIPT_TIERS.full
    ) {
      logger.warn(`${routeName} lora candidate header degraded`, {
        userId: clerkId,
        tier: encodedCandidates.tier,
        bytes: encodedCandidates.bytes,
        limitBytes: LORA_CANDIDATE_RECEIPT_HEADER_MAX_BYTES,
        candidateCount: loraCandidates?.candidates.length ?? 0,
      })
    }

    logger.info(routeName, {
      userId: clerkId,
      durationMs: Date.now() - startedAt,
      researchStatus: receipt?.status,
      grounded: receipt?.grounded,
      loraCandidateCount: loraCandidates?.candidates.length,
      loraCandidateTier: encodedCandidates?.tier,
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        // 检索回执走响应头，**不进正文流**（编解码与上限见 lib/research-receipt）。
        ...(encodedReceipt
          ? { [RESEARCH_RECEIPT_HEADER]: encodedReceipt }
          : {}),
        ...(encodedCandidates?.value
          ? { [LORA_CANDIDATE_RECEIPT_HEADER]: encodedCandidates.value }
          : {}),
      },
    })
  } catch (error) {
    // 只有「还没开始出流」的失败会落到这里（路由解析、媒体能力闸、provider 首个
    // 请求被拒）。流开始之后再挂是 `controller.error`，客户端读流时才看得到。
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
        error: 'Prompt assistant failed',
        errorCode: 'PROMPT_ASSISTANT_FAILED',
      },
      { status: 500 },
    )
  }
}
