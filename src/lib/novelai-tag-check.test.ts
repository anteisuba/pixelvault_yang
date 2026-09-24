import { describe, expect, it } from 'vitest'

import {
  applyNovelAiTagFixes,
  findLocalNovelAiTag,
  listCheckableNovelAiTags,
  matchNovelAiTagStyle,
  pickClosestNovelAiTag,
} from './novelai-tag-check'

describe('NAI tag check · pure half', () => {
  it('lists only checkable tags: strips weights, skips prefixes, NAI quality words, long phrases and Text:', () => {
    expect(
      listCheckableNovelAiTags(
        '1girl, {{black hair}}, 1.2::cherry blossom::, rain:1.2, artist:foo, very aesthetic, year 2024, a girl standing alone under the rain at night, Text: hello world',
      ),
    ).toEqual(['1girl', 'black hair', 'cherry blossom', 'rain'])
  })

  it('local dictionary: exact tags stay, aliases resolve to the canonical tag', () => {
    expect(findLocalNovelAiTag('black hair')).toBe('black_hair')
    expect(findLocalNovelAiTag('Cherry_Blossom')).toBe('cherry_blossoms')
    expect(findLocalNovelAiTag('sakura tree')).toBeNull()
  })

  it('closest candidate: same tag = itself, near spelling = fix, far = not found', () => {
    expect(pickClosestNovelAiTag('black hair', ['black hair', 'black'])).toBe(
      'black hair',
    )
    expect(pickClosestNovelAiTag('pleated skirts', ['pleated skirt'])).toBe(
      'pleated skirt',
    )
    expect(pickClosestNovelAiTag('hair black', ['black hair'])).toBe(
      'black hair',
    )
    expect(pickClosestNovelAiTag('sakura tree', ['sakura (flower)'])).toBeNull()
  })

  it('⛔ a different word is never "closest" (waist ≠ thigh), a one-letter typo is', () => {
    expect(
      pickClosestNovelAiTag('multiple waist straps', ['multiple thigh straps']),
    ).toBeNull()
    expect(pickClosestNovelAiTag('pleeted skirt', ['pleated skirt'])).toBe(
      'pleated skirt',
    )
    expect(pickClosestNovelAiTag('red bow', ['red box'])).toBeNull()
  })

  it('keeps the prompt spelling style (spaces vs underscores)', () => {
    expect(matchNovelAiTagStyle('cherry blossom', 'cherry_blossoms')).toBe(
      'cherry blossoms',
    )
    expect(matchNovelAiTagStyle('cherry_blossom', 'cherry blossoms')).toBe(
      'cherry_blossoms',
    )
  })

  it('writes fixes back without touching weights or the Text: part', () => {
    expect(
      applyNovelAiTagFixes(
        '1girl, {{cherry blossom}}, 1.2::pleated skirts::, Text: cherry blossom',
        [
          { from: 'cherry blossom', to: 'cherry blossoms' },
          { from: 'pleated skirts', to: 'pleated skirt' },
        ],
      ),
    ).toBe(
      '1girl, {{cherry blossoms}}, 1.2::pleated skirt::, Text: cherry blossom',
    )
  })

  it('drops a tag that only became a duplicate through a fix', () => {
    expect(
      applyNovelAiTagFixes('1girl, cherry tree, cherry blossoms, rain, rain', [
        { from: 'cherry tree', to: 'cherry blossoms' },
      ]),
    ).toBe('1girl, cherry blossoms, rain, rain')
  })
})
