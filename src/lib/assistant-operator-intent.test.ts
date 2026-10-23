import { describe, expect, it } from 'vitest'

import {
  isAssistantActionTurn,
  isAssistantQuestionTurn,
} from '@/lib/assistant-operator-intent'

describe('isAssistantQuestionTurn / isAssistantActionTurn', () => {
  it.each([
    '这是什么画风',
    '图2穿的什么？',
    '帮我看看这两张参考图，分别是什么画风',
    '再分析图3的画风',
    '为什么刚才那张失败了',
    'What style is image 3?',
  ])('treats %s as a question', (text) => {
    expect(isAssistantQuestionTurn(text)).toBe(true)
    expect(isAssistantActionTurn(text)).toBe(false)
  })

  it.each([
    '改成图1的衣服',
    '把提示词改成夜景',
    '换成 Flare',
    '挂上这把 LoRA',
    '准备出图',
    '覆盖提示词',
    'generate two images',
  ])('treats %s as an action', (text) => {
    expect(isAssistantActionTurn(text)).toBe(true)
    expect(isAssistantQuestionTurn(text)).toBe(false)
  })

  it('does not treat a bare greeting as either', () => {
    expect(isAssistantQuestionTurn('你好')).toBe(false)
    expect(isAssistantActionTurn('你好')).toBe(false)
  })
})
