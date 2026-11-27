import { describe, expect, it } from 'vitest'

import { CURATED_NAI_ARTISTS } from '@/constants/artist-style-index'
import {
  formatCuratedArtistLine,
  matchArtistStyleCategories,
  searchCuratedArtists,
} from './artist-style-index'

describe('artist-style-index', () => {
  it('contains valid deduplicated Danbooru artist entries across style categories', () => {
    const tags = new Set(CURATED_NAI_ARTISTS.map((item) => item.tag))
    expect(tags.size).toBeGreaterThanOrEqual(80)
    for (const item of CURATED_NAI_ARTISTS) {
      expect(item.tag).not.toContain(' ')
      expect(item.styles.length).toBeGreaterThan(0)
      expect(item.role.length).toBeGreaterThan(5)
    }
  })

  it('matches Chinese and English style vibes directly to suitable NAI artists', () => {
    expect(matchArtistStyleCategories('清透 水彩 电影光')).toEqual(
      expect.arrayContaining(['luminous', 'watercolor', 'cinematic']),
    )

    const nightCinema = searchCuratedArtists('雨夜 电影感 冷蓝 星空')
    expect(nightCinema.length).toBeGreaterThan(0)
    expect(nightCinema.map((m) => m.artist.tag)).toContain('guweiz')

    const retroCel = searchCuratedArtists('90年代 复古 赛璐璐 胶片')
    expect(retroCel.map((m) => m.artist.tag)).toContain('sadamoto_yoshiyuki')

    const popFlat = searchCuratedArtists('高饱和 波普 平涂 潮酷')
    expect(popFlat.map((m) => m.artist.tag)).toContain('mika_pikazo')
  })

  it('formats lines with explicit NovelAI artist: syntax and role', () => {
    const match = searchCuratedArtists('ask_(askzy)')[0]
    expect(match).toBeDefined()
    const line = formatCuratedArtistLine(match!.artist, '标签·')
    expect(line).toContain('标签·ask_(askzy)')
    expect(line).toContain('artist:ask (askzy)')
    expect(line).toContain('weight ')
  })
})
