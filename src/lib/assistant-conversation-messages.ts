/**
 * 画布对话的**消息形状与引用标记剥离**（进度表 22）。
 *
 * ── 这个文件为什么从 `hooks/use-assistant-conversation.ts` 里剩下来 ──────
 * 画布 2026-09-19 并进操作员面板之后，那个 hook（会话状态机 + 发流）**没有调用
 * 方了** —— 画布的会话、历史、模型选择全部走 `useAssistantOperator`。但它文件里
 * 的消息形状与 `[[node:…]]` / `[[capability:…]]` 标记剥离**还有人用**：剧本笺
 * （`ScriptDocWorkspace`）与它下面那条只读对话（`AssistantConversation`）读的
 * 就是这一份，画布历史那条纯函数（`lib/node-assistant-history.ts`）也是。
 *
 * ⚠ 所以是**搬**不是重写：一个字都没改，只是从一个不再是 hook 的文件里挪出来。
 * ⛔ 别把它留在 `use-` 开头的文件里 —— 那个名字在本仓意味着「这里有个 hook」。
 */

import type { NodeAssistantOpV4Batch } from '@/types/node-assistant-ops'
import type {
  NodeAssistantMessage,
  NodeAssistantMediaReference,
} from '@/types/node-assistant'

export interface AssistantNodeReference {
  nodeId: string
}

export interface AssistantCapabilityReference {
  capability: 'upscale' | 'remove-background'
  nodeId: string
}

export interface AssistantConversationMessage {
  id: string
  role: NodeAssistantMessage['role']
  content: string
  references: AssistantNodeReference[]
  capabilities: AssistantCapabilityReference[]
  /** Stable image/video URLs attached to this user turn. */
  mediaReferences?: NodeAssistantMediaReference[]
  /**
   * 包 5 画布改动提案。流式写到一半时为 null —— 载荷没闭合就不算提案。
   *
   * ⚠ 入库的是**剥干净的正文**，所以提案**不跨刷新存活**。这是有意的：一条几分
   * 钟前针对另一张图的提案，重新加载后再点「应用」只会做错事。
   */
  ops?: NodeAssistantOpV4Batch | null
  /** 出现了完整的提案块却读不出来 —— 明说，不装作什么都没发生。 */
  opsMalformed?: boolean
}

/**
 * 引用标记的字面头部（写到自由 id 之前为止）。
 *
 * ⚠ **剥标记的正则与「扣留半截标记」的判定都从这里生成**：两份规则各写一遍迟早
 * 分叉，而分叉的表现就是「某一种标记会漏出去」。同一条结论见
 * `assistant-marker-block.ts` 文件头第 4 条。
 */
const REFERENCE_MARKER_HEADS = [
  '[[node:',
  '[[capability:upscale:',
  '[[capability:remove-background:',
] as const

/** 写完的样子：头部 + 至少一个字符的 id + `]]`。 */
const COMPLETE_REFERENCE_MARKERS = REFERENCE_MARKER_HEADS.map(
  (head) =>
    new RegExp(
      `${head.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\]]+\\]\\]`,
      'g',
    ),
)

/**
 * 尾巴上那截「还可能长成引用标记」的字符有多长 —— 与
 * `assistant-marker-block.ts` 的 `partialOpenMarkerLength` 是同一件事，只是这里的
 * 标记自带载荷（`:id]]`），所以头部写完之后还要继续扣着 id 那一段。
 *
 * ⚠ **只判尾巴**：流式文本只会从末尾长，中间的 `[[` 要么早就凑成了完整标记（上一
 * 步已经剥掉）、要么这辈子都凑不成。判定得出来立刻放行 —— 正文里的 `[1]`、
 * markdown 链接不会被永久吃掉，也不会被推迟到流结束才一次性蹦出来。
 */
function partialReferenceMarkerLength(value: string): number {
  let held = 0

  for (const head of REFERENCE_MARKER_HEADS) {
    // 头部还没写完：`[`、`[[`、`[[n`…`[[node:`
    for (let taken = 1; taken <= head.length; taken += 1) {
      if (taken > held && value.endsWith(head.slice(0, taken))) held = taken
    }

    // 头部写完了，正在写 id：`[[node:abc`，或只差最后一个方括号的 `[[node:abc]`
    const openIndex = value.lastIndexOf(head)
    if (openIndex < 0) continue
    const pending = value.length - openIndex
    if (
      pending > held &&
      /^[^\]]*\]?$/.test(value.slice(openIndex + head.length))
    ) {
      held = pending
    }
  }

  return held
}

export function stripNodeReferenceMarkers(
  content: string,
  /**
   * 流已经结束（不会再有 chunk 了）。没结束前，尾巴上写到一半的标记不外显 ——
   * 这个函数每来一个 chunk 就整段重跑一次，只剥「写完的」标记会让 `[[node`、
   * `[[capabilit` 这种半截标记原样渲染出去，用户看着裸标记蹦出来又消失。
   * ⛔ 别改成「等流结束再显示全部」：那会毁掉打字机，而打字机正是「传输与呈现
   * 解耦」这条结论的落点（见 `lib/assistant-typewriter.ts`）。
   */
  streamComplete: boolean,
): string {
  const stripped = COMPLETE_REFERENCE_MARKERS.reduce(
    (value, pattern) => value.replace(pattern, ''),
    content,
  )
  const visible = streamComplete
    ? stripped
    : stripped.slice(
        0,
        stripped.length - partialReferenceMarkerLength(stripped),
      )

  return visible.replace(/\n{3,}/g, '\n\n')
}
