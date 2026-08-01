'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { NODE_REVIEW_STATE_IDS } from '@/constants/node-types'
import { resolveMediaReviewState } from '@/lib/node-media-review'
import {
  collectReviewQueue,
  findNextReviewItem,
  findPrevReviewItem,
  isSameReviewItem,
  type ReviewQueueItem,
} from '@/lib/node-review-queue'
import type { NodeWorkflowNode } from '@/types/node-workflow'

/**
 * 显式审阅模式（包 6 片 2，owner 2026-08-01 拍板 ②-A）。
 *
 * 模式本身只有四件事：**队列 · 当前是哪张 · 怎么推进 · 什么时候结束**。视觉、相机
 * 和按钮都在外面 —— 这里不碰 DOM，可单测。
 *
 * ── 为什么「当前是哪张」是推导出来的，不是同步出来的 ──────────────────
 * 用户只钉住一个锚点（`pinned`），「现在该审哪张」由锚点 + 它今天的审核态**当场
 * 算**出来。§4.2 的不对称就落在这条推导里：还在队列里 → 就是它；已被打回 → 停在
 * 原地；已通过（或节点被删了）→ 跳下一张。
 *
 * 这样写还有一个好处：推进的判据是「审核态变了」，谁改的都算（用户点的、助手写
 * 的、别处改的），所以审核动作可以留在它该在的地方（`GenerateComposer` 参数条首
 * 位，owner 已拍板的落点），本模块一行都不用碰它。
 *
 * ⛔ 早先这里写成两个 effect（看到通过就 setCurrent、看到队列空就 setActive），
 * 被 `react-hooks/set-state-in-effect` 挡下 —— 那确实是级联渲染。推导版本没有中间
 * 状态，也就没有可以不同步的东西。
 */
export interface NodeReviewMode {
  active: boolean
  queue: readonly ReviewQueueItem[]
  current: ReviewQueueItem | null
  /**
   * 当前这一项所在的节点。由本 hook 一并给出，而不是让消费者拿 `current.nodeId`
   * 再去图里找 —— `nodes` 不在画布 context 上（那上面只有动作，没有图），要么每个
   * 消费者各自接一份数据源，要么在这里解析一次。选后者。
   */
  currentNode: NodeWorkflowNode | null
  /**
   * 当前这张已经被裁决（通过 / 打回），队列里已经没有它 —— 打回后「停在原地」
   * 的那一屏就是这个状态。
   */
  currentDecided: boolean
  /** 还剩几张待审。**没有计数就不知道什么时候审完**（§「缺件」）。 */
  remaining: number
  hasNext: boolean
  hasPrev: boolean
  enter(): void
  exit(): void
  goNext(): void
  goPrev(): void
}

interface UseNodeReviewModeInput {
  nodes: NodeWorkflowNode[]
  /** 选中 + 相机飞过去 —— D2 消除「找」的成本靠的就是这一下。 */
  focusNode(nodeId: string): void
}

export function useNodeReviewMode({
  nodes,
  focusNode,
}: UseNodeReviewModeInput): NodeReviewMode {
  const [sessionOpen, setSessionOpen] = useState(false)
  /** 用户钉住的锚点。null = 还没钉，跟队首。 */
  const [pinned, setPinned] = useState<ReviewQueueItem | null>(null)

  // 中途新生成的图会带着更晚的 markedAt 进来，因此**自动追加队尾**（§4.4）——
  // 不用额外接线，排序自己保证了这一点。
  const queue = useMemo(() => collectReviewQueue(nodes), [nodes])

  const pinnedNode = pinned
    ? nodes.find((item) => item.id === pinned.nodeId)
    : undefined
  const pinnedState =
    pinned && pinnedNode
      ? resolveMediaReviewState(pinnedNode.data, pinned.url)
      : undefined
  const pinnedQueued = pinned
    ? queue.some((item) => isSameReviewItem(item, pinned))
    : false

  const current: ReviewQueueItem | null = !sessionOpen
    ? null
    : !pinned
      ? (queue[0] ?? null)
      : pinnedQueued || pinnedState === NODE_REVIEW_STATE_IDS.rejected
        ? pinned // 还没裁决，或已打回 → 停在原地（§4.2）
        : findNextReviewItem(queue, pinned) // 已通过 / 节点没了 → 自动跳下一张

  // 自动前进之后必须**重新落锚**。
  // ⚠ 真机实测踩到过：只推导不落锚的话，锚点会一直停在最初那张已通过的图上，
  // 下一次裁决就拿着旧锚点去算 —— 「通过一张、再打回最后一张」会被误判成审完，
  // 模式当场关掉。锚点必须跟着当前项走。
  //
  // 下面两处都是渲染期带守卫的 setState（React 官方的「根据变化调整 state」写
  // 法）：多渲染一次即收敛，且不会像 effect 那样先闪一帧再纠正。
  if (sessionOpen && current && !isSameReviewItem(current, pinned)) {
    setPinned(current)
  }

  // §4.3「审完」= 队列空。它**不是一个动作**，而是一个观察结果（最后一张被别处
  // 标成通过时才成立），所以同样在渲染期收口。
  if (sessionOpen && current === null) {
    setSessionOpen(false)
    setPinned(null)
  }

  const active = sessionOpen && current !== null
  const currentDecided =
    current !== null && !queue.some((item) => isSameReviewItem(item, current))

  // 相机是**外部系统**，所以它留在 effect 里 —— 这正是 effect 该干的事。
  // 同一张只飞一次：否则 `nodes` 每变一次都会重新 fitView，用户一拖画布就被拽回去。
  const currentKey = current ? `${current.nodeId}::${current.url}` : null
  const focusedKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!current || !currentKey) {
      focusedKeyRef.current = null
      return
    }
    if (focusedKeyRef.current === currentKey) return
    focusedKeyRef.current = currentKey
    focusNode(current.nodeId)
  }, [current, currentKey, focusNode])

  const enter = useCallback(() => {
    const first = queue[0]
    if (!first) return // 没有可审的东西就没有模式
    setSessionOpen(true)
    setPinned(first)
  }, [queue])

  const exit = useCallback(() => {
    setSessionOpen(false)
    setPinned(null)
  }, [])

  const goNext = useCallback(() => {
    const next = findNextReviewItem(queue, current)
    if (next) {
      setPinned(next)
      return
    }
    // 没有别的可审了 —— 打回后停在原地的那一屏按「下一张」就是收尾并结束本轮。
    setSessionOpen(false)
    setPinned(null)
  }, [current, queue])

  const goPrev = useCallback(() => {
    const prev = findPrevReviewItem(queue, current)
    if (prev) setPinned(prev)
  }, [current, queue])

  return {
    active,
    queue,
    current,
    currentNode: current
      ? (nodes.find((item) => item.id === current.nodeId) ?? null)
      : null,
    currentDecided,
    remaining: queue.length,
    hasNext: findNextReviewItem(queue, current) !== null,
    hasPrev: findPrevReviewItem(queue, current) !== null,
    enter,
    exit,
    goNext,
    goPrev,
  }
}
