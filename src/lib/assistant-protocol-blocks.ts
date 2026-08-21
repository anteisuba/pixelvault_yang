/**
 * 从助手回复正文里取出 A2 对话协议的四个块（`[[ask]]` 结构化反问 / `[[next]]`
 * 收敛选项 / `[[prompt]]` 提示词载荷 / `[[setup]]` 工作台配置提案），并给出剥
 * 干净的正文。
 *
 * **为什么在 `lib/` 而不在 service 里**：studio 三域改成流式后，抽取必须在客户端
 * 边收边做 —— 服务端只负责把字往外吐，它拿不到「用户已经看到多少」这个状态。
 * 这与画布的 `node-assistant-ops` 是同一条路数，也是同一个理由。
 *
 * ⚠ **流式安全的三条规则在 `lib/assistant-marker-block.ts`**，别在这里重写一份。
 * 那三条是 `[[canvas-ops]]` 的真机事故换来的，两份规则迟早分叉，分叉的表现是
 * 「某一种标记会静默消失」。
 */

import { extractMarkerBlock } from '@/lib/assistant-marker-block'
import { ASSISTANT_PROTOCOL_MARKER_IDS } from '@/constants/assistant-protocol'
import {
  AssistantAskBlockSchema,
  AssistantNextStepSchema,
  AssistantPromptBlockSchema,
  AssistantSetupBlockSchema,
  type AssistantClarifyingQuestion,
  type AssistantNextStep,
  type AssistantPromptBlock,
  type AssistantSetupBlock,
} from '@/types/assistant-protocol'

export interface AssistantProtocolExtraction {
  /** 正文，已剥掉两个协议块（含还没写完的那半截）。 */
  content: string
  /** 结构化反问；没有、或还在流式写入时为 undefined。 */
  ask?: AssistantClarifyingQuestion[]
  /** 收敛选项；同上。 */
  next?: AssistantNextStep
  /**
   * 档 3 的提示词载荷。**回填按钮只认这个，不再动 `content`** —— 以前填的是整条
   * 消息，把散文和参数建议一起灌进了正面提示词框。
   */
  promptDraft?: AssistantPromptBlock
  /**
   * 工作台配置提案（选模型 / 设张数）。**可以出现在任何档位** —— 与 `promptDraft`
   * 不同，它不代表「交付了提示词」。
   */
  setup?: AssistantSetupBlock
  /**
   * 出现了**完整**的协议块却读不出载荷。不吞：用户至少要知道「助手想给你选项但
   * 没说清楚」。静默吞掉的表现是「有时候有按钮有时候没有」，最难排查。
   */
  protocolMalformed?: boolean
}

/**
 * 四块串着抽（前一次的剥净正文喂给后一次）。
 *
 * `streamComplete` 必须如实传：流没结束时传 true，会让「才写了一半的块」被当成
 * 完整载荷解析出来，用户看到一张基于半截 JSON 的卡；流结束了还传 false，会让
 * 「载荷写完但闭合标记写歪了」永远藏着，用户看到一句开场白然后什么都没有。
 * 两种都真机踩过。
 */
export function extractAssistantProtocolBlocks(
  rawContent: string,
  options: { streamComplete?: boolean } = {},
): AssistantProtocolExtraction {
  const { streamComplete = false } = options

  const askBlock = extractMarkerBlock(rawContent, {
    marker: ASSISTANT_PROTOCOL_MARKER_IDS.ask,
    schema: AssistantAskBlockSchema,
    streamComplete,
  })
  const nextBlock = extractMarkerBlock(askBlock.content, {
    marker: ASSISTANT_PROTOCOL_MARKER_IDS.next,
    schema: AssistantNextStepSchema,
    streamComplete,
  })
  const promptBlock = extractMarkerBlock(nextBlock.content, {
    marker: ASSISTANT_PROTOCOL_MARKER_IDS.prompt,
    schema: AssistantPromptBlockSchema,
    streamComplete,
  })
  const setupBlock = extractMarkerBlock(promptBlock.content, {
    marker: ASSISTANT_PROTOCOL_MARKER_IDS.setup,
    schema: AssistantSetupBlockSchema,
    streamComplete,
  })

  const malformed =
    askBlock.malformed ||
    nextBlock.malformed ||
    promptBlock.malformed ||
    setupBlock.malformed

  return {
    content: setupBlock.content,
    ...(askBlock.payload ? { ask: askBlock.payload.questions } : {}),
    ...(nextBlock.payload ? { next: nextBlock.payload } : {}),
    ...(promptBlock.payload ? { promptDraft: promptBlock.payload } : {}),
    ...(setupBlock.payload ? { setup: setupBlock.payload } : {}),
    ...(malformed ? { protocolMalformed: true } : {}),
  }
}
