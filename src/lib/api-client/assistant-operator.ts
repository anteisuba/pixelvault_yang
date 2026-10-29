/**
 * 操作员流的**客户端读帧**（P2 的第一件事，Hard Rule 3：组件不 fetch）。
 *
 * 与 `lib/assistant-stream-client.ts` 是姐妹件：那条流的载荷是文本增量，这条流的
 * 载荷是结构化事件。共用的只有 `lib/sse.ts` 的解码 —— 也就是协议本身。
 *
 * 已完成步骤保留；坏帧或缺少终态必须报告中断，不能跳过执行回执继续生成。
 *
 * ── 纪律 ②：`signal` 必须一路传到 `fetch` ───────────────────────
 * 插话与 ⏹ 都是「abort 当前流 + 带前情重发」（拍板 13），而 abort 的落点就是这里
 * 的 `fetch`。只在读循环里 `break` 是不够的：连接不断，服务端会把剩下的步数
 * （每步一次 LLM 往返）跑完 —— 用户按了停，账单照跑。
 */

import { API_ENDPOINTS } from '@/constants/config'
import { ASSISTANT_OPERATOR_EVENTS } from '@/constants/assistant-operator'
import { STUDIO_OPERATOR_STREAMING } from '@/constants/studio-assistant-operator'
import { getErrorPayload } from '@/lib/api-client/shared'
import { parseSseStream } from '@/lib/sse'
import {
  AssistantOperatorEventSchema,
  type AssistantAssetWriteRevert,
  type AssistantAssetWriteRevertResult,
  type AssistantOperatorEvent,
  type AssistantOperatorRequest,
} from '@/types/assistant-operator'
import { apiFetch } from '@/lib/api-client/api-fetch'

export type AssistantOperatorStreamApiResponse =
  | { success: true; events: AsyncIterable<AssistantOperatorEvent> }
  | {
      success: false
      error: string
      errorCode?: string
      i18nKey?: string
      traceId?: string
      detail?: string
    }

/**
 * 逐事件读一条操作员流。
 *
 * ⚠ 成帧器发的是 `encodeSseEvent(event.type, event)` —— **事件名与载荷里的
 * `type` 是同一个值**，所以这里只认载荷、不认事件名。多一条「事件名要和 type
 * 对上」的校验只会在将来某次改名时制造一个静默丢帧的分支。
 */
/**
 * **断流看门狗**（2026-10-17 真机：「正在想… 795 秒」一直数）。
 *
 * 服务端函数最多活 `maxDuration` 秒，到点前自己发 `stopped`；平台杀函数时连接也会断。
 * 可连接若被中间层吊住（不关也不来字），`reader.read()` 会永远挂着 —— 界面就一直
 * 「正在想」。这里给每一次读加一个上限：超过它一个字节都没来就当断流，按正常的
 * 「缺终态 = 中断」收尾（见下面 `interrupted`）。
 */
function withIdleTimeout(
  body: ReadableStream<Uint8Array>,
  idleMs: number,
): ReadableStream<Uint8Array> {
  const reader = body.getReader()
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      let timer: ReturnType<typeof setTimeout> | undefined
      const idle = new Promise<'idle'>((resolve) => {
        timer = setTimeout(() => resolve('idle'), idleMs)
      })
      try {
        const result = await Promise.race([reader.read(), idle])
        if (result === 'idle') {
          await reader.cancel().catch(() => undefined)
          controller.close()
          return
        }
        if (result.done) controller.close()
        else controller.enqueue(result.value)
      } catch (error) {
        controller.error(error)
      } finally {
        clearTimeout(timer)
      }
    },
    cancel(reason) {
      return reader.cancel(reason)
    },
  })
}

export async function* readAssistantOperatorStream(
  rawBody: ReadableStream<Uint8Array>,
  idleMs: number = STUDIO_OPERATOR_STREAMING.streamIdleTimeoutMs,
): AsyncIterable<AssistantOperatorEvent> {
  const body = withIdleTimeout(rawBody, idleMs)
  const interrupted: AssistantOperatorEvent = {
    type: ASSISTANT_OPERATOR_EVENTS.error,
    error:
      'The assistant stream was interrupted. Completed steps were preserved.',
    errorCode: 'STREAM_INTERRUPTED',
  }
  let terminalReceived = false
  try {
    for await (const frame of parseSseStream(body)) {
      let payload: unknown
      try {
        payload = JSON.parse(frame.data)
      } catch {
        yield interrupted
        return
      }
      const parsed = AssistantOperatorEventSchema.safeParse(payload)
      if (!parsed.success) {
        yield interrupted
        return
      }
      const event = parsed.data
      terminalReceived ||=
        event.type === ASSISTANT_OPERATOR_EVENTS.done ||
        event.type === ASSISTANT_OPERATOR_EVENTS.stopped ||
        event.type === ASSISTANT_OPERATOR_EVENTS.error
      yield event
      if (event.type === ASSISTANT_OPERATOR_EVENTS.error) return
    }
    if (!terminalReceived) yield interrupted
  } finally {
    await body.cancel().catch(() => undefined)
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
    const response = await apiFetch(API_ENDPOINTS.STUDIO_ASSISTANT_OPERATOR, {
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
        ...(payload.traceId ? { traceId: payload.traceId } : {}),
        ...(payload.detail ? { detail: payload.detail } : {}),
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

/**
 * **撤销一条素材库写操作**（v2 §10）—— 四条工具共用的那个入口。
 *
 * ⚠ 交出去的是 step 上那份 `inverse` **原样**（`lib/studio-operator-apply.ts`
 * 的 `revertOperatorStep` 从 step 上取的那一份），⛔ 客户端不重算原值：算第二遍
 * 就有第二份判据，而应用与撤销必须是同一份判据的两侧。
 * ⚠ 失败**只回一个布尔**：撤销失败的落点在调用方的 toast 上，⛔ 别在这里抛 ——
 * 一条撤不掉的步不该让整条撤销链断掉（同 `deleteProjectRuleAPI` 的判据）。
 */
export async function revertAssistantAssetWriteAPI(
  input: AssistantAssetWriteRevert,
): Promise<AssistantAssetWriteRevertResult | null> {
  try {
    const response = await apiFetch(
      API_ENDPOINTS.ASSISTANT_ASSET_WRITE_REVERT,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
    )
    if (!response.ok) return null
    const body = (await response.json()) as {
      success?: boolean
      data?: AssistantAssetWriteRevertResult
    }
    return body.success && body.data ? body.data : null
  } catch {
    return null
  }
}
