import { describe, expect, it } from 'vitest'

import type { CharacterCardRecord } from '@/types'

import {
  defaultCharacterPicks,
  mentionedCharacters,
  stripCharacterMentionMarks,
} from './node-character-mentions'

function card(
  id: string,
  name: string,
  slots: { id: string; url: string; isPrimary?: boolean }[] = [],
): CharacterCardRecord {
  return {
    id,
    name,
    referenceSlots: slots.map((slot) => ({ isPrimary: false, ...slot })),
    sourceImageUrl: null,
    variants: [],
  } as unknown as CharacterCardRecord
}

const DENIA = card('denia', 'Denia', [
  { id: 's_back', url: 'u/back' },
  { id: 's_main', url: 'u/main', isPrimary: true },
])
const RIXI = card('rixi', '里希', [{ id: 's_r', url: 'u/r' }])

describe('画布卡提示词里的 @她', () => {
  it('按出场先后认出角色库里的人，同一位只算一次', () => {
    const found = mentionedCharacters('@里希 看着 @Denia，@Denia 回头', [
      DENIA,
      RIXI,
    ])
    expect(found.map((item) => item.card.id)).toEqual(['rixi', 'denia'])
  })

  it('没勾过 = 主图 1 张；勾过就用勾的', () => {
    expect(defaultCharacterPicks(DENIA)).toEqual([{ slotId: 's_main' }])
    const [denia] = mentionedCharacters('@Denia', [DENIA], {
      denia: [{ generationId: 'g_1' }],
    })
    expect(denia!.picks).toEqual([{ generationId: 'g_1' }])
  })

  it('不是角色库里的名字不认（节点名、普通 @ 照旧）', () => {
    expect(mentionedCharacters('@图1 里的 @莫宁', [DENIA])).toEqual([])
  })

  it('发给模型的正文把 @她 写回她，别的 @ 不动', () => {
    const mentions = mentionedCharacters('@Denia 拿着 @图1', [DENIA])
    expect(stripCharacterMentionMarks('@Denia 拿着 @图1', mentions)).toBe(
      'Denia 拿着 @图1',
    )
  })
})
