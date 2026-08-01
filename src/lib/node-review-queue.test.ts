import { describe, expect, it } from 'vitest'

import { NODE_REVIEW_STATE_IDS } from '@/constants/node-types'
import {
  collectReviewQueue,
  findNextReviewItem,
  findPrevReviewItem,
  findPreviousVersionUrl,
  isSameReviewItem,
  type ReviewQueueItem,
} from '@/lib/node-review-queue'
import type {
  NodeWorkflowNode,
  NodeWorkflowNodeData,
} from '@/types/node-workflow'

function makeNode(
  id: string,
  data: Partial<NodeWorkflowNodeData>,
): NodeWorkflowNode {
  return {
    id,
    type: 'image',
    position: { x: 0, y: 0 },
    data: { prompt: '', status: 'idle', ...data } as NodeWorkflowNodeData,
  }
}

function awaiting(markedAt?: string) {
  return {
    state: NODE_REVIEW_STATE_IDS.awaitingReview,
    ...(markedAt ? { markedAt } : {}),
  }
}

describe('collectReviewQueue', () => {
  it('只收待审的，通过和打回都不进队列', () => {
    const nodes = [
      makeNode('n1', {
        mediaUrl: 'https://cdn/a.png',
        mediaReview: { 'https://cdn/a.png': awaiting('2026-08-01T00:00:01Z') },
      }),
      makeNode('n2', {
        mediaUrl: 'https://cdn/b.png',
        mediaReview: {
          'https://cdn/b.png': { state: NODE_REVIEW_STATE_IDS.approved },
        },
      }),
      makeNode('n3', {
        mediaUrl: 'https://cdn/c.png',
        mediaReview: {
          'https://cdn/c.png': { state: NODE_REVIEW_STATE_IDS.rejected },
        },
      }),
    ]
    expect(collectReviewQueue(nodes).map((i) => i.url)).toEqual([
      'https://cdn/a.png',
    ])
  })

  it('按 markedAt 排序，没有 markedAt 的存量记录排最前', () => {
    const nodes = [
      makeNode('n1', {
        mediaUrl: 'https://cdn/late.png',
        mediaReview: {
          'https://cdn/late.png': awaiting('2026-08-01T00:00:09Z'),
        },
      }),
      makeNode('n2', {
        mediaUrl: 'https://cdn/legacy.png',
        // 存量：包 6 之前标的，没有 markedAt
        mediaReview: { 'https://cdn/legacy.png': awaiting() },
      }),
      makeNode('n3', {
        mediaUrl: 'https://cdn/early.png',
        mediaReview: {
          'https://cdn/early.png': awaiting('2026-08-01T00:00:01Z'),
        },
      }),
    ]
    expect(collectReviewQueue(nodes).map((i) => i.url)).toEqual([
      'https://cdn/legacy.png',
      'https://cdn/early.png',
      'https://cdn/late.png',
    ])
  })

  it('节点顺序不参与排序 —— 拖动画布不该改变审阅顺序', () => {
    const a = makeNode('n-a', {
      mediaUrl: 'https://cdn/a.png',
      mediaReview: { 'https://cdn/a.png': awaiting('2026-08-01T00:00:01Z') },
    })
    const b = makeNode('n-b', {
      mediaUrl: 'https://cdn/b.png',
      mediaReview: { 'https://cdn/b.png': awaiting('2026-08-01T00:00:02Z') },
    })
    expect(collectReviewQueue([a, b]).map((i) => i.url)).toEqual([
      'https://cdn/a.png',
      'https://cdn/b.png',
    ])
    // 同样两张卡，画布数组顺序反过来 —— 队列顺序必须不变
    expect(collectReviewQueue([b, a]).map((i) => i.url)).toEqual([
      'https://cdn/a.png',
      'https://cdn/b.png',
    ])
  })

  it('丢掉幽灵条目：卡上已经没有的 URL 不进队列', () => {
    // 「重做」写了新 URL，旧 URL 那条 awaiting 记录原样留着 —— 审它没有意义，
    // 还会让「还剩几张」骗人。
    const nodes = [
      makeNode('n1', {
        mediaUrl: 'https://cdn/v2.png',
        mediaReview: {
          'https://cdn/v1.png': awaiting('2026-08-01T00:00:01Z'),
          'https://cdn/v2.png': awaiting('2026-08-01T00:00:02Z'),
        },
      }),
    ]
    expect(collectReviewQueue(nodes).map((i) => i.url)).toEqual([
      'https://cdn/v2.png',
    ])
  })

  it('收集器里被标的参考图也算 —— 助手的 set_review_state 能标到那儿', () => {
    const nodes = [
      makeNode('n1', {
        referenceAssets: [
          { id: 'r1', url: 'https://cdn/ref.png' },
        ] as NodeWorkflowNodeData['referenceAssets'],
        mediaReview: {
          'https://cdn/ref.png': awaiting('2026-08-01T00:00:01Z'),
        },
      }),
    ]
    expect(collectReviewQueue(nodes).map((i) => i.url)).toEqual([
      'https://cdn/ref.png',
    ])
  })
})

