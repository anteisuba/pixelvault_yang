/**
 * 待审队列（包 6 片 2 / `canvas-review-grid-2026-08-01.md` §④）。
 *
 * 纯函数、无 React，可单测。审阅模式的一切推进都从这里取顺序 —— UI 只负责显示
 * 「第几张 / 还剩几张」和飞相机。
 *
 * ── 为什么顺序记在记录上，而不是现算 ────────────────────────────────
 * §4.1 要求「按投影 / 生成顺序」推进：助手铺出来的顺序 = 剧本顺序 = 镜号顺序，
 * 那是用户心里的叙事顺序。这个顺序跨节点无处可取 —— 节点数组顺序是**创建**顺序
 * （拖动、删除、重排都会打乱它），一个节点内部 `mediaReview` 的插入顺序又只在
 * 该节点内成立。所以顺序由 `markedAt`（进队时间）承载，见
 * `NodeMediaReviewSchema.markedAt`。存量记录没有它，一律排在最前（先审老的）。
 *
 * **不用**生成完成时间：并发完成顺序是随机的，同一批会乱序。
 *
 * ── 幽灵条目 ────────────────────────────────────────────────────
 * 审核态按 URL 键控，而「重做」会写一个**新** URL 的记录，旧 URL 那条原样留着。
 * 若旧记录还停在 `awaiting_review`（人还没看就重做了），它就成了一条指向「卡上
 * 已经没有的图」的幽灵 —— 审它没有任何意义，还会让「还剩几张」骗人。所以队列只
 * 收**这张卡今天真的挂着**的 URL。
 */

import { NODE_REVIEW_STATE_IDS } from '@/constants/node-types'
import type {
  NodeWorkflowNode,
  NodeWorkflowNodeData,
} from '@/types/node-workflow'

export interface ReviewQueueItem {
  nodeId: string
  /** 审核态的键。同时也是队列项的身份 —— URL 全局唯一。 */
  url: string
  /** 进队时间；缺失（存量记录）视为最早。 */
  markedAt?: string
  /** 排序的稳定兜底，不参与身份判定。 */
  nodeIndex: number
}

/**
 * 这张卡今天真的挂着的图。
 *
 * 刻意不复用 `getNodeMediaUrl`（node-workflow-graph）：那个函数只回答「主媒体是
 * 哪一张」，这里要的是「审核态可以合法落在哪些 URL 上」—— 包含 `referenceAssets`，
 * 因为助手的 `set_review_state` op 能标到收集器里的任意一条。
 */
function collectLiveUrls(data: NodeWorkflowNodeData): Set<string> {
  const urls = new Set<string>()
  if (data.mediaUrl) urls.add(data.mediaUrl)
  if (data.imageUrl) urls.add(data.imageUrl)
  for (const reference of data.referenceAssets ?? []) {
    if (reference.url) urls.add(reference.url)
  }
  return urls
}

/** 队列顺序：进队时间 → 节点下标 → URL。全部可比，排序稳定。 */
export function compareReviewQueueItems(
  a: ReviewQueueItem,
  b: ReviewQueueItem,
): number {
  // 空串排在任何 ISO 时间串之前 —— 这就是「存量视为最早」。
  const left = a.markedAt ?? ''
  const right = b.markedAt ?? ''
  if (left !== right) return left < right ? -1 : 1
  if (a.nodeIndex !== b.nodeIndex) return a.nodeIndex - b.nodeIndex
  if (a.url === b.url) return 0
  return a.url < b.url ? -1 : 1
}

/** 同一张图？身份是（节点, URL），不含排序字段。 */
export function isSameReviewItem(
  a: ReviewQueueItem | null | undefined,
  b: ReviewQueueItem | null | undefined,
): boolean {
  return Boolean(a && b && a.nodeId === b.nodeId && a.url === b.url)
}

/** 全图的待审队列，已排好序。 */
export function collectReviewQueue(
  nodes: readonly NodeWorkflowNode[],
): ReviewQueueItem[] {
  const items: ReviewQueueItem[] = []
  nodes.forEach((node, nodeIndex) => {
    const review = node.data.mediaReview
    if (!review) return
    const live = collectLiveUrls(node.data)
    for (const [url, entry] of Object.entries(review)) {
      if (entry?.state !== NODE_REVIEW_STATE_IDS.awaitingReview) continue
      if (!live.has(url)) continue // 幽灵条目，见文件头
      items.push({
        nodeId: node.id,
        url,
        nodeIndex,
        ...(entry.markedAt ? { markedAt: entry.markedAt } : {}),
      })
    }
  })
  return items.sort(compareReviewQueueItems)
}

/**
 * 下一张 —— 先往后找，找不到再绕回队首。
 *
 * ⚠ 绕回是**必须**的，不是省事：§4.3「审完 = 队列空，不是走完一轮」。用户可能跳
 * 着审（点了别的卡再回来），队尾之后仍然可能有更早的没审过。绕回时**永远排除当前
 * 这一张**，所以队列里只剩它自己时返回 null，不会原地打转。
 */
export function findNextReviewItem(
  queue: readonly ReviewQueueItem[],
  current: ReviewQueueItem | null,
): ReviewQueueItem | null {
  if (!current) return queue[0] ?? null
  const after = queue.find((item) => compareReviewQueueItems(item, current) > 0)
  if (after) return after
  return queue.find((item) => !isSameReviewItem(item, current)) ?? null
}

/** 上一张 —— 与 `findNextReviewItem` 对称（往前找，找不到绕到队尾）。 */
export function findPrevReviewItem(
  queue: readonly ReviewQueueItem[],
  current: ReviewQueueItem | null,
): ReviewQueueItem | null {
  if (!current) return queue[queue.length - 1] ?? null
  for (let index = queue.length - 1; index >= 0; index -= 1) {
    const item = queue[index]
    if (item && compareReviewQueueItems(item, current) < 0) return item
  }
  for (let index = queue.length - 1; index >= 0; index -= 1) {
    const item = queue[index]
    if (item && !isSameReviewItem(item, current)) return item
  }
  return null
}

/**
 * 同一个节点上「上一版」的 URL —— 打回后那一屏的**新旧双联对比**用（§⑤ 残余
 * 用途）。
 *
 * 打回只改状态、**不删媒体**（`rejectMedia` 的注释与 §5-W3），所以被打回的那一版
 * 一直还在 `mediaReview` 里挂着 `rejected`。取最近被打回的那一条：用户想比的是
 * 「刚才被我否掉的那张」和「改词之后新出的这张」。
 */
export function findPreviousVersionUrl(
  data: NodeWorkflowNodeData,
  currentUrl: string,
): string | undefined {
  const review = data.mediaReview
  if (!review) return undefined
  let bestUrl: string | undefined
  let bestAt = ''
  for (const [url, entry] of Object.entries(review)) {
    if (url === currentUrl) continue
    if (entry?.state !== NODE_REVIEW_STATE_IDS.rejected) continue
    const reviewedAt = entry.reviewedAt ?? ''
    // `>=` 让同刻（或都没时间戳）的取插入顺序里靠后的那条。
    if (bestUrl === undefined || reviewedAt >= bestAt) {
      bestUrl = url
      bestAt = reviewedAt
    }
  }
  return bestUrl
}
