import { describe, expect, it } from 'vitest'

import { NODE_SCRIPT_SHOT_STATE_IDS } from '@/constants/node-script'
import { planScriptProjection } from '@/lib/node-script-projection'
import type { NodeV4, NodeV4ScriptShot } from '@/types/node-workflow'

const NOW = '2026-09-19T00:00:00.000Z'

function scriptNode(id: string, body: string): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      kind: 'text',
      subtype: 'script',
      name: id,
      status: 'idle',
      createdAt: NOW,
      body,
    },
  }
}

function projectedShot(
  id: string,
  shotNo: number,
  ref: NodeV4ScriptShot,
): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      kind: 'video',
      subtype: 'shot',
      name: id,
      label: id,
      status: 'idle',
      createdAt: NOW,
      shotNo,
      scriptShot: ref,
    },
  }
}

const BODY = 'S01 雨夜街角\nS02 递伞\nS03 对视'

describe('planScriptProjection · 重投影 diff（进度表 24）', () => {
  it('还没投过：整批都算新增', () => {
    const script = scriptNode('script', BODY)
    const plan = planScriptProjection([script], 'script', BODY)
    expect(plan.projected).toHaveLength(0)
    expect(plan.toCreate.map((shot) => shot.key)).toEqual(['s1', 's2', 's3'])
    expect(plan.toMark).toHaveLength(0)
    expect(plan.toDrop).toHaveLength(0)
  })

  /**
   * ⭐ diff 的三种结局各出现一次 —— 这一条是重投影唯一的规格。
   */
  it('⭐ 新增 / 已变 / 标灰 三类各归各位', () => {
    const script = scriptNode(
      'script',
      'S01 雨夜街角\nS02 递伞 · 近景\nS04 伞留下',
    )
    const nodes = [
      script,
      projectedShot('v1', 1, {
        scriptNodeId: 'script',
        shotKey: 's1',
        projectedText: '雨夜街角',
        state: NODE_SCRIPT_SHOT_STATE_IDS.synced,
      }),
      projectedShot('v2', 2, {
        scriptNodeId: 'script',
        shotKey: 's2',
        projectedText: '递伞',
        state: NODE_SCRIPT_SHOT_STATE_IDS.synced,
      }),
      projectedShot('v3', 3, {
        scriptNodeId: 'script',
        shotKey: 's3',
        projectedText: '对视',
        state: NODE_SCRIPT_SHOT_STATE_IDS.synced,
      }),
    ]
    const plan = planScriptProjection(
      nodes,
      'script',
      'S01 雨夜街角\nS02 递伞 · 近景\nS04 伞留下',
    )
    expect(plan.toCreate.map((shot) => shot.key)).toEqual(['s4'])
    expect(plan.toMark.map((entry) => entry.node.id)).toEqual(['v2'])
    expect(plan.toMark[0]?.shot.text).toBe('递伞 · 近景')
    expect(plan.toDrop.map((node) => node.id)).toEqual(['v3'])
    expect(plan.toResync.map((node) => node.id)).toEqual(['v1'])
  })

  it('另一张剧本卡投的镜不进这一份计划', () => {
    const nodes = [
      scriptNode('script', BODY),
      projectedShot('other', 1, {
        scriptNodeId: 'another-script',
        shotKey: 's1',
        projectedText: '雨夜街角',
        state: NODE_SCRIPT_SHOT_STATE_IDS.synced,
      }),
    ]
    const plan = planScriptProjection(nodes, 'script', BODY)
    expect(plan.projected).toHaveLength(0)
    expect(plan.toCreate).toHaveLength(3)
  })

  it('已经标灰的镜不再报第二次', () => {
    const nodes = [
      scriptNode('script', 'S01 雨夜街角'),
      projectedShot('v1', 1, {
        scriptNodeId: 'script',
        shotKey: 's1',
        projectedText: '雨夜街角',
        state: NODE_SCRIPT_SHOT_STATE_IDS.synced,
      }),
      projectedShot('v9', 9, {
        scriptNodeId: 'script',
        shotKey: 's9',
        projectedText: '没了的那一镜',
        state: NODE_SCRIPT_SHOT_STATE_IDS.dropped,
      }),
    ]
    expect(
      planScriptProjection(nodes, 'script', 'S01 雨夜街角').toDrop,
    ).toHaveLength(0)
  })
})
