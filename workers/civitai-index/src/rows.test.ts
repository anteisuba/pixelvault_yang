import { describe, expect, it } from 'vitest'

import { cjkGrams, mapFullHit, mapLightHit } from './rows'

const baseHit = {
  id: 7,
  name: 'Sample',
  type: 'LORA',
  nsfwLevel: [1, 16],
  tags: [{ name: 'style' }],
  metrics: { downloadCount: 3, thumbsUpCount: 1 },
  lastVersionAtUnix: 1_700_000_000_000,
  createdAt: '2026-01-02T00:00:00.000Z',
  user: { username: 'maker' },
  version: {
    id: 70,
    name: 'v2',
    baseModel: ' Illustrious ',
    trainedWords: ['sample_trigger'],
    hashData: [{ hash: 'ABC', type: 'AutoV3' }],
  },
  images: [] as { id: number; url: string; nsfwLevel: number }[],
}

describe('mapFullHit', () => {
  it('keeps safe images even when the first six are all explicit', () => {
    const explicit = Array.from({ length: 8 }, (_, index) => ({
      id: index,
      url: `x-${index}`,
      nsfwLevel: 16,
    }))
    const row = mapFullHit(
      {
        ...baseHit,
        images: [...explicit, { id: 99, url: 'safe', nsfwLevel: 1 }],
      },
      5,
    )
    expect(row?.images.map((image) => image.id)).toEqual([0, 1, 2, 3, 4, 5, 99])
    expect(row).toMatchObject({
      nsfwLevelMin: 1,
      nsfwLevelMax: 16,
      baseModel: 'Illustrious',
      hashAutoV3: 'ABC',
      createdAt: Date.parse('2026-01-02T00:00:00.000Z'),
      refreshedAt: 5,
    })
  })

  it('skips a model without a current version', () => {
    expect(mapFullHit({ ...baseHit, version: null }, 1)).toBeNull()
  })
})

describe('mapLightHit', () => {
  it('ignores metrics in the fingerprint but tracks the name', () => {
    const a = mapLightHit(baseHit)
    const b = mapLightHit({ ...baseHit, metrics: { downloadCount: 999 } })
    const c = mapLightHit({ ...baseHit, name: 'Renamed' })
    expect(a?.lightFp).toBe(b?.lightFp)
    expect(a?.lightFp).not.toBe(c?.lightFp)
    expect(b?.downloadCount).toBe(999)
  })

  it('returns null for a hit it cannot read', () => {
    expect(mapLightHit({ name: 'no id' })).toBeNull()
  })
})

describe('cjkGrams', () => {
  it('splits each CJK run into single characters and adjacent pairs', () => {
    expect(cjkGrams('鸣潮 珂莱塔 (Wuthering Waves)').split(' ')).toEqual([
      '鸣',
      '鸣潮',
      '潮',
      '珂',
      '珂莱',
      '莱',
      '莱塔',
      '塔',
    ])
  })

  it('is empty for names without CJK characters', () => {
    expect(cjkGrams('Silver Hair')).toBe('')
  })
})
