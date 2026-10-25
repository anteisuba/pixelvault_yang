import { describe, expect, it } from 'vitest'

import { danbooruTagMeaningText } from '@/lib/danbooru-tag-meaning'

describe('danbooruTagMeaningText', () => {
  it('puts the three languages in one line, then the note', () => {
    expect(
      danbooruTagMeaningText({
        tag: 'cat_ears',
        zh: '猫耳',
        ja: '猫耳',
        zhNote: '头上长着猫一样的耳朵',
      }),
    ).toBe('cat ears / 猫耳 / 猫耳 — 头上长着猫一样的耳朵')
  })

  it('skips missing names', () => {
    expect(
      danbooruTagMeaningText({ tag: 'wlop', zh: null, ja: ' ', zhNote: null }),
    ).toBe('wlop')
  })
})
