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
    visual: `${handle} looks`,
    negative: null,
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
  it('主图排最前、身份槽次之，视觉文字合并描述，读出角色负面', () => {
    const result = toCardBusCharacter({
      id: 'c',
      version: 2,
      handle: '林夏',
      name: '林夏',
      characterPrompt: 'red eyes',
      description: 'black hoodie',
      extensions: { 'pv.negative': 'glasses', 'x.other': 1 },
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
  })

  it('同一张图换了域名只留一份（旧卡的自有 CDN 与 r2.dev 公链）', () => {
    const result = toCardBusCharacter({
      id: 'c',
      version: 1,
      handle: 'a',
      name: 'a',
      characterPrompt: null,
      description: null,
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

  it('描述与提示词相同时只写一遍；都空时是 null', () => {
    const base = {
      id: 'c',
      version: 1,
      handle: 'a',
      name: 'a',
      extensions: null,
      slots: [],
    }
    expect(
      toCardBusCharacter({ ...base, characterPrompt: 'x', description: 'x' })
        .visual,
    ).toBe('x')
    expect(
      toCardBusCharacter({ ...base, characterPrompt: ' ', description: null })
        .visual,
    ).toBeNull()
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