describe('推进', () => {
  const queue: ReviewQueueItem[] = [
    { nodeId: 'n1', url: 'u1', markedAt: '2026-08-01T00:00:01Z', nodeIndex: 0 },
    { nodeId: 'n2', url: 'u2', markedAt: '2026-08-01T00:00:02Z', nodeIndex: 1 },
    { nodeId: 'n3', url: 'u3', markedAt: '2026-08-01T00:00:03Z', nodeIndex: 2 },
  ]

  it('没有当前项时从队首开始', () => {
    expect(findNextReviewItem(queue, null)?.url).toBe('u1')
    expect(findPrevReviewItem(queue, null)?.url).toBe('u3')
  })

  it('往后推进一张', () => {
    expect(findNextReviewItem(queue, queue[0]!)?.url).toBe('u2')
    expect(findPrevReviewItem(queue, queue[2]!)?.url).toBe('u2')
  })

  it('走到队尾会绕回 —— 审完的判据是队列空，不是走完一轮', () => {
    // 用户跳着审时，队尾之后仍然可能有更早的没审过。
    expect(findNextReviewItem(queue, queue[2]!)?.url).toBe('u1')
    expect(findPrevReviewItem(queue, queue[0]!)?.url).toBe('u3')
  })

  it('已裁决的当前项不在队列里时，仍然接着它往后走', () => {
    // 打回之后当前项离开队列（状态不再是待审），但推进顺序要接得上。
    const decided = queue[1]!
    const remaining = [queue[0]!, queue[2]!]
    expect(findNextReviewItem(remaining, decided)?.url).toBe('u3')
  })

  it('队列里只剩当前这一张时返回 null，不原地打转', () => {
    expect(findNextReviewItem([queue[0]!], queue[0]!)).toBeNull()
    expect(findPrevReviewItem([queue[0]!], queue[0]!)).toBeNull()
  })

  it('空队列返回 null', () => {
    expect(findNextReviewItem([], queue[0]!)).toBeNull()
    expect(findNextReviewItem([], null)).toBeNull()
  })

  it('身份只看节点与 URL', () => {
    expect(
      isSameReviewItem(queue[0]!, {
        ...queue[0]!,
        markedAt: 'x',
        nodeIndex: 9,
      }),
    ).toBe(true)
    expect(isSameReviewItem(queue[0]!, queue[1]!)).toBe(false)
    expect(isSameReviewItem(null, queue[0]!)).toBe(false)
  })
})

describe('findPreviousVersionUrl（新旧双联对比）', () => {
  const base = { prompt: '', status: 'idle' } as NodeWorkflowNodeData

  it('取最近被打回的那一版', () => {
    const data: NodeWorkflowNodeData = {
      ...base,
      mediaReview: {
        'https://cdn/v1.png': {
          state: NODE_REVIEW_STATE_IDS.rejected,
          reviewedAt: '2026-08-01T00:00:01Z',
        },
        'https://cdn/v2.png': {
          state: NODE_REVIEW_STATE_IDS.rejected,
          reviewedAt: '2026-08-01T00:00:05Z',
        },
        'https://cdn/v3.png': awaiting('2026-08-01T00:00:09Z'),
      },
    }
    expect(findPreviousVersionUrl(data, 'https://cdn/v3.png')).toBe(
      'https://cdn/v2.png',
    )
  })

  it('只有通过 / 待审的版本时没有可比的上一版', () => {
    const data: NodeWorkflowNodeData = {
      ...base,
      mediaReview: {
        'https://cdn/v1.png': { state: NODE_REVIEW_STATE_IDS.approved },
        'https://cdn/v2.png': awaiting(),
      },
    }
    expect(findPreviousVersionUrl(data, 'https://cdn/v2.png')).toBeUndefined()
    expect(findPreviousVersionUrl(base, 'https://cdn/v2.png')).toBeUndefined()
  })
})
