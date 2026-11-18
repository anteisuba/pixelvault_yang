import { describe, expect, it } from 'vitest'

import {
  checkNovelAiText,
  composeNovelAiCharacterCaptions,
  composeNovelAiPrompt,
  composeNovelAiUndesiredContent,
  findNovelAiCharacterCountTags,
  novelAiPresetFields,
  planNovelAiText,
  resolveNovelAiQualityPreset,
  resolveNovelAiUcPreset,
  stripNovelAiQualityTags,
  stripNovelAiUcPreset,
  suggestNovelAiCountTags,
} from '@/lib/novelai-compose'

describe('预设：缺省与官方一致、V4.5 Curated 没有 Furry', () => {
  it('没写 = 质量标签 Standard · UC Heavy；显式关掉才不加', () => {
    expect(resolveNovelAiQualityPreset(undefined)).toBe('standard')
    expect(resolveNovelAiQualityPreset(null)).toBe('standard')
    expect(resolveNovelAiQualityPreset('off')).toBe('off')
    expect(resolveNovelAiUcPreset(undefined)).toBe('heavy')
    expect(resolveNovelAiUcPreset('none')).toBe('none')
  })

  it('V4.5 Curated 选 furry 不拼任何 UC 串（官方没有这一档）', () => {
    expect(
      composeNovelAiUndesiredContent(
        'hat',
        'furry',
        'nai-diffusion-4-5-curated',
      ),
    ).toBe('hat')
    expect(
      composeNovelAiUndesiredContent('hat', 'furry', 'nai-diffusion-4-5-full'),
    ).toMatch(/^\{worst quality\}.*, hat$/)
    expect(
      novelAiPresetFields('furry', 'off', 'nai-diffusion-4-5-curated')
        .ucPresetId,
    ).toBe('none')
  })

  it('UC 没写也不再静默补别的词', () => {
    expect(
      composeNovelAiUndesiredContent('', 'none', 'nai-diffusion-5-full'),
    ).toBe('')
    expect(novelAiPresetFields('none', 'off', 'nai-diffusion-5-full')).toEqual({
      ucPresetId: 'none',
      qualityPresetId: 'none',
      tag_hint_uc_preset: 0,
      tag_hint_qt: 0,
    })
  })
})

describe('导入外部配方：剥掉已经拼好的预设串', () => {
  it('正面末尾的质量标签串剥掉并报出档名（含 Text: 段之前、各代写法）', () => {
    expect(
      stripNovelAiQualityTags(
        '1girl, rain, very aesthetic, masterpiece, no text',
      ),
    ).toEqual({ prompt: '1girl, rain', preset: 'standard' })
    expect(
      stripNovelAiQualityTags(
        '1girl, very aesthetic, amazing quality, Text: hello',
      ),
    ).toEqual({ prompt: '1girl, Text: hello', preset: 'light' })
    expect(
      stripNovelAiQualityTags(
        '1girl, location, masterpiece, no text, -0.8::feet::, rating:general',
      ),
    ).toEqual({ prompt: '1girl', preset: 'standard' })
    // 中间出现的同名标签不是网页端拼的那串，不动。
    expect(stripNovelAiQualityTags('masterpiece, 1girl')).toEqual({
      prompt: 'masterpiece, 1girl',
      preset: null,
    })
  })

  it('负面开头的 UC 预设串剥掉，Human Focus 不被认成 Heavy', () => {
    const heavy =
      'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page'
    expect(stripNovelAiUcPreset(`${heavy}, hat`)).toEqual({
      negative: 'hat',
      preset: 'heavy',
    })
    expect(
      stripNovelAiUcPreset(
        `${heavy}, @_@, mismatched pupils, glowing eyes, bad anatomy, hat`,
      ),
    ).toEqual({ negative: 'hat', preset: 'human' })
    expect(stripNovelAiUcPreset('lowres, hat')).toEqual({
      negative: 'lowres, hat',
      preset: null,
    })
  })
})

const left = { x: 0.3, y: 0.5 }
const right = { x: 0.7, y: 0.5 }

