import { describe, expect, it } from 'vitest'

import {
  derivePinnedEvidence,
  isEvidencePinned,
  togglePinnedEvidence,
} from '@/lib/studio-operator-pinned-evidence'
import type { AssistantOperatorRoundSummary } from '@/types/assistant-operator'

function round(
  roundIndex: number,
  overrides: Partial<AssistantOperatorRoundSummary> = {},
): AssistantOperatorRoundSummary {
  return {
    roundIndex,
    createdAt: '2026-09-12T06:00:00.000Z',
    facts: [],
    decisions: [],
    todos: [],
    evidenceRefs: [],
    ...overrides,
  }
}

const pin = {
  refs: ['#e1', '#e2'],
  conclusion: '鸣潮式 3D 渲染 = 卡通着色 + 实时光照',
  sourceCount: 8,
  corroborated: 3,
}

describe('togglePinnedEvidence', () => {
  it('⭐ 钉住写进**最新那一条**结论记录 —— PATCH 的就是那一轮', () => {
    const patch = togglePinnedEvidence([round(0), round(1)], pin)
    expect(patch).toEqual({ roundIndex: 1, pinnedEvidence: [pin] })
  })

  it('⚠ 一条结论记录都还没有（这一轮没结账）时回 null —— 调用方留本地态', () => {
    expect(togglePinnedEvidence([], pin)).toBeNull()
  })

  it('⚠ 取消钉住从**它自己所在的那一轮**摘掉，⛔ 不是最新那一轮', () => {
    const rounds = [round(0, { pinnedEvidence: [pin] }), round(1)]
    expect(togglePinnedEvidence(rounds, pin)).toEqual({
      roundIndex: 0,
      pinnedEvidence: [],
    })
  })

  it('⚠ 编号为空（这一轮没拿到号段）时回 null，⛔ 不编一个号', () => {
    expect(togglePinnedEvidence([round(0)], { ...pin, refs: [] })).toBeNull()
  })

  it('⚠ 超出上限从最旧的那头挤掉，⛔ 不拒绝钉住', () => {
    const existing = [1, 2, 3].map((seq) => ({
      ...pin,
      refs: [`#e${seq * 10}`],
      conclusion: `旧的第 ${seq} 条`,
    }))
    const patch = togglePinnedEvidence(
      [round(0, { pinnedEvidence: existing })],
      pin,
    )
    expect(patch?.pinnedEvidence).toHaveLength(3)
    expect(patch?.pinnedEvidence.at(-1)).toEqual(pin)
    expect(patch?.pinnedEvidence.at(0)?.conclusion).toBe('旧的第 2 条')
  })
})

describe('isEvidencePinned / derivePinnedEvidence', () => {
  it('⭐ 回放（刷新之后只剩结论记录）时这张卡照旧是钉住态', () => {
    const rounds = [round(0), round(1, { pinnedEvidence: [pin] })]
    expect(isEvidencePinned(rounds, ['#e1'])).toBe(true)
    expect(derivePinnedEvidence(rounds)).toEqual([{ ...pin, roundIndex: 1 }])
  })

  it('⚠ 没钉过的那一轮不算，编号为空也不算', () => {
    const rounds = [round(0, { pinnedEvidence: [pin] })]
    expect(isEvidencePinned(rounds, ['#e9'])).toBe(false)
    expect(isEvidencePinned(rounds, [])).toBe(false)
  })

  it('⚠ 同一个 roundIndex 两处都有时留后给的那一份（在飞压过载回来的）', () => {
    const stale = round(1, { pinnedEvidence: [pin] })
    const live = round(1, { pinnedEvidence: [] })
    expect(derivePinnedEvidence([stale, live])).toEqual([])
  })
})
