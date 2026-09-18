import { describe, expect, it } from 'vitest'

import {
  extractJsonStringValue,
  isAssistantActionTurn,
  isAssistantQuestionTurn,
  jsonHasToolObject,
  shouldPrefetchReferenceAnalysis,
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

describe('shouldPrefetchReferenceAnalysis', () => {
  it('prefetches only for a question with pointed images on a text-only model', () => {
    expect(
      shouldPrefetchReferenceAnalysis({
        questionTurn: true,
        hasPointedReferences: true,
        modelSeesImages: false,
      }),
    ).toBe(true)
  })

  it('skips prefetch when the model can see the images', () => {
    expect(
      shouldPrefetchReferenceAnalysis({
        questionTurn: true,
        hasPointedReferences: true,
        modelSeesImages: true,
      }),
    ).toBe(false)
  })

  it('skips prefetch on action turns even if images are pointed', () => {
    expect(
      shouldPrefetchReferenceAnalysis({
        questionTurn: false,
        hasPointedReferences: true,
        modelSeesImages: false,
      }),
    ).toBe(false)
  })
})

describe('extractJsonStringValue', () => {
  it('returns a complete string value', () => {
    expect(
      extractJsonStringValue(
        '{"finished":true,"message":"图3是风格化 3D。"}',
        'message',
      ),
    ).toBe('图3是风格化 3D。')
  })

  it('returns the written prefix while the string is still open', () => {
    expect(extractJsonStringValue('{"message":"图3是风格', 'message')).toBe(
      '图3是风格',
    )
  })

  it('unescapes quotes and newlines', () => {
    expect(
      extractJsonStringValue('{"message":"说 \\"好\\"\\n下一句"}', 'message'),
    ).toBe('说 "好"\n下一句')
  })

  it('returns null when the key has not started', () => {
    expect(extractJsonStringValue('{"finished":true', 'message')).toBeNull()
  })
})

describe('jsonHasToolObject', () => {
  it('detects a tool object, not a null tool', () => {
    expect(jsonHasToolObject('{"tool":{"name":"apply"')).toBe(true)
    expect(jsonHasToolObject('{"tool":null,"message":"好"')).toBe(false)
  })
})
