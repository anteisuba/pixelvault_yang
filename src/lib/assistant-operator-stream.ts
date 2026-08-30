/**
 * 操作员流的**服务端成帧器**。
 *
 * 与 `lib/assistant-stream.ts` 是姐妹件、不是替代品：那条流的载荷是**文本增量**，
 * 这条流的载荷是**结构化事件**。共用的东西（Content-Type、`open` 握手帧、SSE 编码）
 * 一律直接 import 过来，一个字符串都不抄。
 *
 * ⚠ **`open` 必须第一个，而且必须在任何 await 之前**：Next 要等这条流吐出第一个
 * 字节才 flush 响应头，而工具环的第一步是一次完整的 LLM 往返 —— 没有这一帧，
 * 平台超时就会变成 504（2026-08-24 生产实证，详见 `constants/assistant-stream.ts`）。
 *
 * ⚠ **取消要走到底**：客户端 abort（拍板 13 的插话 / ⏹）时，`cancel` 会 abort 我们
 * 自己的 controller，`for await` 随之 break，生成器的 `finally` 由此执行。别在这里
 * 只把流关掉不管生成器 —— 那才是「悬空 promise」的来源。
 */

import { ASSISTANT_STREAM_CONTENT_TYPE } from '@/constants/assistant-stream'
import { ASSISTANT_OPERATOR_EVENTS } from '@/constants/assistant-operator'
import type { AssistantOperatorEvent } from '@/types/assistant-operator'
import { isGenerationError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { encodeSseEvent } from '@/lib/sse'

const ENCODER = new TextEncoder()

export const ASSISTANT_OPERATOR_FALLBACK_ERROR = {
  error: 'The assistant operator run failed midway.',
  errorCode: 'ASSISTANT_OPERATOR_FAILED',
} as const

function toErrorEvent(error: unknown): AssistantOperatorEvent {
  if (!isGenerationError(error)) {
    return {
      type: ASSISTANT_OPERATOR_EVENTS.error,
      ...ASSISTANT_OPERATOR_FALLBACK_ERROR,
    }
  }
  const payload = error.toJSON()
  return {
    type: ASSISTANT_OPERATOR_EVENTS.error,
    error: payload.error,
    ...(payload.errorCode ? { errorCode: payload.errorCode } : {}),
    ...(payload.i18nKey ? { i18nKey: payload.i18nKey } : {}),
  }
}

export interface AssistantOperatorSseOptions {
  /**
   * 事件源。**收一个 signal** —— 客户端一走，工具环就该在下一步开始前停下来，
   * 而不是把剩下的步数（每步一次 LLM 往返）跑完再发现没人听。
   */
  events(signal: AbortSignal): AsyncIterable<AssistantOperatorEvent>
  /** 上游请求的 signal（Next 的 `request.signal`），与本地 controller 联动。 */
  signal?: AbortSignal
  /** 出错日志里的路由名。 */
  routeName: string
}

export function toAssistantOperatorSseResponse(
  options: AssistantOperatorSseOptions,
): Response {
  const controller = new AbortController()
  const abort = () => controller.abort()
  options.signal?.addEventListener('abort', abort, { once: true })

  /**
   * ⚠ 提到闭包外面，因为 `cancel` 也要写它：客户端断开之后 `close()` 会抛
   * `Invalid state`，而那个异常发生在 `start` 的异步体里 —— 表现是一条无人处理的
   * 拒绝，日志里只有一句莫名其妙的 TypeError。
   */
  let closed = false

  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      const send = (event: AssistantOperatorEvent) => {
        if (closed) return
        streamController.enqueue(
          ENCODER.encode(encodeSseEvent(event.type, event)),
        )
      }

      // ⭐ 第一件事，任何 await 之前。见文件头注。
      send({ type: ASSISTANT_OPERATOR_EVENTS.open })

      try {
        for await (const event of options.events(controller.signal)) {
          if (controller.signal.aborted) break
          send(event)
        }
      } catch (error) {
        // 已经吐出去的 step 留在客户端；这里补一帧结构化的错误尾巴，而不是把流
        // 打断 —— 打断的话客户端只拿到一个读流异常，errorCode / i18nKey 全丢。
        logger.error(`${options.routeName} operator stream failed`, {
          error: error instanceof Error ? error.message : String(error),
        })
        send(toErrorEvent(error))
      } finally {
        options.signal?.removeEventListener('abort', abort)
        if (!closed) {
          closed = true
          streamController.close()
        }
      }
    },
    cancel() {
      // 客户端断了。abort 之后 `for await` 会 break，生成器的 `finally` 随之执行；
      // 流本身已经由 cancel 关掉了，所以这里先把闸标上，别再 enqueue / close。
      closed = true
      controller.abort()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': ASSISTANT_STREAM_CONTENT_TYPE,
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  })
}
