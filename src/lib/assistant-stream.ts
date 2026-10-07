/**
 * 助手流的**服务端成帧器** —— 工作台三域与画布共用一份。
 *
 * 职责边界：service 只管产出文本增量（一个 `AsyncIterable<string>`），协议全在
 * 这里。这条边界是这次改造顺带立的——原先 service 自己 `new ReadableStream` 并
 * 在里面 `controller.error()`，等于把传输层的事塞进了内容层，于是两条路由各写一
 * 份、错误也只能以「读流异常」的形态出去。
 *
 * ⚠ **帧序有意义**：`open` 必须第一个（它负责把响应头顶出去），`research` /
 * `lora` 必须排在第一个 `text` 之前（客户端要在正文落地之前就能渲染来源与推荐
 * 卡，这与旧的响应头方案行为一致）。
 */

import {
  ASSISTANT_STREAM_CONTENT_TYPE,
  ASSISTANT_STREAM_EVENTS,
} from '@/constants/assistant-stream'
import type { AssistantStreamErrorFrame } from '@/types/assistant-stream'
import type { LoraCandidateSearchResult } from '@/types/lora-candidate'
import type { ResearchReceipt } from '@/types/research'
import { isGenerationError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { encodeSseEvent } from '@/lib/sse'

const ENCODER = new TextEncoder()

export const ASSISTANT_STREAM_FALLBACK_ERROR = {
  error: 'The assistant stream failed midway.',
  errorCode: 'ASSISTANT_STREAM_FAILED',
} as const satisfies AssistantStreamErrorFrame

function toErrorFrame(error: unknown): AssistantStreamErrorFrame {
  if (!isGenerationError(error)) return ASSISTANT_STREAM_FALLBACK_ERROR
  const payload = error.toJSON()
  return {
    error: payload.error,
    ...(payload.errorCode ? { errorCode: payload.errorCode } : {}),
    ...(payload.i18nKey ? { i18nKey: payload.i18nKey } : {}),
  }
}

export interface AssistantSseResponseOptions {
  /** 文本增量。⚠ 抛错交给成帧器变成 `error` 帧，别在 service 里吞掉。 */
  text: AsyncIterable<string>
  /** 检索回执；`null`/省略 = 这一轮没打源。 */
  research?: ResearchReceipt | null
  /** 本轮 LoRA 候选；`null`/省略 = 没搜。 */
  loraCandidates?: LoraCandidateSearchResult | null
  /** 出现在日志里的路由名，出错时用来定位是哪条流。 */
  routeName: string
}

export function toAssistantSseResponse(
  options: AssistantSseResponseOptions,
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(ENCODER.encode(encodeSseEvent(event, data)))
      }

      // ⭐ 第一件事，而且必须在任何 await 之前：这一帧产生的字节就是响应头得以
      //    flush 的原因。挪到模型开口之后 = 把 504 又请回来。
      send(ASSISTANT_STREAM_EVENTS.open, {})

      if (options.research) {
        send(ASSISTANT_STREAM_EVENTS.research, options.research)
      }
      if (options.loraCandidates?.candidates.length) {
        send(ASSISTANT_STREAM_EVENTS.lora, options.loraCandidates)
      }

      try {
        for await (const delta of options.text) {
          send(ASSISTANT_STREAM_EVENTS.text, { delta })
        }
        send(ASSISTANT_STREAM_EVENTS.done, {})
      } catch (error) {
        // 已经吐出去的字留在客户端；这里补一帧结构化的错误尾巴，而不是把流打断。
        // ⚠ 打断（旧的 `controller.error`）会让客户端只拿到一个读流异常——
        //    errorCode 和 i18nKey 全丢，UI 上「provider 超时」和「网断了」没法分辨。
        logger.error(`${options.routeName} stream failed`, {
          error: error instanceof Error ? error.message : String(error),
        })
        send(ASSISTANT_STREAM_EVENTS.error, toErrorFrame(error))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': ASSISTANT_STREAM_CONTENT_TYPE,
      'Cache-Control': 'no-store',
      // 反向代理（含 Vercel 前面那层）看到它就不再攒缓冲区——攒了就等于没有流。
      'X-Accel-Buffering': 'no',
    },
  })
}
