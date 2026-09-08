import { describe, expect, it } from 'vitest'

import { NODE_SLOT_IDS } from '@/constants/node-slots'
import type { NodeV4, NodeWorkflowEdgeV4 } from '@/types/node-workflow'

import { planV4Connect } from './node-assistant-op-plan'

/**
 * ⚠ v3 规划器（`planNodeAssistantOps`）的用例随它本体一起删于 C3c-③d-4 ——
 * 那些用例问的是「v3 一节点一入口能不能连」，而画布翻到 v4 之后目标有多个具名
 * 口，问题本身没有对象了。⛔ 不把它们改写成「v4 上跑 v3 判据」：那只会让一批
 * 恒真的断言看起来还在守着什么。
 */

describe('planV4Connect · v4 具名口的连线裁决', () => {
  const now = '2026-09-08T00:00:00.000Z'
  const v4Node = (
    id: string,
    data: Record<string, unknown> & { kind: string },
  ) =>
    ({
      id,
      position: { x: 0, y: 0 },
      data: { name: id, status: 'idle', createdAt: now, ...data },
    }) as unknown as NodeV4

  const v4Edge = (id: string, source: string, target: string, slot: string) =>
    ({
      id,
      source,
      sourceHandle: 'out',
      target,
      slot,
    }) as unknown as NodeWorkflowEdgeV4

  const img = v4Node('img', {
    kind: 'image',
    subtype: 'shot',
    url: 'https://cdn/a.png',
  })
  const shot = v4Node('shot', { kind: 'video', subtype: 'shot', label: 'S01' })

  it('口收得下 → ready', () => {
    expect(
      planV4Connect(img, shot, NODE_SLOT_IDS.firstFrame, [], [img, shot])
        .status,
    ).toBe('ready')
  })

  // ⚠ 用 `reference`（0..N，非轮播）而不是 `firstFrame`：轮播槽再连一条**不是**
  // 超限，是「加为第 N 版并设为当前」（§1.4），拿它试容量会永远是 ready。
  it('口满了 → rejected 且带 n/m（卡上显示得出「1/1」）', () => {
    const other = v4Node('img2', {
      kind: 'image',
      subtype: 'shot',
      url: 'https://cdn/b.png',
    })
    const result = planV4Connect(
      other,
      shot,
      NODE_SLOT_IDS.reference,
      [v4Edge('e1', 'img', 'shot', NODE_SLOT_IDS.reference)],
      [img, other, shot],
      { [NODE_SLOT_IDS.reference]: 1 },
    )
    expect(result.status).toBe('rejected')
    expect(result.capacity).toEqual({ current: 1, limit: 1 })
  })

  it('这个节点根本没有这个口 → rejected（⛔ 不恒真放行）', () => {
    expect(
      planV4Connect(shot, img, NODE_SLOT_IDS.firstFrame, [], [img, shot])
        .status,
    ).toBe('rejected')
  })
})
