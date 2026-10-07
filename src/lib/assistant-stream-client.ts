/**
 * 助手流的**客户端读帧**。
 *
 * ⚠ 与 `lib/assistant-stream.ts`（服务端成帧）分文件，是为了别把服务端的 logger
 * 和错误类拖进客户端 bundle。共用的只有 `lib/sse.ts` 的编解码和事件名常量——
 * 也就是协议本身。
 *
 * ── 纪律：一帧坏载荷不该让整条对话失败 ──────────────────────────────
 * 每一帧都 `safeParse`，解不出来就丢这一帧继续读。这条是从旧的响应头方案继承来
 * 的（「回执坏了不该让一次对话失败」），只是现在落在 schema 上而不是一个
 * try/catch 里。⛔ 别改成抛错：那会让一条本来能读完的回答整段消失。
 */

import { ASSISTANT_STREAM_EVENTS } from '@/constants/assistant-stream'
import {
  AssistantStreamErrorFrameSchema,
  AssistantStreamLoraFrameSchema,
  AssistantStreamResearchFrameSchema,
  AssistantStreamTextFrameSchema,
} from '@/types/assistant-stream'
import type { LoraCandidateSearchResult } from '@/types/lora-candidate'
import type { ResearchReceipt } from '@/types/research'
import { parseSseStream } from '@/lib/sse'

/**
 * 判别联合 —— 消费者 `switch (message.type)` 即可，不用认识 SSE 的事件名。
 *
 * `open` / `done` 不出现在这里：前者是纯粹的传输层握手（把响应头顶出去），后者
 * 等价于「迭代自然结束」。把它们暴露给业务层只会多两个没人处理的分支。
 */
export type AssistantStreamMessage =
  | { type: 'text'; delta: string }
  | { type: 'research'; receipt: ResearchReceipt }
  | { type: 'lora'; candidates: LoraCandidateSearchResult }
  | { type: 'error'; error: string; errorCode?: string; i18nKey?: string }

function parseFrame(
  event: string,
  data: string,
): AssistantStreamMessage | null {
  let payload: unknown
  try {
    payload = JSON.parse(data)
  } catch {
    return null
  }

  switch (event) {
    case ASSISTANT_STREAM_EVENTS.text: {
      const parsed = AssistantStreamTextFrameSchema.safeParse(payload)
      return parsed.success ? { type: 'text', delta: parsed.data.delta } : null
    }
    case ASSISTANT_STREAM_EVENTS.research: {
      const parsed = AssistantStreamResearchFrameSchema.safeParse(payload)
      return parsed.success ? { type: 'research', receipt: parsed.data } : null
    }
    case ASSISTANT_STREAM_EVENTS.lora: {
      const parsed = AssistantStreamLoraFrameSchema.safeParse(payload)
      return parsed.success ? { type: 'lora', candidates: parsed.data } : null
    }
    case ASSISTANT_STREAM_EVENTS.error: {
      const parsed = AssistantStreamErrorFrameSchema.safeParse(payload)
      return parsed.success ? { type: 'error', ...parsed.data } : null
    }
    default:
      // `open` / `done` / 将来新增的帧：认不得就跳过。**老客户端不会因为服务端
      // 多发一种帧而崩** —— 这是帧协议相对「把东西塞进正文」的另一处好处。
      return null
  }
}

export async function* readAssistantStream(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<AssistantStreamMessage> {
  for await (const frame of parseSseStream(body)) {
    const message = parseFrame(frame.event, frame.data)
    if (message) yield message
  }
}
