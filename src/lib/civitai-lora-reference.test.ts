import { describe, expect, it } from 'vitest'

import {
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
})
