/**
 * 一轮助手请求要带哪些参考素材、**按什么顺序带**。
 *
 * ── 为什么「选谁」和「按什么顺序」必须分开 ────────────────────────────
 * 这两件事此前是同一个数组，于是被同一个优先级排序统治，结果是**编号骗人**：
 *
 * - 选取要按优先级：当前这轮附的、以及最近的历史，必须优先保命，超出
 *   `maxReferences` 时先丢老的。
 * - 编号（`buildReferenceHandles`）却必须按**对话顺序**：用户从上往下读转录区，
 *   `#3` 就该是从上往下第三张。
 *
 * 合成一条时（旧行为：当前 → 历史**倒序**）产生两个用户可见的错：
 *
 * 1. **编号与阅读顺序相反** —— 越新的历史图编号越小，转录区却是正序排的。
 * 2. **同一张图每轮换号** —— 第 3 轮叫 `#2` 的图，第 4 轮新附一张就变 `#3`。
 *    编号一直在漂，所以「把编号画在缩略图上」这件事**做不到诚实**，
 *    而不画的后果就是 2026-08-22 owner 撞到的：助手说 `[image #1]` 和
 *    `[image #6]`，用户根本不知道是哪张。
 *
 * 现在：**按优先级选，按对话顺序发**。同一张图的编号只在触发截断（>上限）时
 * 才会变，缩略图上的编号因此可以长期正确。
 *
 * ⚠ 去重按 `url` 且**保留最早那次出现的位置** —— 一张图被重新附一次不该跳到
 *   队尾换个新号。
 * ⚠ 这个文件只管「带哪些、什么顺序」；叫什么名字（`#1` / `[image #1]`）在
 *   `lib/assistant-reference-handles.ts`。两半必须一起读：顺序变了编号就变了。
 */

export interface ConversationMediaMessageLike<TReference> {
  mediaReferences?: readonly TReference[]
}

export interface CollectConversationMediaOptions<TReference> {
  /** 送进模型的条数上限（各域自己的常量）。 */
  maxReferences: number
  /**
   * 落地前的逐条归一（可选）。studio 那条用它把 `label` 截到 schema 上限——
   * 素材选择器把 generation 的完整 prompt 塞进了 label，**历史会话里已经存了
   * 超长的**，所以只修选择器救不了旧行，得夹在这个漏斗上。
   */
  normalize?: (reference: TReference) => TReference
}

/**
 * 汇总这一轮要带的参考素材。
 *
 * @param messages 整段对话，**正序**（老 → 新）。
 * @param current  这一轮编辑器里挂着、还没发出去的附件。
 */
export function collectConversationMediaReferences<
  TReference extends { url: string },
>(
  messages: readonly ConversationMediaMessageLike<TReference>[],
  current: readonly TReference[],
  { maxReferences, normalize }: CollectConversationMediaOptions<TReference>,
): TReference[] {
  // ① 选取：当前 → 历史由新到老。这一步只决定**谁活下来**。
  const byPriority: TReference[] = [
    ...current,
    ...[...messages]
      .reverse()
      .flatMap((message) => message.mediaReferences ?? []),
  ]

  const selected = new Set<string>()
  for (const reference of byPriority) {
    if (selected.size >= maxReferences) break
    selected.add(reference.url)
  }

  // ② 发出：对话顺序（老 → 新），当前这轮附的排在最后——它们就是最新的。
  //    ⚠ 用 Map 保留**首次出现**的位置，重复附同一张不改它的位次。
  const inConversationOrder = new Map<string, TReference>()
  for (const reference of [
    ...messages.flatMap((message) => message.mediaReferences ?? []),
    ...current,
  ]) {
    if (!selected.has(reference.url)) continue
    if (inConversationOrder.has(reference.url)) continue
    inConversationOrder.set(
      reference.url,
      normalize ? normalize(reference) : reference,
    )
  }

  return [...inConversationOrder.values()]
}
