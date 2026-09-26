import { describe, expect, it } from 'vitest'

import type {
  CharacterCardRecord,
  CharacterReferenceSlot,
  GenerationRecord,
} from '@/types'

import {
  appendSlotImages,
  draftFromCard,
  makePrimary,
  removeSlot,
  replaceSlotImage,
  updateFromDraft,
} from './use-character-card-editor'

const slot = (
  id: string,
  overrides: Partial<CharacterReferenceSlot> = {},
): CharacterReferenceSlot => ({
  id,
  role: 'identity',
  url: `https://cdn.test/${id}.png`,
  isPrimary: false,
  ...overrides,
})

const CARD = {
  id: 'c',
  name: 'Denia',
  description: '粉发',
  persona: {
    identity: '魔术师',
    behavior: '',
    speech: '',
    catchphrases: ['呢'],
    scenario: 's',
    opening: '',
    examples: [{ user: 'hi', reply: 'yo' }],
    backstory: '',
  },
  cardTags: {
    character: ['denia'],
    appearance: ['pink_hair'],
    loraTrigger: '',
  },
  referenceSlots: [slot('a', { isPrimary: true }), slot('b')],
} as unknown as CharacterCardRecord

describe('makePrimary / removeSlot', () => {
  it('被点的那张变主图、排最前，并强制是身份用途', () => {
    const next = makePrimary(
      [slot('a', { isPrimary: true }), slot('b', { role: 'costume' })],
      'b',
    )
    expect(next.map((item) => [item.id, item.isPrimary, item.role])).toEqual([
      ['b', true, 'identity'],
      ['a', false, 'identity'],
    ])
  })

  it('删掉主图时剩下的第一张身份图接任；只剩一张时不能删', () => {
    const next = removeSlot(
      [
        slot('a', { isPrimary: true }),
        slot('b', { role: 'costume' }),
        slot('c'),
      ],
      'a',
    )
    expect(next.find((item) => item.isPrimary)?.id).toBe('c')
    expect(removeSlot([slot('a', { isPrimary: true })], 'a')).toHaveLength(1)
  })
})

const asset = (id: string, provider = 'user-upload') =>
  ({
    id,
    url: `https://cdn.test/${id}.png`,
    provider,
  }) as GenerationRecord

describe('replaceSlotImage', () => {
  it('只剩一张主图也能换：同一格换图，主图与用途不变，旧视角不带过去', () => {
    const [next] = replaceSlotImage(
      [slot('a', { isPrimary: true, viewType: 'front' })],
      'a',
      asset('g1'),
    )
    expect(next).toMatchObject({
      id: 'a',
      role: 'identity',
      isPrimary: true,
      url: 'https://cdn.test/g1.png',
      generationId: 'g1',
      origin: 'upload',
    })
    expect(next!.viewType).toBeUndefined()
  })

  it('换成卡上已有的图不动（url 不重复是槽的不变量）', () => {
    const slots = [slot('a', { isPrimary: true }), slot('b')]
    expect(
      replaceSlotImage(slots, 'a', {
        ...asset('x'),
        url: 'https://cdn.test/b.png',
      }),
    ).toBe(slots)
  })
})

describe('appendSlotImages', () => {
  it('素材库挑的图挂成身份图，生成的图记来源 generation；已在卡上的跳过', () => {
    const next = appendSlotImages(
      [slot('a', { isPrimary: true })],
      [
        asset('g1', 'openai'),
        { ...asset('dup'), url: 'https://cdn.test/a.png' },
      ],
    )
    expect(next).toHaveLength(2)
    expect(next[1]).toMatchObject({
      role: 'identity',
      isPrimary: false,
      generationId: 'g1',
      origin: 'generation',
    })
  })

  it('卡上没图时第一张当主图；满 15 张就停', () => {
    expect(appendSlotImages([], [asset('g1')])[0]!.isPrimary).toBe(true)
    const full = Array.from({ length: 15 }, (_, i) => slot(`s${i}`))
    expect(appendSlotImages(full, [asset('g1')])).toHaveLength(15)
  })
})

describe('updateFromDraft', () => {
  it('设定没编辑的格原样带回；标签按逗号拆；空外观写成 null', () => {
    const draft = {
      ...draftFromCard(CARD),
      behavior: '先替别人撑好伞',
      description: '  ',
      characterTags: 'denia_(wuthering_waves)， extra',
      loraTrigger: ' dnw ',
    }
    const update = updateFromDraft(CARD, draft)
    expect(update.description).toBeNull()
    expect(update.persona).toMatchObject({
      identity: '魔术师',
      behavior: '先替别人撑好伞',
      catchphrases: ['呢'],
      scenario: 's',
      examples: [{ user: 'hi', reply: 'yo' }],
    })
    expect(update.extensions).toEqual({
      'pv.tags': {
        character: ['denia_(wuthering_waves)', 'extra'],
        appearance: ['pink_hair'],
        loraTrigger: 'dnw',
      },
    })
    expect(update.referenceSlots).toHaveLength(2)
  })
})
