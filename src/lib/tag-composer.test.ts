import { describe, expect, it } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  formatTagWeight,
  parsePromptToTagsOutput,
  parseTagChips,
  serializeTagChips,
  snapTagWeight,
  tagPromptTextForLoraBase,
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

  it('认原生 weight::tag::（含负权重）与旧后缀 tag:1.2，并统一序列化为原生写法', () => {
    const tags = parseTagChips('1.2::rain::, -2::blurry::, wind:1.3')
    expect(tags).toEqual([
      { text: 'rain', weight: 1.2 },
      { text: 'blurry', weight: -2 },
      { text: 'wind', weight: 1.3 },
    ])
    expect(serializeTagChips(tags)).toBe(
      '1.2::rain::, -2::blurry::, 1.3::wind::',
    )
  })

  // 越界 / 不是数字的冒号是**用户写的字**，不是权重 —— 吃掉它等于替他改词。
  it.each(['bad hands: seriously', 'ratio:9', 'time:-9'])(
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
  it('吸到 0.05 一档并夹在 -5..5 值域里', () => {
    expect(snapTagWeight(1.23)).toBe(1.25)
    expect(snapTagWeight(9)).toBe(5)
    expect(snapTagWeight(-9)).toBe(-5)
    expect(snapTagWeight(-0)).toBe(0)
  })

  it('显示成 ×1.2 / ×-2', () => {
    expect(formatTagWeight(1.2)).toBe('×1.2')
    expect(formatTagWeight(0.8)).toBe('×0.8')
    expect(formatTagWeight(-2)).toBe('×-2')
  })
})

describe('翻成 provider 原生语法', () => {
  const tags = [
    { text: '1girl', weight: 1 },
    { text: 'rain', weight: 1.2 },
    { text: 'blurry', weight: 0.8 },
    { text: 'extra fingers', weight: -2 },
  ]

  it('NovelAI 无损输出原生 weight::tag::（含负权重，不再折成 {} / []）', () => {
    expect(translateTagChips(tags, AI_ADAPTER_TYPES.NOVELAI)).toBe(
      '1girl, 1.2::rain::, 0.8::blurry::, -2::extra fingers::',
    )
  })

  it('PixAI 正权用 (tag:1.2)，非正权（负强调）安全剥离', () => {
    expect(translateTagChips(tags, AI_ADAPTER_TYPES.PIXAI)).toBe(
      '1girl, (rain:1.2), (blurry:0.8)',
    )
  })

  // 认不出来的 adapter 丢掉权重与负强调 —— 不把避雷词或括号画进图里。
  it('其它 adapter 只发正权文本', () => {
    expect(translateTagChips(tags, AI_ADAPTER_TYPES.OPENAI)).toBe(
      '1girl, rain, blurry',
    )
    expect(translateTagChips(tags, undefined)).toBe('1girl, rain, blurry')
  })

  it('从存储串直接翻', () => {
    expect(
      translateTagPromptText(
        '1girl, 1.2::rain::, -2::blurry::',
        AI_ADAPTER_TYPES.PIXAI,
      ),
    ).toBe('1girl, (rain:1.2)')
  })
})

// 两台跳转：整句先占第一格，随后由助手翻成标签换掉它。
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

// 助手翻回来的那一串 → 一格一格的标签。
describe('parsePromptToTagsOutput', () => {
  it('剥掉前缀与代码块，下划线换空格，按逗号和换行切', () => {
    expect(
      parsePromptToTagsOutput(
        '```\nTags: 1girl, solo,\nlong_hair, looking_at_viewer\n```',
      ),
    ).toEqual(['1girl', 'solo', 'long hair', 'looking at viewer'])
  })

  it('去掉编号、引号，大小写不同的重复只留一格', () => {
    expect(
      parsePromptToTagsOutput('1. "1girl"\n2. Rain\n3. rain\n4. night.'),
    ).toEqual(['1girl', 'Rain', 'night'])
  })

  it('丢掉长得像一句话的那一格', () => {
    expect(
      parsePromptToTagsOutput(
        '1girl, rain, night, city, 雨中的女孩, a girl who is standing in the middle of the rain at night',
      ),
    ).toEqual(['1girl', 'rain', 'night', 'city'])
  })

  it('大半是一段话 = 没照做，回 null', () => {
    expect(
      parsePromptToTagsOutput('这是一幅雨夜的画面，女孩抬头，神情安静。'),
    ).toBeNull()
    expect(parsePromptToTagsOutput('   ')).toBeNull()
  })

  it('最多留 60 格', () => {
    const many = Array.from({ length: 80 }, (_, i) => `tag ${i}`).join(', ')
    expect(parsePromptToTagsOutput(many)).toHaveLength(60)
  })
})

describe('native NovelAI emphasis groups', () => {
  it.each([
    '1girl, 1.5::rain, night::, 0.5::coat::',
    '1girl, -1::flat color, monochrome::, city',
    '1girl, {rain, night}, city',
    '1girl, 20::best quality, detailed::, no text',
    '1girl, 1.5::1girl, rank 2::, city',
  ])(
    'preserves grouped text through editing and request translation: %s',
    (prompt) => {
      const chips = parseTagChips(prompt)
      expect(chips[1]!.text).toContain(',')
      expect(serializeTagChips(chips)).toBe(prompt)
      expect(translateTagPromptText(prompt, AI_ADAPTER_TYPES.NOVELAI)).toBe(
        prompt,
      )
    },
  )
})

describe('标签模板用在 LoRA 台', () => {
  it('认括号的底模写成 (tag:1.2)，不认的去掉权重，负强调安全剥离', () => {
    expect(
      tagPromptTextForLoraBase('1girl, 1.2::rain::, -2::blurry::, night', true),
    ).toBe('1girl, (rain:1.2), night')
    expect(
      tagPromptTextForLoraBase(
        '1girl, 1.2::rain::, -2::blurry::, night',
        false,
      ),
    ).toBe('1girl, rain, night')
    expect(tagPromptTextForLoraBase('', true)).toBe('')
  })
})
