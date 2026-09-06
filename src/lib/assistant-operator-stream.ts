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

// ─── 正文的逐字增量 ─────────────────────────────────────────────

/**
 * JSON 字符串里的转义表（`\uXXXX` 单独走一支）。
 *
 * ⚠ 表外的转义**按原字符吐**（`\q` → `q`）：模型偶尔写出非法转义，为此把整轮正文
 * 静默丢掉不值得 —— 定稿帧随后会把这一段整体覆盖掉。
 */
const JSON_STRING_ESCAPES: Readonly<Record<string, string>> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
}

/** `"message": "` —— 键到值那一跳。 */
const MESSAGE_KEY = /"message"\s*:\s*"/
/** `"tool":` —— 见下面 `muted` 那一段。 */
const TOOL_KEY = /"tool"\s*:/
const HEX4 = /^[0-9a-fA-F]{4}$/

export interface OperatorMessageStreamer {
  /**
   * 喂一块原文，拿回**这一块新解出来的那几个字**（没有就是空串）。
   *
   * ⚠ 返回增量而不是累积值：累积在客户端做，见 `ASSISTANT_OPERATOR_EVENTS.messageDelta`。
   */
  push(chunk: string): string
}

/**
 * 从**半截 turn JSON** 里边收边解出 `message` 字段（owner 2026-09-06「助手回复
 * 应该一个字一个字连续出」）。
 *
 * ⭐ 为什么是「解半截 JSON」而不是别的两条路：
 *  · 让模型改成「先流正文、再给 JSON 块」的两段协议 —— 那是把整份 OUTPUT 契约
 *    推倒重来，工具环每一条纪律都要重新验一遍，代价与收益完全不成比例。
 *  · 收尾轮再补一次流式补全 —— 多一次 LLM 往返，用户为同一段话付两次钱。
 *  这一条一次往返都不多花：本来就要收的那些字节，边收边解。
 *
 * ── ⚠ 工具轮闭嘴（`muted`）────────────────────────────────────────
 * 这一颗解不出「这一轮到底会不会调工具」—— 那要等整个对象收完。判据因此是**键的
 * 先后**：OUTPUT 格式把 `"tool"` 排在 `"message"` 前面，所以 `"tool"` 先到 = 工具
 * 轮，整轮闭嘴。
 * ⚠ 模型不守这个顺序时两种失败**都是良性的**：
 *  · 漏吐（该流没流）= 退回今天的行为，一次性刷出；
 *  · 多吐（工具轮流了）= 定稿帧随后整体覆盖，用户看到的是一段过程旁白在长。
 * ⛔ 所以别为了这条顺序去加重试 / 去作废整轮 —— 那才是把良性偏差变成事故。
 */
export function createOperatorMessageStreamer(): OperatorMessageStreamer {
  let raw = ''
  /** `message` 字符串体里下一个待解字符的下标；-1 = 键还没到。 */
  let cursor = -1
  let muted = false
  let finished = false

  function drain(): string {
    let out = ''
    while (cursor < raw.length) {
      const char = raw[cursor]!
      if (char === '"') {
        finished = true
        break
      }
      if (char !== '\\') {
        out += char
        cursor += 1
        continue
      }
      const next = raw[cursor + 1]
      // 转义还没到齐 —— 停在反斜杠上，下一块补上再解。
      if (next === undefined) break
      if (next === 'u') {
        const hex = raw.slice(cursor + 2, cursor + 6)
        if (hex.length < 4) break
        if (!HEX4.test(hex)) {
          muted = true
          return out
        }
        // ⚠ 代理对被拆在两个 `\uXXXX` 里时，两半各自拼上去就自动合回一个字符。
        out += String.fromCharCode(Number.parseInt(hex, 16))
        cursor += 6
        continue
      }
      out += JSON_STRING_ESCAPES[next] ?? next
      cursor += 2
    }
    return out
  }

  return {
    push(chunk: string): string {
      raw += chunk
      if (muted || finished) return ''
      if (cursor < 0) {
        const match = MESSAGE_KEY.exec(raw)
        if (!match) {
          if (TOOL_KEY.test(raw)) muted = true
          return ''
        }
        if (TOOL_KEY.test(raw.slice(0, match.index))) {
          muted = true
          return ''
        }
        cursor = match.index + match[0].length
      }
      return drain()
    },
  }
}
