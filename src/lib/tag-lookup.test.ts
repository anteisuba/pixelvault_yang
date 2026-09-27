import { describe, expect, it } from 'vitest'

import {
  addLookupTags,
  artistPromptTag,
  compactPostCount,
  danbooruTagSearchUrl,
  displayDanbooruTag,
  hasTag,
  lookupAliasLine,
  toggleArtistTag,
} from '@/lib/tag-lookup'

const chip = (text: string) => ({ text, weight: 1 })

describe('tag lookup rules', () => {
  it('writes Danbooru names the way the tag studio does', () => {
    expect(displayDanbooruTag('denia_(wuthering_waves)')).toBe(
      'denia (wuthering waves)',
    )
    expect(artistPromptTag('mizuiro_sora')).toBe('artist:mizuiro sora')
  })

  it('shortens post counts per locale', () => {
    expect(compactPostCount(152000, 'en')).toBe('152K')
    expect(compactPostCount(152000, 'zh-CN')).toBe('15.2万')
    expect(compactPostCount(260, 'zh-CN')).toBe('260')
  })

  it('adds new tags after the leading artist tags and skips ones already there', () => {
    expect(
      addLookupTags(
        [chip('artist:sora'), chip('1girl'), chip('Twintails')],
        ['hatsune miku', 'twintails', 'aqua hair'],
      ),
    ).toEqual([
      chip('artist:sora'),
      chip('hatsune miku'),
      chip('aqua hair'),
      chip('1girl'),
      chip('Twintails'),
    ])
    expect(addLookupTags([], ['solo'])).toEqual([chip('solo')])
  })

  it('toggles an artist tag at the very front', () => {
    const on = toggleArtistTag([chip('1girl')], 'artist:mizuiro sora')
    expect(on).toEqual([chip('artist:mizuiro sora'), chip('1girl')])
    expect(hasTag(on, 'ARTIST:Mizuiro Sora')).toBe(true)
    expect(toggleArtistTag(on, 'artist:mizuiro sora')).toEqual([chip('1girl')])
  })

  it('reads aliases the way people write them: spaces, no repeats of the title, the first few', () => {
    expect(
      lookupAliasLine(
        [
          '初音ミク',
          'Hatsune_Miku',
          '初音未来',
          '初音ミク',
          'miku_monday',
          'mikumonday',
        ],
        'hatsune_miku',
        4,
      ),
    ).toEqual(['初音ミク', '初音未来', 'miku monday', 'mikumonday'])
  })

  it('links a miss to Danbooru’s own tag search', () => {
    expect(danbooruTagSearchUrl(' Zz Qx ')).toBe(
      'https://danbooru.donmai.us/tags?search%5Bname_matches%5D=*zz_qx*',
    )
  })
})