describe('互动 → 角色栏', () => {
  it('发起方 source#、对方 target#，互相两边 mutual#', () => {
    expect(
      composeNovelAiCharacterCaptions([
        {
          prompt: 'girl, blonde hair',
          interactions: [{ tag: 'headpat', target: 1 }],
        },
        {
          prompt: 'girl, black hair',
          interactions: [{ tag: 'holding hands', target: 0, mutual: true }],
        },
      ]),
    ).toEqual([
      'girl, blonde hair, source#headpat, mutual#holding hands',
      'girl, black hair, target#headpat, mutual#holding hands',
    ])
  })

  it('对方那边写法不同的动作用官方那一种（pointing at another → pointing）', () => {
    expect(
      composeNovelAiCharacterCaptions([
        {
          prompt: 'girl',
          interactions: [{ tag: 'pointing at another', target: 1 }],
        },
        { prompt: 'boy' },
      ]),
    ).toEqual(['girl, source#pointing at another', 'boy, target#pointing'])
  })

  it('指向自己或不存在的人的互动不写', () => {
    expect(
      composeNovelAiCharacterCaptions([
        {
          prompt: 'girl',
          interactions: [
            { tag: 'hug', target: 0 },
            { tag: 'kiss', target: 5 },
          ],
        },
      ]),
    ).toEqual(['girl'])
  })
})

describe('台词 → 整体里按站位称呼 + 末尾 Text:', () => {
  it('两人交给模型站位：按名单顺序称呼左右，每段空一行', () => {
    const plan = planNovelAiText({
      positioning: 'auto',
      characters: [
        {
          prompt: 'girl, blonde hair',
          dialogue: "You're late!",
          position: right,
        },
        {
          prompt: 'girl, black hair',
          dialogue: 'Good morning!',
          position: left,
        },
      ],
    })
    expect(plan.sentences).toBe(
      'The girl on the left says "You\'re late!" and the girl on the right says "Good morning!"',
    )
    expect(plan.block).toBe("You're late!\n\nGood morning!")
    expect(plan.tags).toEqual(['text', 'english text', 'speech bubble'])
    expect(plan.length).toBe("You're late!".length + 2 + 'Good morning!'.length)
  })

  it('手动摆位按横坐标称呼', () => {
    const plan = planNovelAiText({
      positioning: 'manual',
      characters: [
        { prompt: 'girl', dialogue: '你迟到了！', position: right },
        { prompt: '1boy', position: left },
      ],
    })
    expect(plan.sentences).toBe('The girl on the right says "你迟到了！"')
    expect(plan.tags).toEqual(['text', 'chinese text', 'speech bubble'])
  })

  it('三人用 left / middle / right；四人以上改写进各自角色栏', () => {
    const three = planNovelAiText({
      positioning: 'auto',
      characters: [
        { prompt: 'girl', position: left },
        { prompt: 'boy', dialogue: 'Hi', position: left },
        { prompt: 'girl', position: left },
      ],
    })
    expect(three.sentences).toBe('The boy in the middle says "Hi"')

    const four = planNovelAiText({
      positioning: 'auto',
      characters: [
        { prompt: 'girl', position: left },
        { prompt: 'girl', dialogue: 'A', position: left },
        { prompt: 'girl', position: left },
        { prompt: 'girl', dialogue: 'B', position: left },
      ],
    })
    expect(four.sentences).toBe('')
    expect(four.block).toBe('')
    expect(four.characterText).toEqual([undefined, 'A', undefined, 'B'])
  })

  it('日文不补语言标签（NAI 没有 japanese text），韩文补 korean text', () => {
    expect(
      planNovelAiText({
        positioning: 'auto',
        characters: [
          { prompt: 'girl', dialogue: 'おはよう！', position: left },
        ],
      }).tags,
    ).toEqual(['text', 'speech bubble'])
    expect(
      planNovelAiText({
        positioning: 'auto',
        characters: [{ prompt: 'girl', dialogue: '안녕', position: left }],
      }).tags,
    ).toEqual(['text', 'korean text', 'speech bubble'])
  })

  it('画面文字只补 text 与语言，不补 speech bubble', () => {
    const plan = planNovelAiText({
      positioning: 'auto',
      characters: [],
      sceneTexts: [
        { kind: 'sign', text: 'CAFE' },
        { kind: 'title', text: '  ' },
      ],
    })
    expect(plan.sentences).toBe('A sign that reads "CAFE"')
    expect(plan.block).toBe('CAFE')
    expect(plan.tags).toEqual(['text', 'english text'])
  })

  it('没字就什么都不补', () => {
    const plan = planNovelAiText({
      positioning: 'auto',
      characters: [{ prompt: 'girl', dialogue: '  ', position: left }],
    })
    expect(plan).toMatchObject({
      sentences: '',
      block: '',
      tags: [],
      length: 0,
    })
  })
})

