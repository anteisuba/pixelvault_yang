/**
 * 从助手回复正文里取出 A2 对话协议的五个块（`[[ask]]` 结构化反问 / `[[next]]`
 * 收敛选项 / `[[prompt]]` 提示词载荷 / `[[setup]]` 工作台配置提案 / `[[lora]]`
 * LoRA 推荐），并给出剥干净的正文。
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
  AssistantLoraBlockSchema,
  AssistantNextStepSchema,
  AssistantPromptBlockSchema,
  AssistantSetupBlockSchema,
  type AssistantClarifyingQuestion,
  type AssistantLoraPick,
  type AssistantNextStep,
  type AssistantPromptBlock,
  type AssistantSetupBlock,
} from '@/types/assistant-protocol'
import type { LoraCandidate } from '@/types/lora-candidate'

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
   * LoRA 推荐（切片 3）。**只有 candidateId + 理由 + 建议权重** —— 卡面事实由
   * `narrowLoraPicksToCandidates` 从本轮候选列表里取，不来自模型。
   */
  loraPicks?: AssistantLoraPick[]
  /**
   * 出现了**完整**的协议块却读不出载荷。不吞：用户至少要知道「助手想给你选项但
   * 没说清楚」。静默吞掉的表现是「有时候有按钮有时候没有」，最难排查。
   */
  protocolMalformed?: boolean
}

/** 一条推荐 —— 模型给的理由 + 服务端给的事实，配对之后才够渲染一张卡。 */
export interface ResolvedLoraPick {
  pick: AssistantLoraPick
  candidate: LoraCandidate
}

/**
 * 把模型挑的 id 兑换成本轮真实候选。**命不中就丢掉那一条，不出卡。**
 *
 * ⚠ 这是 `[[setup]]` 的模型 id 查表在 LoRA 上的同一条路数，理由也一样：
 * 模型编一个 id 时，我们能做的只有「不渲染」——渲染一张查不到底的卡等于把
 * 「模型编的」和「上游真有的」混成同一种东西给用户看。
 *
 * 同一个 id 被挑两次只保留第一条：两张一样的卡就是两套状态，点一个亮两个。
 */
export function narrowLoraPicksToCandidates(
  picks: readonly AssistantLoraPick[] | undefined,
  candidates: readonly LoraCandidate[] | undefined,
): ResolvedLoraPick[] {
  if (!picks?.length || !candidates?.length) return []
  const byId = new Map(
    candidates.map((candidate) => [candidate.candidateId, candidate]),
  )
  const seen = new Set<string>()
  const resolved: ResolvedLoraPick[] = []
  for (const pick of picks) {
    const candidate = byId.get(pick.candidateId)
    if (!candidate || seen.has(pick.candidateId)) continue
    seen.add(pick.candidateId)
    resolved.push({ pick, candidate })
  }
  return resolved
}

/**
 * 五块串着抽（前一次的剥净正文喂给后一次）。
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
  // ⚠ `lora` 排在末尾不是随手排的：残缺开标记的扣留是**逐个标记**判的，
  // 尾巴上的 `[[lo` 前四轮谁都不认（`[[l` 不是 ask/next/prompt/setup 的前缀），
  // 只有轮到 `lora` 这一轮才扣得住。少了这一轮，用户会看着裸标记蹦出来又消失
  // —— 2026-08-21 `[[set` 那次泄漏的同一个通道。
  const loraBlock = extractMarkerBlock(setupBlock.content, {
    marker: ASSISTANT_PROTOCOL_MARKER_IDS.lora,
    schema: AssistantLoraBlockSchema,
    streamComplete,
  })

  const malformed =
    askBlock.malformed ||
    nextBlock.malformed ||
    promptBlock.malformed ||
    setupBlock.malformed ||
    loraBlock.malformed

  return {
    content: loraBlock.content,
    ...(askBlock.payload ? { ask: askBlock.payload.questions } : {}),
    ...(nextBlock.payload ? { next: nextBlock.payload } : {}),
    ...(promptBlock.payload ? { promptDraft: promptBlock.payload } : {}),
    ...(setupBlock.payload ? { setup: setupBlock.payload } : {}),
    ...(loraBlock.payload ? { loraPicks: loraBlock.payload.picks } : {}),
    ...(malformed ? { protocolMalformed: true } : {}),
  }
}
