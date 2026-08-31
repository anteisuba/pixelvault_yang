/**
 * 操作员流的**客户端读帧**（P2 的第一件事，Hard Rule 3：组件不 fetch）。
 *
 * 与 `lib/assistant-stream-client.ts` 是姐妹件：那条流的载荷是文本增量，这条流的
 * 载荷是结构化事件。共用的只有 `lib/sse.ts` 的解码 —— 也就是协议本身。
 *
 * ── 纪律 ①：一帧坏载荷不该让整轮失败 ─────────────────────────────
 * 每一帧 `safeParse`，解不出来就丢这一帧继续读（照抄 `assistant-stream-client.ts`
 * 的那条）。⛔ 别改成抛错：那会让一条本来能跑完的工具环整段消失，而用户已经
 * 看到前几步落地了 —— 表单被改了一半、线程却报「失败」。
 *
 * ── 纪律 ②：`signal` 必须一路传到 `fetch` ───────────────────────
 * 插话与 ⏹ 都是「abort 当前流 + 带前情重发」（拍板 13），而 abort 的落点就是这里
 * 的 `fetch`。只在读循环里 `break` 是不够的：连接不断，服务端会把剩下的步数
 * （每步一次 LLM 往返）跑完 —— 用户按了停，账单照跑。
 */

import { API_ENDPOINTS } from '@/constants/config'
import { getErrorPayload } from '@/lib/api-client/shared'
import { parseSseStream } from '@/lib/sse'
import {
  AssistantOperatorEventSchema,
  type AssistantOperatorEvent,
  type AssistantOperatorRequest,
} from '@/types/assistant-operator'

export type AssistantOperatorStreamApiResponse =
  | { success: true; events: AsyncIterable<AssistantOperatorEvent> }
  | { success: false; error: string; errorCode?: string; i18nKey?: string }

/**
 * 逐事件读一条操作员流。
 *
 * ⚠ 成帧器发的是 `encodeSseEvent(event.type, event)` —— **事件名与载荷里的
 * `type` 是同一个值**，所以这里只认载荷、不认事件名。多一条「事件名要和 type
 * 对上」的校验只会在将来某次改名时制造一个静默丢帧的分支。
 */
export async function* readAssistantOperatorStream(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<AssistantOperatorEvent> {
  for await (const frame of parseSseStream(body)) {
    let payload: unknown
    try {
      payload = JSON.parse(frame.data)
    } catch {
      continue
    }
    const parsed = AssistantOperatorEventSchema.safeParse(payload)
    // 认不得就跳过：老客户端不会因为服务端多发一种帧而崩。
    if (parsed.success) yield parsed.data
  }
}

/**
 * 发一轮。
 *
 * `signal` 由调用方持有（`AbortController` 住在 hook 里）—— ⏹ 与插话都靠它，
 * 所以它是必经参数而不是可选装饰。
 */
export async function streamAssistantOperatorAPI(
  request: AssistantOperatorRequest,
  options: { signal?: AbortSignal } = {},
): Promise<AssistantOperatorStreamApiResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.STUDIO_ASSISTANT_OPERATOR, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: options.signal,
    })

    if (!response.ok) {
      const payload = await getErrorPayload(
        response,
        `Assistant operator failed with status ${response.status}`,
      )
      return {
        success: false,
        error: payload.error,
        errorCode: payload.errorCode,
        i18nKey: payload.i18nKey,
      }
    }

    if (!response.body) {
      return {
        success: false,
        error: 'Assistant operator returned an empty stream',
        errorCode: 'EMPTY_STREAM',
      }
    }

    return { success: true, events: readAssistantOperatorStream(response.body) }
  } catch (error) {
    // abort 是**用户按的**，不是故障 —— 让调用方按名字分辨，别在这里当成错误
    // 往线程里插一条红字（那是插话时最常见的假失败）。
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { success: false, error: 'aborted', errorCode: 'ABORTED' }
    }
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}
