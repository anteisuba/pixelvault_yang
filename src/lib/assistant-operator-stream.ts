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

import { randomBytes } from 'node:crypto'

import { ASSISTANT_STREAM_CONTENT_TYPE } from '@/constants/assistant-stream'
import {
  ASSISTANT_OPERATOR_EVENTS,
  ASSISTANT_OPERATOR_INTERNAL_ERROR_CODE,
} from '@/constants/assistant-operator'
import type {
  AssistantOperatorErrorEvent,
  AssistantOperatorEvent,
} from '@/types/assistant-operator'
import { isGenerationError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { encodeSseEvent } from '@/lib/sse'

const ENCODER = new TextEncoder()

export const ASSISTANT_OPERATOR_FALLBACK_ERROR = {
  error: 'The assistant operator run failed midway.',
  errorCode: ASSISTANT_OPERATOR_INTERNAL_ERROR_CODE,
} as const

/**
 * 一次失败的**短码**（8 位十六进制）。用户屏幕上印一份、服务端日志里存一份，
 * 两边靠它对上 —— 这就是它存在的全部理由。
 *
 * ⚠ 短到 8 位是故意的：它是用来**念给我们听**的（截图 / 口述 / 粘一行），
 * ⛔ 不是全局唯一键，不进库、不做索引。
 */
function newTraceId(): string {
  return randomBytes(4).toString('hex')
}

/**
 * 异常 → 错误帧。
 *
 * ⭐ **非 `GenerationError` 不再只回一句兜底**（owner 2026-09-20 真机第 1 条，
 * 原话「我甚至不知道为什么出错」）：那一档现在带一个 `traceId`，非生产环境再带
 * 上原始 `message`。人话由**客户端**按 `errorCode` 取三语文案（服务端不知道用户
 * 的界面语言，也不该知道 —— 见 `use-assistant-operator.ts` 那张码表的头注）。
 *
 * ⛔ 生产环境**不下发 stack，也不下发原始 message**：栈里有路径与内部结构，
 * 它属于日志。用户手上有 `traceId` 就够我们在日志里把同一次失败捞出来。
 */
function toErrorEvent(error: unknown): AssistantOperatorErrorEvent {
  if (!isGenerationError(error)) {
    return {
      type: ASSISTANT_OPERATOR_EVENTS.error,
      ...ASSISTANT_OPERATOR_FALLBACK_ERROR,
      traceId: newTraceId(),
      ...(process.env.NODE_ENV === 'production'
        ? {}
        : {
            detail: error instanceof Error ? error.message : String(error),
          }),
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
        const event = toErrorEvent(error)
        /**
         * ⚠ `traceId` **与帧里那一份是同一个值**：日志这一行和用户屏幕上那八位
         * 是同一次失败的两端，⛔ 别在这里另生成一个。
         * ⚠ `stack` 只进日志（`lib/logger` 递归脱敏），⛔ 不进帧。
         */
        logger.error(`${options.routeName} operator stream failed`, {
          ...(event.traceId ? { traceId: event.traceId } : {}),
          error: error instanceof Error ? error.message : String(error),
          ...(error instanceof Error && error.stack
            ? { stack: error.stack }
            : {}),
        })
        send(event)
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
