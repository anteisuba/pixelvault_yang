import { describe, expect, it } from 'vitest'

import {
  characterImageCount,
  characterWork,
  workTagFromCharacterTag,
} from './character-works'

const tags = (character: string[]) => ({
  character,
  appearance: [],
  loraTrigger: '',
})

describe('characterWork', () => {
  it('从角色标签最后一组括号取作品，表里有的给三语名', () => {
    expect(workTagFromCharacterTag('denia_(wuthering_waves)')).toBe(
      'wuthering_waves',
    )
    expect(
      characterWork(
        { workOverride: null, cardTags: tags(['denia_(wuthering_waves)']) },
        'zh',
      ),
    ).toEqual({ label: '鸣潮', source: 'tag', tag: 'wuthering_waves' })
    expect(
      characterWork(
        { workOverride: null, cardTags: tags(['denia_(wuthering_waves)']) },
        'en',
      ).label,
    ).toBe('Wuthering Waves')
  })

  it('表里没有的把标签还原成词；手改值优先；都没有归原创', () => {
    expect(
      characterWork(
        { workOverride: null, cardTags: tags(['x_(some_new_game)']) },
        'zh',
      ).label,
    ).toBe('Some New Game')
    expect(
      characterWork(
        {
          workOverride: '我的世界观',
          cardTags: tags(['denia_(wuthering_waves)']),
        },
        'zh',
      ),
    ).toMatchObject({ label: '我的世界观', source: 'override' })
    expect(
      characterWork({ workOverride: null, cardTags: tags(['amamiya']) }, 'zh'),
    ).toEqual({ label: null, source: 'original', tag: null })
  })

  it('张数 = 卡上的图 + 用她出过的图', () => {
    expect(
      characterImageCount({
        referenceSlots: [
          { id: 'a', role: 'identity', url: 'u', isPrimary: true },
        ],
        generationCount: 4,
      }),
    ).toBe(5)
  })
})
