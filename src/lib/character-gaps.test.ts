import { describe, expect, it } from 'vitest'

import type { CharacterCardRecord } from '@/types'
import { characterGaps } from '@/lib/character-gaps'

const full = {
  identity: '学生',
  behavior: '先帮别人撑伞',
  speech: '叫你「前辈」',
  backstory: '从小在海边长大',
  interests: ['雨天'],
}

const card = (patch: Partial<CharacterCardRecord> = {}) =>
  ({
    tavern: null,
    persona: full,
    looks: [{ referenceSlots: [{ id: 's', url: 'u' }] }],
    ...patch,
  }) as unknown as CharacterCardRecord

describe('characterGaps（第 ⑩ 步缺什么出什么）', () => {
  it('什么都齐 = 不出药丸', () => {
    expect(characterGaps(card())).toEqual([])
  })

  it('设定有空格、没图、没兴趣各出一颗', () => {
    expect(
      characterGaps(
        card({
          persona: { ...full, speech: '', interests: [] } as never,
          looks: [{ referenceSlots: [] }] as never,
        }),
      ),
    ).toEqual(['fillProfile', 'findImages', 'interests'])
  })

  it('酒馆卡导入、身份和说话都空 = 整理导入的卡（不再出补全设定）', () => {
    expect(
      characterGaps(
        card({
          tavern: {} as never,
          persona: { ...full, identity: '', speech: '' } as never,
        }),
      ),
    ).toEqual(['tidyImport'])
  })

  it('还没写过设定也算缺', () => {
    expect(characterGaps(card({ persona: null }))).toEqual([
      'fillProfile',
      'interests',
    ])
  })
})
