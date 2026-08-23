/**
 * 参考素材的**称呼**（`#1` / `#2`）—— 用户和模型共享的那套编号。
 *
 * **为什么需要它**：附件多了要能指定「第二张的配色」。以前的抓手是 `label`，而
 * 素材选择器把它填成了 generation 的完整 prompt —— owner 2026-08-19 定：**prompt
 * 不喂给模型**（画布也不喂）。抓手因此必须从「内容」换成「位置」。
 *
 * 三条约束，缺一条这套编号就是废的：
 *
 * 1. **按 kind 分别编号**。模型收到的是 `imageData[]` 和 `videoData[]` **两个独立
 *    数组**（见 `getAssistantMediaInputs` / `getNodeAssistantMediaInputs` 的
 *    `filter(kind === …)`）。混在一起编号的话，只要中间插一个视频，「第二张图」
 *    就指到别的东西上。（⚠ 这里原本记着「画布现在的清单是混编的」——**已过期**：
 *    `node-assistant.service.ts` 早就改成调这个函数了，两条路同源。）
 * 2. **编号从位置推导，不存进数据**。存下来的话删掉中间一张就全错位，而且历史
 *    会话里的旧编号会和当前列表对不上。
 * 3. **界面和提示词用同一个字符串**。用户在 chip 上看到 `#2`，才说得出 `#2`；
 *    看到的是「图2」而提示词里写 `image 2`，等于两套称呼，白编。所以这里刻意
 *    **不本地化** —— `#2` 在三语下是同一个符号。
 *
 * ⚠ **传进来的顺序就是编号顺序** —— 所以它由 `lib/assistant-media-selection.ts`
 * 决定，那里刻意把「选谁」和「按什么顺序发」拆成了两步。2026-08-22 之前两者是
 * 同一个数组（当前 → 历史**倒序**），后果是编号与转录区的阅读顺序相反、且同一张
 * 图每轮换号 —— 于是编号根本没法画在缩略图上，用户看到 `[image #1]` 无从对应。
 */

export interface AssistantReferenceLike {
  kind: 'image' | 'video'
}

/** 一条参考素材在**它自己那一类**里的序号（从 1 起）。 */
export function buildReferenceHandles(
  references: readonly AssistantReferenceLike[],
): string[] {
  const seen: Record<string, number> = {}
  return references.map((reference) => {
    seen[reference.kind] = (seen[reference.kind] ?? 0) + 1
    return `#${seen[reference.kind]}`
  })
}

/**
 * 提示词里那一行的标识：`[image #2]`。kind 写出来，因为图和视频各自从 #1 开始，
 * 光看 `#2` 分不清是哪一类。
 */
export function formatReferenceTag(
  kind: AssistantReferenceLike['kind'],
  handle: string,
): string {
  return `[${kind} ${handle}]`
}
