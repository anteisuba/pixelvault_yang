import { describe, expect, it } from 'vitest'

import {
  buildCivitaiLoraNameSearchQueries,
  normalizeOptionalCivitaiHash,
  toCivitaiModelSearchQuery,
} from './civitai-lora-reference'

describe('civitai LoRA reference helpers', () => {
  it('normalizes valid Civitai hashes and drops malformed values', () => {
    expect(normalizeOptionalCivitaiHash('  AABBCCDDEEFF  ')).toBe(
      'aabbccddeeff',
    )
    expect(normalizeOptionalCivitaiHash('not-hex!!')).toBeUndefined()
    expect(normalizeOptionalCivitaiHash('abc')).toBeUndefined()
  })

  it('uses the same camelCase split for Civitai model search links', () => {
    expect(toCivitaiModelSearchQuery('EnchantingEyesIllustrious')).toBe(
      'Enchanting Eyes Illustrious',
    )
    expect(
      toCivitaiModelSearchQuery(
        'detailed_hand-focus style  illustriousXL v1.1',
      ),
    ).toBe('detailed hand focus style illustrious XL v1.1')
  })

  it('repairs mojibake before building Civitai model search links', () => {
    expect(toCivitaiModelSearchQuery('ææ¥æ¹èç»æ«å°å²ä»£çäºº')).toBe(
      '明日方舟终末地岁代理人',
    )
  })

  it('builds progressive name-search queries that drop version + pack prefixes', () => {
    const queries = buildCivitaiLoraNameSearchQueries(
      'illus01_style_collection_elpe_v0.22',
    )
    expect(queries[0]).toBe('illus01 style collection elpe v0.22')
    expect(queries).toContain('illus01 style collection elpe')
    // Leading pack token dropped so meilisearch can hit "Style Collection [IL]"
    expect(queries).toContain('style collection elpe')
    expect(queries.length).toBeLessThanOrEqual(4)
  })
})
