import { describe, expect, it } from 'vitest'

import type {
  CharacterCardRecord,
  CharacterLookRecord,
  CharacterReferenceSlot,
  GenerationRecord,
} from '@/types'

import {
  appendSlotImages,
  draftFromCard,
  lookUpdateFromDraft,
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

const LOOK: CharacterLookRecord = {
  id: 'look',
  label: null,
  isDefault: true,
  description: '粉发',
  tags: ['denia', 'pink_hair'],
  referenceSlots: [slot('a', { isPrimary: true }), slot('b')],
}

const CARD = {
  id: 'c',
  name: 'Denia',
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
  looks: [LOOK],
  workOverride: null,
  summary: null,
  tavern: null,
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
  it('设定没编辑的格原样带回；作品清空 = 删键', () => {
    const draft = {
      ...draftFromCard(CARD),
      behavior: '先替别人撑好伞',
    }
    const update = updateFromDraft(CARD, draft)
    expect(update.persona).toMatchObject({
      identity: '魔术师',
      behavior: '先替别人撑好伞',
      catchphrases: ['呢'],
      scenario: 's',
      examples: [{ user: 'hi', reply: 'yo' }],
    })
    // 作品没填 = 删键，回到从角色标签取。
    expect(update.extensions).toEqual({ 'pv.work': null })
    // 外观 / 标签 / 图在造型上，⛔ 不再随卡一起写。
    expect(update).not.toHaveProperty('description')
    expect(update).not.toHaveProperty('referenceSlots')
  })

  it('酒馆字段：没卡外字段时不写 st.card；对话示例没改原样带回，改了按 <START> 重新切', () => {
    const untouched = updateFromDraft(CARD, {
      ...draftFromCard(CARD),
      summary: ' 雨夜店主 ',
    })
    expect(untouched.summary).toBe('雨夜店主')
    expect(untouched.extensions).not.toHaveProperty('st.card')
    expect(untouched.persona?.examples).toEqual([{ user: 'hi', reply: 'yo' }])

    const edited = updateFromDraft(CARD, {
      ...draftFromCard(CARD),
      examples: '<START>\n{{user}}: 你好\n{{char}}: 嗯',
      systemPrompt: ' 只演 Denia ',
      alternateGreetings: [' 早 ', '  '],
    })
    expect(edited.persona?.examples).toEqual([{ user: '你好', reply: '嗯' }])
    expect(edited.extensions?.['st.card']).toEqual({
      systemPrompt: '只演 Denia',
      alternateGreetings: ['早'],
    })
  })

  it('原卡外字段（世界书等）保留；清空系统提示词就删键', () => {
    const card = {
      ...CARD,
      tavern: { systemPrompt: 'x', characterBook: { entries: [] } },
    } as CharacterCardRecord
    const update = updateFromDraft(card, {
      ...draftFromCard(card),
      systemPrompt: '',
    })
    expect(update.extensions?.['st.card']).toEqual({
      characterBook: { entries: [] },
    })
  })

  it('作品手改值写进 pv.work', () => {
    const update = updateFromDraft(CARD, {
      ...draftFromCard(CARD),
      work: '  鸣潮 ',
    })
    expect(update.extensions?.['pv.work']).toBe('鸣潮')
  })
})

describe('经历完整原文（旧卡导入被截在 6000）', () => {
  const original = `开头。${'经'.repeat(7000)}`
  const imported = {
    ...CARD,
    persona: { ...CARD.persona, backstory: original.slice(0, 6000) },
    tavern: { description: original, spec: 'chara_card_v2' },
  } as unknown as CharacterCardRecord

  it('经历没被改过 → 显示全文；存一次后全文进经历、st.card 不再留副本', () => {
    const draft = draftFromCard(imported)
    expect(draft.backstory).toBe(original)
    const request = updateFromDraft(imported, draft)
    expect(request.persona?.backstory).toBe(original)
    expect(request.extensions?.['st.card']).toEqual({ spec: 'chara_card_v2' })
  })

  it('经历已被用户改写 → 照旧显示改写的，原文留着', () => {
    const edited = {
      ...imported,
      persona: { ...imported.persona, backstory: '我自己写的经历' },
    } as unknown as CharacterCardRecord
    const draft = draftFromCard(edited)
    expect(draft.backstory).toBe('我自己写的经历')
    expect(updateFromDraft(edited, draft).extensions?.['st.card']).toEqual({
      description: original,
      spec: 'chara_card_v2',
    })
  })
})

describe('lookUpdateFromDraft（角色④）', () => {
  it('只带改了的格：空外观写 null，标签去空白去重', () => {
    expect(
      lookUpdateFromDraft(LOOK, {
        description: '  ',
        tags: [' pink_hair', 'pink_hair', '', 'chibi'],
      }),
    ).toEqual({ description: null, tags: ['pink_hair', 'chibi'] })
  })

  it('图没变或被清空：不写图', () => {
    expect(lookUpdateFromDraft(LOOK, { slots: LOOK.referenceSlots })).toEqual(
      {},
    )
    expect(lookUpdateFromDraft(LOOK, { slots: [] })).toEqual({})
    expect(
      lookUpdateFromDraft(LOOK, { slots: [slot('c', { isPrimary: true })] }),
    ).toHaveProperty('referenceSlots')
  })
})