describe('整体拼装', () => {
  const plan = planNovelAiText({
    positioning: 'auto',
    characters: [
      { prompt: 'girl', dialogue: 'A', position: left },
      { prompt: 'girl', dialogue: 'B', position: right },
    ],
  })

  it('标签 → 文字标签 → 称呼句 → 质量标签（去掉 no text）→ Text: 最末', () => {
    expect(
      composeNovelAiPrompt(
        '2girls, cafe',
        'standard',
        plan,
        'nai-diffusion-5-full',
      ),
    ).toBe(
      '2girls, cafe, text, english text, speech bubble. The girl on the left says "A" and the girl on the right says "B", very aesthetic, masterpiece, Text: A\n\nB',
    )
  })

  it('没字时质量标签原样（no text 留着挡背景乱码）', () => {
    expect(
      composeNovelAiPrompt(
        '1girl',
        'standard',
        planNovelAiText({ positioning: 'auto', characters: [] }),
        'nai-diffusion-5-full',
      ),
    ).toBe('1girl, very aesthetic, masterpiece, no text')
    expect(
      composeNovelAiPrompt(
        '1girl',
        'standard',
        undefined,
        'nai-diffusion-4-5-curated',
      ),
    ).toBe(
      '1girl, location, masterpiece, no text, -0.8::feet::, rating:general',
    )
  })
})

describe('字数与语言', () => {
  it('超过模型上限、V4.5 遇到非英文都拦', () => {
    const chinese = planNovelAiText({
      positioning: 'auto',
      characters: [{ prompt: 'girl', dialogue: '你好', position: left }],
    })
    expect(checkNovelAiText(chinese, 'nai-diffusion-4-5-full')).toEqual({
      kind: 'latinOnly',
    })
    expect(checkNovelAiText(chinese, 'nai-diffusion-5-curated')).toBeNull()

    const long = planNovelAiText({
      positioning: 'auto',
      characters: [
        { prompt: 'girl', dialogue: 'a'.repeat(375), position: left },
      ],
    })
    expect(checkNovelAiText(long, 'nai-diffusion-5-curated')).toEqual({
      kind: 'tooLong',
      max: 374,
      length: 375,
    })
    expect(checkNovelAiText(long, 'nai-diffusion-5-full')).toBeNull()
  })
})

describe('人数提示', () => {
  it('两个人而整体写着 1girl, solo → 换成算出来的人数标签', () => {
    expect(
      suggestNovelAiCountTags('1girl, solo, cafe', [
        'girl, blonde hair',
        'girl',
      ]),
    ).toEqual({ remove: ['1girl', 'solo'], add: ['2girls'] })
    expect(suggestNovelAiCountTags('solo', ['girl', 'boy'])).toEqual({
      remove: ['solo'],
      add: ['1girl', '1boy'],
    })
  })

  it('认不出人称只去单人标签；已经对了或只有一个人不提示', () => {
    expect(
      suggestNovelAiCountTags('1girl, cafe', ['girl', 'cat ears']),
    ).toEqual({
      remove: ['1girl'],
      add: [],
    })
    expect(suggestNovelAiCountTags('2girls, cafe', ['girl', 'girl'])).toBeNull()
    expect(suggestNovelAiCountTags('cafe', ['girl', 'girl'])).toBeNull()
    expect(suggestNovelAiCountTags('1girl', ['girl'])).toBeNull()
  })

  it('角色栏里的人数标签', () => {
    expect(findNovelAiCharacterCountTags('1girl, solo, red dress')).toEqual([
      '1girl',
      'solo',
    ])
    expect(findNovelAiCharacterCountTags('girl, red dress')).toEqual([])
  })
})
