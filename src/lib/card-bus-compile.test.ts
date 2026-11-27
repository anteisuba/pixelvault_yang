import { describe, expect, it } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { CharacterReferenceSlot } from '@/types'

import {
  compileImageOutlet,
  toCardBusCharacter,
  willSendNovelAiCharacterReference,
  type CardBusCharacter,
  type ImageOutletOptions,
} from './card-bus-compile'

function slot(
  id: string,
  overrides: Partial<CharacterReferenceSlot> = {},
): CharacterReferenceSlot {
  return {
    id,
    role: 'identity',
    url: `https://cdn.test/${id}.png`,
    isPrimary: false,
    ...overrides,
  }
}

function character(
  handle: string,
  slots: CharacterReferenceSlot[],
  overrides: Partial<CardBusCharacter> = {},
): CardBusCharacter {
  return {
    cardId: `card-${handle}`,
    version: 1,
    handle,
    name: handle,
    lookId: null,
    visual: `${handle} looks`,
    negative: null,
    tags: [],
    slots,
    ...overrides,
  }
}

const MULTI: ImageOutletOptions = {
  adapterType: AI_ADAPTER_TYPES.GEMINI,
  modelId: AI_MODELS.GEMINI_FLASH_IMAGE,
  maxReferenceImages: 5,
  userReferenceCount: 0,
  hasNovelAiLayout: false,
}

describe('toCardBusCharacter', () => {
  it('主图排最前、身份槽次之，视觉文字与标签取造型，读出角色负面', () => {
    const result = toCardBusCharacter({
      id: 'c',
      version: 2,
      handle: '林夏',
      name: '林夏',
      lookId: 'look-1',
      description: 'red eyes\nblack hoodie',
      tags: ['lin_xia', 'black_hoodie'],
      extensions: {
        'pv.negative': 'glasses',
        'x.other': 1,
      },
      slots: [
        slot('pose', { role: 'pose' }),
        slot('side'),
        slot('main', { isPrimary: true }),
      ],
    })
    expect(result.slots.map((item) => item.id)).toEqual([
      'main',
      'side',
      'pose',
    ])
    expect(result.visual).toBe('red eyes\nblack hoodie')
    expect(result.negative).toBe('glasses')
    expect(result.lookId).toBe('look-1')
    expect(result.tags).toEqual(['lin_xia', 'black_hoodie'])
  })

  it('同一张图换了域名只留一份（旧卡的自有 CDN 与 r2.dev 公链）', () => {
    const result = toCardBusCharacter({
      id: 'c',
      version: 1,
      handle: 'a',
      name: 'a',
      lookId: null,
      description: null,
      tags: [],
      extensions: null,
      slots: [
        slot('main', {
          isPrimary: true,
          url: 'https://cdn.example.com/generations/u/image/a.png',
        }),
        slot('dup', { url: 'https://pub-x.r2.dev/generations/u/image/a.png' }),
      ],
    })
    expect(result.slots.map((item) => item.id)).toEqual(['main'])
  })

  it('外观去首尾空白；空白时是 null', () => {
    const base = {
      id: 'c',
      version: 1,
      handle: 'a',
      name: 'a',
      lookId: null,
      tags: [],
      extensions: null,
      slots: [],
    }
    expect(toCardBusCharacter({ ...base, description: ' x ' }).visual).toBe('x')
    expect(toCardBusCharacter({ ...base, description: ' ' }).visual).toBeNull()
  })
})

