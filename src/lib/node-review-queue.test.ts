import { describe, expect, it } from 'vitest'

import { NODE_REVIEW_STATE_IDS } from '@/constants/node-types'
import {
  collectReviewQueue,
  findNextReviewItem,
  findPrevReviewItem,
  findPreviousVersionUrl,
  isSameReviewItem,
  resolveReviewTargetUrl,
  type ReviewQueueItem,
} from '@/lib/node-review-queue'
import type {
  NodeV4,
  NodeV4ImageData,
  NodeWorkflowNode,
  NodeWorkflowNodeData,
} from '@/types/node-workflow'

/**
 * ⚠ ③d-4：队列改吃 v4 节点。v3 的三条来源（`mediaUrl` / `imageUrl` /
 * `referenceAssets[]`）在 v4 合流成**一个 `url`** —— 参考图不再是挂在这张卡上的
 * URL 数组，而是一个个真的上游节点，各自入队（⛔ 不再由引用方代收）。
 */
function makeNode(id: string, data: Partial<NodeV4ImageData>): NodeV4 {
  return {
    id,
    type: 'image',
    position: { x: 0, y: 0 },
    data: {
      kind: 'image',
      subtype: 'result',
      name: id,
      status: 'idle',
      createdAt: '2026-09-08T00:00:00.000Z',
      ...data,
    } as NodeV4ImageData,
  } as NodeV4
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
        url: 'https://cdn/a.png',
        mediaReview: { 'https://cdn/a.png': awaiting('2026-08-01T00:00:01Z') },
      }),
      makeNode('n2', {
        url: 'https://cdn/b.png',
        mediaReview: {
          'https://cdn/b.png': { state: NODE_REVIEW_STATE_IDS.approved },
        },
      }),
      makeNode('n3', {
        url: 'https://cdn/c.png',
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
        url: 'https://cdn/late.png',
        mediaReview: {
          'https://cdn/late.png': awaiting('2026-08-01T00:00:09Z'),
        },
      }),
      makeNode('n2', {
        url: 'https://cdn/legacy.png',
        // 存量：包 6 之前标的，没有 markedAt
        mediaReview: { 'https://cdn/legacy.png': awaiting() },
      }),
      makeNode('n3', {
        url: 'https://cdn/early.png',
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
      url: 'https://cdn/a.png',
      mediaReview: { 'https://cdn/a.png': awaiting('2026-08-01T00:00:01Z') },
    })
    const b = makeNode('n-b', {
      url: 'https://cdn/b.png',
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
        url: 'https://cdn/v2.png',
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

  /**
   * ⚠ v3 的「收集器里被标的参考图也算」用例随 ③d-4 删除：v4 里参考图**不再是挂在
   * 这张卡上的 URL 数组**，而是一个个真的上游节点，各自入队。代收会让同一张图在
   * 每个引用它的镜头下各排一次队，「还剩几张」当场翻倍。
   */
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

describe('resolveReviewTargetUrl（审核动作落在哪个 URL 上）', () => {
  const MAIN = 'https://cdn/main.png'
  const ASSET = 'https://cdn/asset-2.png'
  const collector = {
    prompt: '',
    status: 'idle',
    mediaUrl: MAIN,
    referenceAssets: [
      {
        id: 'asset-2',
        url: ASSET,
        source: 'canvas',
        addedAt: '2026-08-09T00:00:00.000Z',
      },
    ],
  } as unknown as NodeWorkflowNodeData

  function item(url: string, nodeId = 'n1'): ReviewQueueItem {
    return { nodeId, url, nodeIndex: 0 }
  }

  it('没进审阅模式 → 主媒体', () => {
    expect(resolveReviewTargetUrl(collector, 'n1', null)).toBe(MAIN)
    expect(resolveReviewTargetUrl(collector, 'n1', undefined)).toBe(MAIN)
  })

  it('⚠ 缺陷回归：钉住的是收集器里的一条 referenceAsset → 跟着它，不是主媒体', () => {
    expect(resolveReviewTargetUrl(collector, 'n1', item(ASSET))).toBe(ASSET)
  })

  it('钉住的是别的节点 → 不串台，回自己的主媒体', () => {
    expect(resolveReviewTargetUrl(collector, 'n1', item(ASSET, 'n2'))).toBe(
      MAIN,
    )
  })

  it('钉住的那条已不在这张卡上（幽灵）→ 退回主媒体', () => {
    expect(
      resolveReviewTargetUrl(collector, 'n1', item('https://cdn/gone.png')),
    ).toBe(MAIN)
  })

  it('legacy `imageUrl` 仍是主媒体的兜底', () => {
    const legacy = {
      prompt: '',
      status: 'idle',
      imageUrl: MAIN,
    } as unknown as NodeWorkflowNodeData
    expect(resolveReviewTargetUrl(legacy, 'n1', null)).toBe(MAIN)
    // 队列也收 imageUrl，所以钉住它是合法的。
    expect(resolveReviewTargetUrl(legacy, 'n1', item(MAIN))).toBe(MAIN)
  })

  it('什么媒体都没有 → 空串（调用方据此整个不渲染）', () => {
    const empty = { prompt: '', status: 'idle' } as NodeWorkflowNodeData
    expect(resolveReviewTargetUrl(empty, 'n1', null)).toBe('')
  })
})

/**
 * v4 分支：一张卡只审自己那一张 `url`。
 *
 * ⚠ 这一组是「语义搬家」的回归闸：v3 里 `referenceAssets[].url` 由引用方代收，
 * v4 里参考图是独立节点、各自入队。代收一旦复活，同一张图会在每个引用它的镜头
 * 下各排一次。
 */
describe('review queue · v4 形状', () => {
  function makeV4Node(id: string, data: Record<string, unknown>): NodeV4 {
    return {
      id,
      type: 'image',
      position: { x: 0, y: 0 },
      data: {
        kind: 'image',
        subtype: 'reference',
        name: id,
        status: 'idle',
        createdAt: '2026-09-08T00:00:00.000Z',
        ...data,
      },
    } as unknown as NodeV4
  }

  it('收 v4 的 `url`，⛔ 不再碰 imageUrl / referenceAssets', () => {
    const queue = collectReviewQueue([
      makeV4Node('v1', {
        url: 'https://cdn/v1.png',
        // 这两个字段在 v4 不存在；即使脏数据带着，也不许入队。
        imageUrl: 'https://cdn/ghost-a.png',
        referenceAssets: [{ url: 'https://cdn/ghost-b.png' }],
        mediaReview: {
          'https://cdn/v1.png': awaiting('2026-09-01T00:00:01Z'),
          'https://cdn/ghost-a.png': awaiting('2026-09-01T00:00:02Z'),
          'https://cdn/ghost-b.png': awaiting('2026-09-01T00:00:03Z'),
        },
      }),
    ])
    expect(queue.map((item) => item.url)).toEqual(['https://cdn/v1.png'])
  })

  it('v4 的审核落点 = 自己的 url，钉住的幽灵条目退回主媒体', () => {
    const data = {
      kind: 'image',
      subtype: 'reference',
      name: 'v1',
      status: 'idle',
      url: 'https://cdn/v1.png',
    } as unknown as NodeWorkflowNodeData
    expect(resolveReviewTargetUrl(data, 'v1', null)).toBe('https://cdn/v1.png')
    const ghost: ReviewQueueItem = {
      nodeId: 'v1',
      url: 'https://cdn/gone.png',
      nodeIndex: 0,
    }
    expect(resolveReviewTargetUrl(data, 'v1', ghost)).toBe('https://cdn/v1.png')
  })

  it('v4 的 text / audio 没有 mediaReview，静默不入队', () => {
    expect(
      collectReviewQueue([
        makeV4Node('t1', { kind: 'text', subtype: 'shotNote', body: 'x' }),
        makeV4Node('a1', {
          kind: 'audio',
          subtype: 'voice',
          url: 'https://cdn/a.mp3',
        }),
      ]),
    ).toEqual([])
  })
})
