/**
 * 「看一眼刚生成的结果」这条请求的传递通道 —— 台账 L（owner 2026-08-29 真机）。
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────
 * 生成完成的 toast 上那颗「查看作品」原先是 `router.push(/gallery/<id>)`，两处都
 * 错：
 *
 *   ① **必然 404**。`/gallery/[id]` 走 `getPublicGenerationById`（`where: { id,
 *      isPublic: true }`），而 `Generation.isPublic` 在 schema 上默认 `false`
 *      —— 也就是说这个链接对**每一张刚生成的图**都注定 notFound，不是偶发。
 *   ② **更糟的是它是一次真导航**。工作台的全部编辑状态当场清空：挂好的参考图、
 *      写好的几百字提示词、模型与规格全没了，返回也回不来。owner 实测一次丢了
 *      5 张参考 + 约 500 字提示词。「看一眼结果」是生成完最自然的动作，而这个
 *      动作在惩罚用户。
 *
 * ── 为什么是一个模块级信号而不是 props ──────────────────────────────
 * 发起方是 `useUnifiedGenerate`（hook，注入在 studio-context），接收方是
 * `GenerationPreview`（`StudioCanvas` 里的叶子组件，自己已经持有 `detailOpen`
 * 与 `ImageDetailModal`）。两者之间隔着 context + 两层组件，为一个「打开浮层」
 * 的瞬时请求把回调穿三层，比这个 40 行的信号更重，而且会让
 * `StudioGenContextValue` 多一个只有一个消费者的字段。
 *
 * ⚠ 这是**瞬时信号**，不是状态：不保留最后一次请求，晚订阅的收不到。这正是要
 * 的语义 —— 「现在打开它」过期了就不该补触发。
 */

type Listener = (generationId: string) => void

const listeners = new Set<Listener>()

/** 请求打开某次生成的详情浮层。没有订阅者时静默丢弃（工作台没开着）。 */
export function requestStudioResultDetail(generationId: string): void {
  for (const listener of listeners) listener(generationId)
}

/** 订阅请求；返回退订函数。 */
export function subscribeStudioResultDetail(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
