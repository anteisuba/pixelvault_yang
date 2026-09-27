import { describe, expect, it } from 'vitest'

import { ASSISTANT_OPERATOR_CARDS_LIMITS } from '@/constants/assistant-operator'
import type { CharacterCardRecord } from '@/types'
import { AssistantOperatorSnapshotSchema } from '@/types/assistant-operator'

import { buildCardsOperatorSnapshot } from './cards-operator-snapshot'

const card = (
  id: string,
  overrides: Partial<CharacterCardRecord> = {},
): CharacterCardRecord =>
  ({
    id,
    name: id,
    description: null,
    sourceImageUrl: `https://cdn.test/${id}.png`,
    referenceSlots: [
      {
        id: 's1',
        role: 'identity',
        url: `https://cdn.test/${id}.png`,
        isPrimary: true,
      },
    ],
    persona: null,
    cardTags: { character: [], appearance: [], loraTrigger: '' },
    workOverride: null,
    generationCount: 0,
    ...overrides,
  }) as CharacterCardRecord

describe('buildCardsOperatorSnapshot（卡片助手的 read_state）', () => {
  it('列表按张数排；作品从标签取，没有就是 null（原创）；写没写设定', () => {
    const snapshot = buildCardsOperatorSnapshot(
      [
        card('rixi'),
        card('denia', {
          generationCount: 5,
          cardTags: {
            character: ['denia_(wuthering_waves)'],
            appearance: [],
            loraTrigger: '',
          },
          persona: {
            identity: '魔术师',
            behavior: '',
            speech: '',
            catchphrases: [],
            scenario: '',
            opening: '',
            examples: [],
            backstory: '',
          },
        }),
      ],
      null,
      'zh',
    )
    expect(snapshot.prompt).toBe('')
    expect(snapshot.cards?.total).toBe(2)
    expect(snapshot.cards?.open).toBeNull()
    expect(snapshot.cards?.characters.map((c) => c.id)).toEqual([
      'denia',
      'rixi',
    ])
    expect(snapshot.cards?.characters[0]).toMatchObject({
      work: '鸣潮',
      imageCount: 6,
      hasProfile: true,
    })
    expect(snapshot.cards?.characters[1]).toMatchObject({
      work: null,
      hasProfile: false,
    })
    expect(AssistantOperatorSnapshotSchema.safeParse(snapshot).success).toBe(
      true,
    )
  })

  it('打开着的那一位带整份设定（按上限截断）；图的地址只有主图那一张（给服务端看图用）', () => {
    const long = 'x'.repeat(ASSISTANT_OPERATOR_CARDS_LIMITS.maxFieldChars + 50)
    const snapshot = buildCardsOperatorSnapshot(
      [
        card('denia', {
          description: '粉发红眼',
          persona: {
            identity: '魔术师',
            behavior: long,
            speech: '叫对方「观众先生」',
            catchphrases: [],
            scenario: '',
            opening: '',
            examples: [],
            backstory: '',
          },
          cardTags: {
            character: ['denia_(wuthering_waves)'],
            appearance: ['pink_hair'],
            loraTrigger: 'dnw',
          },
        }),
      ],
      'denia',
      'zh',
    )
    const open = snapshot.cards?.open
    expect(open).toMatchObject({
      id: 'denia',
      look: '粉发红眼',
      identity: '魔术师',
      speech: '叫对方「观众先生」',
      characterTags: ['denia_(wuthering_waves)'],
      appearanceTags: ['pink_hair'],
      loraTrigger: 'dnw',
      imagesOnCard: 1,
    })
    expect(open?.behavior).toHaveLength(
      ASSISTANT_OPERATOR_CARDS_LIMITS.maxFieldChars,
    )
    expect(snapshot.cards?.open?.primaryImageUrl).toBe(
      'https://cdn.test/denia.png',
    )
    const withoutPrimary = JSON.stringify(snapshot).replace(
      'https://cdn.test/denia.png',
      '',
    )
    expect(withoutPrimary).not.toContain('https://')
    expect(AssistantOperatorSnapshotSchema.safeParse(snapshot).success).toBe(
      true,
    )
  })
})
