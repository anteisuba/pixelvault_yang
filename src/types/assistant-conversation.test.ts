import { describe, expect, it } from 'vitest'

import { UpdateAssistantConversationRoundRequestSchema } from '@/types/assistant-conversation'

/**
 * `PATCH /api/assistant/conversation` 的**入口闸**（v2 §7.7，commit #13）。
 *
 * ⚠ 路由那三件事里的第二件就是这一张 schema —— 它拦得住的东西，service 里不必
 * 再判一次（⛔ 也别在 service 里重判：两份判据会分叉）。
 */
const VALID = {
  id: '11111111-2222-4333-8444-555555555555',
  roundIndex: 0,
  facts: ['参考图是冷蓝夜景'],
  decisions: ['用 16:9'],
  todos: [],
}

describe('UpdateAssistantConversationRoundRequestSchema', () => {
  it('收下三栏 + 会话 id + 轮次号', () => {
    expect(
      UpdateAssistantConversationRoundRequestSchema.safeParse(VALID).success,
    ).toBe(true)
  })

  it('非法 roundIndex 一律拒（负数 / 小数 / 非数）', () => {
    for (const roundIndex of [-1, 1.5, '0', null, undefined]) {
      expect(
        UpdateAssistantConversationRoundRequestSchema.safeParse({
          ...VALID,
          roundIndex,
        }).success,
      ).toBe(false)
    }
  })

  it('会话 id 必须是 uuid', () => {
    expect(
      UpdateAssistantConversationRoundRequestSchema.safeParse({
        ...VALID,
        id: 'not-a-uuid',
      }).success,
    ).toBe(false)
  })

  it('每栏最多 3 条、每条最多 60 字 —— 与协议那一份逐字同源', () => {
    expect(
      UpdateAssistantConversationRoundRequestSchema.safeParse({
        ...VALID,
        facts: ['一', '二', '三', '四'],
      }).success,
    ).toBe(false)
    expect(
      UpdateAssistantConversationRoundRequestSchema.safeParse({
        ...VALID,
        facts: ['长'.repeat(61)],
      }).success,
    ).toBe(false)
  })

  it('⛔ 不收 evidenceRefs / editedByUser —— 它们不是用户能改的东西', () => {
    const parsed = UpdateAssistantConversationRoundRequestSchema.safeParse({
      ...VALID,
      evidenceRefs: ['#e9'],
      editedByUser: false,
    })
    expect(parsed.success).toBe(true)
    expect(parsed.success && 'evidenceRefs' in parsed.data).toBe(false)
    expect(parsed.success && 'editedByUser' in parsed.data).toBe(false)
  })
})
