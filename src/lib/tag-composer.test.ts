import { describe, expect, it } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  formatTagWeight,
  novelAiBraceDepth,
  parseTagChips,
  serializeTagChips,
  snapTagWeight,
  translateTagChips,
  translateTagPromptText,
  wholeSentenceAsTag,
} from '@/lib/tag-composer'

describe('统一串 ↔ chip 列表', () => {
  it('按逗号切成 chip，缺省权重不写后缀', () => {
    expect(parseTagChips('1girl, masterpiece , neon city')).toEqual([
      { text: '1girl', weight: 1 },
      { text: 'masterpiece', weight: 1 },
      { text: 'neon city', weight: 1 },
    ])
    expect(
      serializeTagChips([
        { text: '1girl', weight: 1 },
        { text: 'neon city', weight: 1 },
      ]),
    ).toBe('1girl, neon city')
  })

  it('认末尾的权重后缀并原样转回去', () => {
    const tags = parseTagChips('rain:1.2, blurry')
    expect(tags).toEqual([
      { text: 'rain', weight: 1.2 },
      { text: 'blurry', weight: 1 },
    ])
    expect(serializeTagChips(tags)).toBe('rain:1.2, blurry')
  })

  // 越界 / 不是数字的冒号是**用户写的字**，不是权重 —— 吃掉它等于替他改词。
  it.each(['bad hands: seriously', 'ratio:9', 'time:0.1'])(
    '把不能当权重的 %s 原样留在文本里',
    (input) => {
      expect(parseTagChips(input)).toEqual([{ text: input, weight: 1 }])
    },
  )

  it('丢掉空格子', () => {
    expect(parseTagChips('1girl, , ,rain')).toHaveLength(2)
    expect(serializeTagChips([{ text: '   ', weight: 1 }])).toBe('')
  })
})

describe('权重刻度', () => {
  it('吸到 0.05 一档并夹在值域里', () => {
    expect(snapTagWeight(1.23)).toBe(1.25)
    expect(snapTagWeight(9)).toBe(2)
    expect(snapTagWeight(0)).toBe(0.4)
  })

  // 界面上一律 `×1.2`，⛔ 不出现任何一家的原生语法。
  it('显示成 ×1.2', () => {
    expect(formatTagWeight(1.2)).toBe('×1.2')
    expect(formatTagWeight(0.8)).toBe('×0.8')
  })
})

describe('翻成 provider 原生语法', () => {
  const tags = [
    { text: '1girl', weight: 1 },
    { text: 'rain', weight: 1.2 },
    { text: 'blurry', weight: 0.8 },
  ]

  it('NovelAI 用大括号 / 方括号，层数按 1.05 取整', () => {
    // ln(1.2)/ln(1.05) ≈ 3.74 → 4 层；ln(0.8)/ln(1.05) ≈ -4.57 → -5 层
    expect(novelAiBraceDepth(1.2)).toBe(4)
    expect(novelAiBraceDepth(0.8)).toBe(-5)
    expect(novelAiBraceDepth(1)).toBe(0)
    expect(translateTagChips(tags, AI_ADAPTER_TYPES.NOVELAI)).toBe(
      '1girl, {{{{rain}}}}, [[[[[blurry]]]]]',
    )
  })

  it('PixAI 用 (tag:1.2)', () => {
    expect(translateTagChips(tags, AI_ADAPTER_TYPES.PIXAI)).toBe(
      '1girl, (rain:1.2), (blurry:0.8)',
    )
  })

  // 认不出来的 adapter 丢掉权重 —— 把 `{}` 发给不认它的 provider 会被当成
  // 提示词里的字面字符画进图里。
  it('其它 adapter 只发文本', () => {
    expect(translateTagChips(tags, AI_ADAPTER_TYPES.OPENAI)).toBe(
      '1girl, rain, blurry',
    )
    expect(translateTagChips(tags, undefined)).toBe('1girl, rain, blurry')
  })

  it('从存储串直接翻', () => {
    expect(
      translateTagPromptText('1girl, rain:1.2', AI_ADAPTER_TYPES.PIXAI),
    ).toBe('1girl, (rain:1.2)')
  })
})

// 两台跳转：整句进第一格，⛔ 不自动切成标签。
describe('自然语言台带过来的那一句', () => {
  it('整句一格，含逗号也不切', () => {
    expect(
      wholeSentenceAsTag('a girl standing in the rain, looking up'),
    ).toEqual([{ text: 'a girl standing in the rain, looking up', weight: 1 }])
  })

  it('空串不产生格子', () => {
    expect(wholeSentenceAsTag('   ')).toEqual([])
  })
})
