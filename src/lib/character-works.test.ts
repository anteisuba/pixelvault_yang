import { describe, expect, it } from 'vitest'

import type { CharacterLookRecord } from '@/types'

import {
  characterImageCount,
  characterWork,
  workTagFromCharacterTag,
} from './character-works'

const look = (
  tags: string[],
  urls: string[] = [],
  isDefault = true,
): CharacterLookRecord => ({
  id: `look-${tags.join()}-${isDefault}`,
  label: null,
  isDefault,
  description: null,
  tags,
  referenceSlots: urls.map((url, index) => ({
    id: url,
    role: 'identity',
    url,
    isPrimary: index === 0,
  })),
})

const looks = (tags: string[]) => [look(tags)]

describe('characterWork', () => {
  it('从角色标签最后一组括号取作品，表里有的给三语名', () => {
    expect(workTagFromCharacterTag('denia_(wuthering_waves)')).toBe(
      'wuthering_waves',
    )
    expect(
      characterWork(
        { workOverride: null, looks: looks(['denia_(wuthering_waves)']) },
        'zh',
      ),
    ).toEqual({ label: '鸣潮', source: 'tag', tag: 'wuthering_waves' })
    expect(
      characterWork(
        { workOverride: null, looks: looks(['denia_(wuthering_waves)']) },
        'en',
      ).label,
    ).toBe('Wuthering Waves')
  })

  it('表里没有的把标签还原成词；手改值优先；都没有归原创', () => {
    expect(
      characterWork(
        { workOverride: null, looks: looks(['x_(some_new_game)']) },
        'zh',
      ).label,
    ).toBe('Some New Game')
    expect(
      characterWork(
        {
          workOverride: '我的世界观',
          looks: looks(['denia_(wuthering_waves)']),
        },
        'zh',
      ),
    ).toMatchObject({ label: '我的世界观', source: 'override' })
    expect(
      characterWork({ workOverride: null, looks: looks(['amamiya']) }, 'zh'),
    ).toEqual({ label: null, source: 'original', tag: null })
  })

  it('作品看默认造型的标签', () => {
    expect(
      characterWork(
        {
          workOverride: null,
          looks: [
            look(['chibi'], [], false),
            look(['denia_(wuthering_waves)']),
          ],
        },
        'zh',
      ).label,
    ).toBe('鸣潮')
  })

  it('张数 = 所有造型上的图 + 用她出过的图', () => {
    expect(
      characterImageCount({
        looks: [look([], ['a']), look([], ['b', 'c'], false)],
        generationCount: 4,
      }),
    ).toBe(7)
  })
})