describe('compileImageOutlet', () => {
  it('配额在角色间轮流分，不让一个角色吃光', () => {
    const outlet = compileImageOutlet(
      [
        character('A', [
          slot('a1', { isPrimary: true }),
          slot('a2'),
          slot('a3'),
        ]),
        character('B', [slot('b1', { isPrimary: true }), slot('b2')]),
      ],
      { ...MULTI, maxReferenceImages: 4, userReferenceCount: 1 },
    )
    expect(outlet.referenceImages).toEqual([
      'https://cdn.test/a1.png',
      'https://cdn.test/a2.png',
      'https://cdn.test/b1.png',
    ])
    expect(outlet.promptPrefix).toContain('Image 2 = @A identity (primary)')
    expect(outlet.promptPrefix).toContain('Image 4 = @B identity (primary)')
    expect(outlet.promptPrefix).toContain(
      "Keep @A's face, hairstyle, hair colors and outfit identical to Image 2, Image 3.",
    )
    expect(outlet.promptPrefix).toContain(
      "Keep @B's face, hairstyle, hair colors and outfit identical to Image 4.",
    )
    expect(outlet.referenceLabels).toEqual([
      'Image 2 = @A identity (primary)',
      'Image 3 = @A identity',
      'Image 4 = @B identity (primary)',
    ])
  })

  it('单图模型只送焦点角色的主图，其余角色只进文字', () => {
    const outlet = compileImageOutlet(
      [
        character('A', [slot('a1', { isPrimary: true })]),
        character('B', [slot('b1', { isPrimary: true })]),
      ],
      { ...MULTI, maxReferenceImages: 1 },
    )
    expect(outlet.referenceImages).toEqual(['https://cdn.test/a1.png'])
    expect(outlet.promptPrefix).toContain('[Character: @B]\nB looks')
  })

  it('用户参考图占满配额时不送卡图，但身份句照写', () => {
    const outlet = compileImageOutlet(
      [character('A', [slot('a1', { isPrimary: true })])],
      { ...MULTI, maxReferenceImages: 1, userReferenceCount: 1 },
    )
    expect(outlet.referenceImages).toEqual([])
    expect(outlet.promptPrefix).toBe('[Character: @A]\nA looks')
  })

  it('custom 用途在图例里写它的名字；名字与 handle 不同时括号标出', () => {
    const outlet = compileImageOutlet(
      [
        character(
          'Denia-Q版',
          [
            slot('c1', {
              role: 'custom',
              customLabel: '武器',
              isPrimary: false,
            }),
          ],
          { name: 'Denia' },
        ),
      ],
      MULTI,
    )
    expect(outlet.promptPrefix).toContain('[Character: @Denia-Q版 (Denia)]')
    expect(outlet.promptPrefix).toContain('Image 1 = @Denia-Q版 武器')
  })

  it('NovelAI 支持多角色的型号走原生 characterPrompts，不送卡图', () => {
    const outlet = compileImageOutlet(
      [
        character('A', [slot('a1', { isPrimary: true })], { negative: 'hat' }),
        character('B', [slot('b1', { isPrimary: true })]),
      ],
      {
        ...MULTI,
        adapterType: AI_ADAPTER_TYPES.NOVELAI,
        modelId: AI_MODELS.NOVELAI_V5_FULL,
      },
    )
    expect(outlet.referenceImages).toEqual([])
    expect(outlet.promptPrefix).toBeNull()
    expect(outlet.novelAiLayout?.characters).toEqual([
      expect.objectContaining({ prompt: 'A looks', negativePrompt: 'hat' }),
      expect.objectContaining({ prompt: 'B looks', negativePrompt: '' }),
    ])
  })

  it('NovelAI 用户已手摆多角色时不替他排，角色退回文字', () => {
    const outlet = compileImageOutlet(
      [character('A', [slot('a1', { isPrimary: true })])],
      {
        ...MULTI,
        adapterType: AI_ADAPTER_TYPES.NOVELAI,
        modelId: AI_MODELS.NOVELAI_V5_FULL,
        hasNovelAiLayout: true,
      },
    )
    expect(outlet.novelAiLayout).toBeNull()
    expect(outlet.referenceImages).toEqual([])
    expect(outlet.promptPrefix).toBe('[Character: @A]\nA looks')
  })

  it('NovelAI 用这套造型的标签认人', () => {
    const denia = character('Denia', [slot('d1', { isPrimary: true })], {
      tags: ['denia_(wuthering_waves)', 'pink_hair'],
    })
    const nai = {
      ...MULTI,
      adapterType: AI_ADAPTER_TYPES.NOVELAI,
      modelId: AI_MODELS.NOVELAI_V5_FULL,
    }
    expect(
      compileImageOutlet([denia], nai).novelAiLayout?.characters[0]?.prompt,
    ).toBe('denia_(wuthering_waves), pink_hair')
  })

  it('分到图的角色不写视觉文字（靠图认人）', () => {
    const denia = character('Denia', [slot('d1', { isPrimary: true })], {
      tags: ['denia_(wuthering_waves)'],
    })
    const plain = compileImageOutlet([denia], MULTI).promptPrefix
    expect(plain).toContain('[Character: @Denia]\n\nReference images:')
    expect(plain).not.toContain('Denia looks')
  })

  it('Nano Banana 人物参考上限：卡图按 maxCharacterReferenceImages 封顶', () => {
    const outlet = compileImageOutlet(
      [
        character('A', [slot('a1', { isPrimary: true }), slot('a2')]),
        character('B', [slot('b1', { isPrimary: true }), slot('b2')]),
      ],
      { ...MULTI, maxReferenceImages: 14, maxCharacterReferenceImages: 3 },
    )
    expect(outlet.referenceImages).toEqual([
      'https://cdn.test/a1.png',
      'https://cdn.test/a2.png',
      'https://cdn.test/b1.png',
    ])
  })

  describe('NovelAI 精确参考', () => {
    const v45 = {
      ...MULTI,
      adapterType: AI_ADAPTER_TYPES.NOVELAI,
      modelId: AI_MODELS.NOVELAI_V45_FULL,
      maxReferenceImages: 1,
      novelAiPreciseReference: true,
    }
    const denia = character(
      'Denia',
      [
        slot('d1', { isPrimary: true, role: 'identity' }),
        slot('d2', { role: 'style' }),
        slot('d3', { role: 'costume' }),
      ],
      {
        tags: ['denia'],
        lookId: 'look-1',
      },
    )

    it('开了 + 单角色：自动模式取主图送进独立精确参考轨，不占底图轨且不静默烧多张', () => {
      const outlet = compileImageOutlet([denia], v45)
      expect(outlet.novelAiPreciseReference).toBe(true)
      expect(outlet.referenceImages).toEqual([])
      expect(outlet.novelAiPreciseReferences).toEqual([
        {
          url: 'https://cdn.test/d1.png',
          kind: 'character',
          strength: 1,
          fidelity: 1,
          source: {
            type: 'card',
            cardId: 'card-Denia',
            lookId: 'look-1',
            slotId: 'd1',
          },
        },
      ])
      expect(outlet.referenceLabels).toEqual([])
      expect(outlet.novelAiLayout?.characters[0]?.prompt).toBe('denia')
    })

    it('用户显式挑多张图：按槽 role 映射（identity→character / style→style），不支持的 costume 自动略过', () => {
      const outlet = compileImageOutlet([{ ...denia, pickedSlots: true }], v45)
      expect(outlet.referenceImages).toEqual([])
      expect(outlet.novelAiPreciseReferences).toEqual([
        expect.objectContaining({
          url: 'https://cdn.test/d1.png',
          kind: 'character',
        }),
        expect.objectContaining({
          url: 'https://cdn.test/d2.png',
          kind: 'style',
        }),
      ])
    })

    it('底图轨与精确参考轨解耦：用户自己挂了图生图底图照样发送角色精确参考', () => {
      const outlet = compileImageOutlet([denia], {
        ...v45,
        userReferenceCount: 1,
      })
      expect(outlet.novelAiPreciseReference).toBe(true)
      expect(outlet.referenceImages).toEqual([])
      expect(outlet.novelAiPreciseReferences).toHaveLength(1)
    })

    it('默认关：不送卡图', () => {
      const outlet = compileImageOutlet([denia], {
        ...v45,
        novelAiPreciseReference: false,
      })
      expect(outlet.novelAiPreciseReference).toBe(false)
      expect(outlet.novelAiPreciseReferences).toEqual([])
      expect(outlet.referenceImages).toEqual([])
    })

    it('V4.5 多角色不送（官方：V4.5 多张角色参考会混成一个人）', () => {
      const outlet = compileImageOutlet(
        [denia, character('B', [slot('b1', { isPrimary: true })])],
        v45,
      )
      expect(outlet.novelAiPreciseReference).toBe(false)
      expect(outlet.novelAiPreciseReferences).toEqual([])
    })

    it('V5 Full 支持多角色精确参考与 costume→outfit 映射；V5 重绘与 V5 Medium 不送', () => {
      const v5 = { ...v45, modelId: AI_MODELS.NOVELAI_V5_FULL }
      const multi = compileImageOutlet(
        [
          { ...denia, pickedSlots: true },
          character('B', [slot('b1', { isPrimary: true })]),
        ],
        v5,
      )
      expect(multi.referenceImages).toEqual([])
      expect(multi.novelAiPreciseReference).toBe(true)
      expect(multi.novelAiPreciseReferences).toEqual([
        expect.objectContaining({
          url: 'https://cdn.test/d1.png',
          kind: 'character',
          strength: 1,
        }),
        expect.objectContaining({
          url: 'https://cdn.test/d2.png',
          kind: 'style',
          strength: 1,
        }),
        expect.objectContaining({
          url: 'https://cdn.test/d3.png',
          kind: 'outfit',
          strength: 1,
        }),
        expect.objectContaining({
          url: 'https://cdn.test/b1.png',
          kind: 'character',
          strength: 1,
        }),
      ])
      // V5 无 fidelity
      expect(multi.novelAiPreciseReferences[0]).not.toHaveProperty('fidelity')
      // V5 charRefInpainting: false
      expect(
        compileImageOutlet([denia], { ...v5, hasInpaintMask: true })
          .novelAiPreciseReferences,
      ).toEqual([])
      // V5 Medium 不支持精确参考
      expect(
        compileImageOutlet([denia], {
          ...v45,
          modelId: AI_MODELS.NOVELAI_V5_FULL_MEDIUM,
        }).novelAiPreciseReferences,
      ).toEqual([])
      // V4.5 支持与重绘叠加（charRefInpainting: true）
      expect(
        compileImageOutlet([denia], { ...v45, hasInpaintMask: true })
          .novelAiPreciseReferences,
      ).toHaveLength(1)
    })

    it('没有卡图的角色：不送', () => {
      expect(
        willSendNovelAiCharacterReference({
          modelId: AI_MODELS.NOVELAI_V45_CURATED,
          enabled: true,
          characterCount: 1,
          characterHasImage: false,
          hasInpaintMask: false,
        }),
      ).toBe(false)
    })
  })

  it('没有角色时什么都不出', () => {
    expect(compileImageOutlet([], MULTI)).toEqual({
      promptPrefix: null,
      referenceImages: [],
      referenceLabels: [],
      negative: null,
      novelAiLayout: null,
      novelAiPreciseReferences: [],
      novelAiPreciseReference: false,
    })
  })
})
