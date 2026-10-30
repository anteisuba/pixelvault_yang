import { describe, expect, it } from 'vitest'

import {
  ASSISTANT_OPERATOR_CANVAS_LIMITS,
  ASSISTANT_OPERATOR_CARDS_LIMITS,
} from '@/constants/assistant-operator'
import type { CharacterCardRecord, CharacterLookRecord } from '@/types'
import {
  AssistantOperatorCanvasSnapshotSchema,
  AssistantOperatorSnapshotSchema,
} from '@/types/assistant-operator'

import {
  buildCanvasCharacters,
  buildCardsOperatorSnapshot,
} from './cards-operator-snapshot'

/** `look` 改默认造型；`extraLooks` 追加其余造型。 */
const card = (
  id: string,
  overrides: Partial<CharacterCardRecord> = {},
  look: Partial<CharacterLookRecord> = {},
  extraLooks: CharacterLookRecord[] = [],
): CharacterCardRecord =>
  ({
    id,
    name: id,
    looks: [
      {
        id: `${id}-look`,
        label: null,
        isDefault: true,
        description: null,
        tags: [],
        referenceSlots: [
          {
            id: 's1',
            role: 'identity',
            url: `https://cdn.test/${id}.png`,
            isPrimary: true,
          },
        ],
        ...look,
      },
      ...extraLooks,
    ],
    persona: null,
    workOverride: null,
    summary: null,
    tavern: null,
    generationCount: 0,
    ...overrides,
  }) as CharacterCardRecord

describe('buildCardsOperatorSnapshot（卡片助手的 read_state）', () => {
  it('列表按张数排；作品从标签取，没有就是 null（原创）；写没写设定', () => {
    const snapshot = buildCardsOperatorSnapshot(
      [
        card('rixi'),
        card(
          'denia',
          {
            generationCount: 5,
            persona: {
              identity: '魔术师',
              behavior: '',
              speech: '',
              boundaries: '',
              catchphrases: [],
              moods: [],
              learnedPhrases: [],
              relationship: '',
              interests: [],
              scenario: '',
              opening: '',
              examples: [],
              backstory: '',
            },
          },
          { tags: ['denia_(wuthering_waves)'] },
        ),
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
        card(
          'denia',
          {
            persona: {
              identity: '魔术师',
              behavior: long,
              speech: '叫对方「观众先生」',
              boundaries: '',
              catchphrases: [],
              moods: [],
              learnedPhrases: [],
              relationship: '',
              interests: [],
              scenario: '',
              opening: '',
              examples: [],
              backstory: '',
            },
          },
          {
            description: '粉发红眼',
            tags: ['denia_(wuthering_waves)', 'pink_hair'],
          },
          [
            {
              id: 'denia-q',
              label: 'Q版',
              isDefault: false,
              description: '三头身',
              tags: ['chibi'],
              referenceSlots: [
                {
                  id: 'q1',
                  role: 'identity',
                  url: 'https://cdn.test/denia-q.png',
                  isPrimary: true,
                },
              ],
            },
          ],
        ),
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
      tags: ['denia_(wuthering_waves)', 'pink_hair'],
      otherLooks: ['Q版'],
      imagesOnCard: 1,
    })
    expect(open?.behavior).toHaveLength(
      ASSISTANT_OPERATOR_CARDS_LIMITS.maxFieldChars,
    )
    expect(snapshot.cards?.open?.primaryImageUrl).toBe(
      'https://cdn.test/denia.png',
    )
    // 卡上的图同样只给服务端看图用（S14）。
    expect(snapshot.cards?.open?.cardImageUrls).toEqual([
      'https://cdn.test/denia.png',
    ])
    const withoutPrimary = JSON.stringify(snapshot).replaceAll(
      'https://cdn.test/denia.png',
      '',
    )
    expect(withoutPrimary).not.toContain('https://')
    expect(AssistantOperatorSnapshotSchema.safeParse(snapshot).success).toBe(
      true,
    )
  })
})

describe('buildCanvasCharacters（画布助手写剧本 / 台词时 @ 谁）', () => {
  const persona = {
    identity: '舞台魔术师',
    behavior: '',
    speech: '叫对方「观众先生」',
    boundaries: '',
    catchphrases: [],
    moods: [],
    learnedPhrases: [],
    relationship: '',
    interests: [],
    scenario: '',
    opening: '',
    examples: [],
    backstory: '',
  }

  it('画布上的几位排最前、带设定；其余只有名字；⛔ 不给 id 与图地址', () => {
    const characters = buildCanvasCharacters(
      [
        card('rixi', { generationCount: 9 }),
        card('denia', { persona }, { description: '粉发红眼' }),
      ],
      new Set(['denia']),
      'zh',
    )
    expect(characters.total).toBe(2)
    expect(characters.list.map((item) => item.name)).toEqual(['denia', 'rixi'])
    expect(characters.list[0]).toMatchObject({
      onCanvas: true,
      profile: {
        look: '粉发红眼',
        identity: '舞台魔术师',
        speech: '叫对方「观众先生」',
      },
    })
    expect(characters.list[1]).toMatchObject({ onCanvas: false })
    expect(characters.list[1]).not.toHaveProperty('profile')
    expect(JSON.stringify(characters)).not.toContain('https://')
    expect(characters.list[0]).not.toHaveProperty('id')
    expect(
      AssistantOperatorCanvasSnapshotSchema.safeParse({
        currentShotNo: null,
        shots: [],
        characters,
      }).success,
    ).toBe(true)
  })

  it('带设定的最多 maxCastProfiles 位', () => {
    const many = Array.from(
      { length: ASSISTANT_OPERATOR_CANVAS_LIMITS.maxCastProfiles + 2 },
      (_, index) => card(`c${index}`, { persona }),
    )
    const characters = buildCanvasCharacters(
      many,
      new Set(many.map((item) => item.id)),
      'zh',
    )
    expect(characters.list.filter((item) => item.profile)).toHaveLength(
      ASSISTANT_OPERATOR_CANVAS_LIMITS.maxCastProfiles,
    )
  })
})
