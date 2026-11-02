import { describe, expect, it } from 'vitest'

import { spendDecision, sumPoints } from '@/lib/assistant-spend-gate'

describe('助手钱闸', () => {
  it('任意一份估不出，整批就估不出', () => {
    expect(sumPoints([3, 4])).toBe(7)
    expect(sumPoints([3, null])).toBeNull()
  })

  it('累计到门槛（含）直接出；超了或估不出先问', () => {
    expect(spendDecision(40, 60, 100)).toEqual({ kind: 'go', points: 40 })
    expect(spendDecision(41, 60, 100)).toEqual({ kind: 'ask', points: 41 })
    expect(spendDecision(null, 0, 100)).toEqual({ kind: 'ask', points: null })
    expect(spendDecision(5, 0, 0)).toEqual({ kind: 'ask', points: 5 })
    expect(spendDecision(0, 0, 0)).toEqual({ kind: 'go', points: 0 })
  })
})
