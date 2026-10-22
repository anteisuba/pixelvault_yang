import { describe, expect, it } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { CharacterReferenceSlot } from '@/types'

import {
  compileImageOutlet,
  toCardBusCharacter,
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

  it('没有角色时什么都不出', () => {
    expect(compileImageOutlet([], MULTI)).toEqual({
      promptPrefix: null,
      referenceImages: [],
      referenceLabels: [],
      negative: null,
      novelAiLayout: null,
    })
  })
})
